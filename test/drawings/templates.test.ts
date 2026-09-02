// Drawing defaults and named templates over the revisioned resource contract. The in-memory
// adapter is the fixture: it mints revisions, conflicts on a stale one, and answers not-found, so a
// test here exercises the same contract a server-backed host implements.
import { describe, expect, it } from 'vitest'
import { memorySaveLoadAdapter } from '../../src/resources'
import { DEFAULT_PRESET_NAME, decodePreset, DrawingTemplates } from '../../src/drawings/index'

const templates = () => new DrawingTemplates(memorySaveLoadAdapter().templates('drawing'))

describe('named drawing templates', () => {
  it('lists only the tool they were saved for', async () => {
    const t = templates()
    await t.save('trend_line', 'Thick red', { style: { lineWidth: 4 } })
    await t.save('rectangle', 'Shaded', { style: { fillOpacity: 0.2 } })
    expect((await t.list('trend_line')).map((r) => r.name)).toEqual(['Thick red'])
    expect((await t.list('rectangle')).map((r) => r.name)).toEqual(['Shaded'])
    expect(await t.list('ray')).toEqual([])
  })

  it('replaces a template saved over its own name instead of stacking a duplicate', async () => {
    const t = templates()
    await t.save('trend_line', 'Mine', { style: { lineWidth: 1 } })
    await t.save('trend_line', 'Mine', { style: { lineWidth: 9 } })
    const rows = await t.list('trend_line')
    expect(rows).toHaveLength(1)
    const loaded = await t.load(rows[0]!.id)
    expect(loaded?.template.style).toEqual({ lineWidth: 9 })
  })

  it('loads one back with its identity and revision', async () => {
    const t = templates()
    const saved = await t.save('ray', 'Dashed', { style: { lineStyle: 'dashed' } })
    expect(saved.kind).toBe('ok')
    const rows = await t.list('ray')
    const loaded = await t.load(rows[0]!.id)
    expect(loaded?.template.name).toBe('Dashed')
    expect(loaded?.template.tool).toBe('ray')
    expect(loaded?.ref.revision).toBeTruthy()
  })

  it('answers null for an id another surface already deleted', async () => {
    const t = templates()
    await t.save('ray', 'Gone', {})
    const rows = await t.list('ray')
    const loaded = await t.load(rows[0]!.id)
    expect(await t.remove(loaded!.ref)).toEqual({ kind: 'ok', ref: loaded!.ref })
    expect(await t.load(rows[0]!.id)).toBeNull()
  })

  it('conflicts on a stale revision rather than overwriting the newer document', async () => {
    const t = templates()
    await t.save('ray', 'Mine', { style: { lineWidth: 1 } })
    const stale = (await t.load((await t.list('ray'))[0]!.id))!.ref
    await t.save('ray', 'Mine', { style: { lineWidth: 2 } })
    const outcome = await t.remove(stale)
    expect(outcome.kind).toBe('conflict')
  })

  it('abandons in flight when the caller aborts, so a late answer never lands', async () => {
    const t = templates()
    const controller = new AbortController()
    controller.abort()
    await expect(t.list('ray', controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
  })
})

describe('a tool default', () => {
  it('is empty until something is remembered', async () => {
    expect(await templates().defaultFor('trend_line')).toEqual({})
  })

  it('is remembered silently and overwritten by the next edit', async () => {
    const t = templates()
    await t.rememberDefault('trend_line', { style: { lineColor: '#ff0000' } })
    await t.rememberDefault('trend_line', { style: { lineColor: '#00ff00' } })
    expect(await t.defaultFor('trend_line')).toEqual({ style: { lineColor: '#00ff00' } })
  })

  it('never shows up in the template list a trader picks from', async () => {
    const t = templates()
    await t.rememberDefault('trend_line', { style: { lineWidth: 3 } })
    await t.save('trend_line', 'Named', { style: { lineWidth: 5 } })
    expect((await t.list('trend_line')).map((r) => r.name)).toEqual(['Named'])
    expect(DEFAULT_PRESET_NAME).toBe('')
  })

  it('is forgotten on request, and forgetting one that is absent is not an error', async () => {
    const t = templates()
    expect(await t.clearDefault('ray')).toBeNull()
    await t.rememberDefault('ray', { style: { lineWidth: 2 } })
    expect((await t.clearDefault('ray'))?.kind).toBe('ok')
    expect(await t.defaultFor('ray')).toEqual({})
  })

  it('keeps each tool separate', async () => {
    const t = templates()
    await t.rememberDefault('ray', { style: { lineWidth: 2 } })
    expect(await t.defaultFor('trend_line')).toEqual({})
  })
})

describe('reading a stored preset', () => {
  it('is total: a corrupt row reads as an empty preset rather than taking the picker down', () => {
    for (const raw of ['', 'not json', 'null', '[]', '"text"', '{"style":5,"props":[]}']) expect(decodePreset(raw), raw).toEqual({})
  })

  it('keeps the two halves it understands and drops anything else', () => {
    expect(decodePreset(JSON.stringify({ style: { lineWidth: 2 }, props: { levels: [1] }, junk: 1 }))).toEqual({
      style: { lineWidth: 2 },
      props: { levels: [1] },
    })
  })
})

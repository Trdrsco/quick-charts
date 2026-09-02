// The revisioned saved-resource contract, proved through its in-memory reference store. These are
// the behaviours the plan's acceptance gate names: resource identity, revision return, conditional
// write, typed conflict, deletion, not-found, and an aborted call. The store under test is the one
// a host copies from, so a second host adapter that passes the same assertions is compatible by
// construction.
import { describe, expect, it } from 'vitest'
import { memorySaveLoadAdapter, ResourceAbortError, type ChartBody, type ResourceRef } from '../src/resources'

const chart = (name: string, content = 'blob'): ChartBody => ({ name, symbol: 'ESZ2026', timeframe: '5m', content })

describe('a resource store', () => {
  it('mints an id and a revision on create, and returns the stored metadata', async () => {
    const adapter = memorySaveLoadAdapter({ now: () => 1_700_000_000_000 })
    const written = await adapter.charts.create(chart('Morning'))
    expect(written.kind).toBe('ok')
    if (written.kind !== 'ok') return
    expect(written.ref.id.length).toBeGreaterThan(0)
    expect(written.ref.revision.length).toBeGreaterThan(0)
    // The listing row carries the row's ref, so a picker can open or delete it without a second read.
    expect(written.value).toEqual({ id: written.ref.id, revision: written.ref.revision, name: 'Morning', symbol: 'ESZ2026', timeframe: '5m', updatedAt: 1_700_000_000_000 })
  })

  it('loads the body at the revision it was read at', async () => {
    const adapter = memorySaveLoadAdapter()
    const written = await adapter.charts.create(chart('Morning'))
    if (written.kind !== 'ok') throw new Error('create must succeed')
    const read = await adapter.charts.load(written.ref.id)
    expect(read?.ref).toEqual(written.ref)
    expect(read?.body).toEqual(chart('Morning'))
  })

  it('answers null for an id it does not hold', async () => {
    expect(await memorySaveLoadAdapter().charts.load('nobody')).toBeNull()
  })

  it('lists metadata without content', async () => {
    const adapter = memorySaveLoadAdapter()
    await adapter.charts.create(chart('One'))
    await adapter.charts.create(chart('Two'))
    const rows = await adapter.charts.list()
    expect(rows.map((r) => r.name).sort()).toEqual(['One', 'Two'])
    expect(rows.every((r) => !('content' in r))).toBe(true)
  })

  it('advances the revision on every accepted write', async () => {
    const adapter = memorySaveLoadAdapter()
    const created = await adapter.charts.create(chart('One'))
    if (created.kind !== 'ok') throw new Error('create must succeed')
    const updated = await adapter.charts.update(created.ref, chart('One', 'second'))
    if (updated.kind !== 'ok') throw new Error('update must succeed')
    expect(updated.ref.id).toBe(created.ref.id)
    expect(updated.ref.revision).not.toBe(created.ref.revision)
    expect((await adapter.charts.load(created.ref.id))?.body.content).toBe('second')
  })

  it('refuses a write against a stale revision and hands back the current ref', async () => {
    const adapter = memorySaveLoadAdapter()
    const created = await adapter.charts.create(chart('One'))
    if (created.kind !== 'ok') throw new Error('create must succeed')
    const first = await adapter.charts.update(created.ref, chart('One', 'from tab A'))
    if (first.kind !== 'ok') throw new Error('the first update must succeed')

    const stale = await adapter.charts.update(created.ref, chart('One', 'from tab B'))
    expect(stale).toEqual({ kind: 'conflict', current: first.ref })
    expect((await adapter.charts.load(created.ref.id))?.body.content).toBe('from tab A')
  })

  it('refuses a delete against a stale revision', async () => {
    const adapter = memorySaveLoadAdapter()
    const created = await adapter.charts.create(chart('One'))
    if (created.kind !== 'ok') throw new Error('create must succeed')
    const updated = await adapter.charts.update(created.ref, chart('One', 'newer'))
    if (updated.kind !== 'ok') throw new Error('update must succeed')

    expect(await adapter.charts.remove(created.ref)).toEqual({ kind: 'conflict', current: updated.ref })
    expect(await adapter.charts.load(created.ref.id)).not.toBeNull()
    expect(await adapter.charts.remove(updated.ref)).toEqual({ kind: 'ok', ref: updated.ref })
    expect(await adapter.charts.load(created.ref.id)).toBeNull()
  })

  it('reports not-found for a write against an id that is gone', async () => {
    const adapter = memorySaveLoadAdapter()
    const ghost: ResourceRef = { id: 'gone', revision: 'rev-1' }
    expect(await adapter.charts.update(ghost, chart('One'))).toEqual({ kind: 'not-found' })
    expect(await adapter.charts.remove(ghost)).toEqual({ kind: 'not-found' })
  })
})

describe('abort', () => {
  const controller = (): AbortSignal => {
    const c = new AbortController()
    c.abort()
    return c.signal
  }

  it('rejects every call on an already-aborted signal', async () => {
    const adapter = memorySaveLoadAdapter()
    const created = await adapter.charts.create(chart('One'))
    if (created.kind !== 'ok') throw new Error('create must succeed')
    await expect(adapter.charts.list(controller())).rejects.toBeInstanceOf(ResourceAbortError)
    await expect(adapter.charts.load(created.ref.id, controller())).rejects.toBeInstanceOf(ResourceAbortError)
    await expect(adapter.charts.create(chart('Two'), controller())).rejects.toBeInstanceOf(ResourceAbortError)
    await expect(adapter.charts.update(created.ref, chart('Two'), controller())).rejects.toBeInstanceOf(ResourceAbortError)
    await expect(adapter.charts.remove(created.ref, controller())).rejects.toBeInstanceOf(ResourceAbortError)
  })

  it('names the error AbortError, so a caller branches on one name whatever the host threw', async () => {
    await expect(memorySaveLoadAdapter().charts.list(controller())).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('changes nothing when it aborts', async () => {
    const adapter = memorySaveLoadAdapter()
    await adapter.charts.create(chart('One')).catch(() => undefined)
    await adapter.charts.create(chart('Two'), controller()).catch(() => undefined)
    expect((await adapter.charts.list()).map((r) => r.name)).toEqual(['One'])
  })
})

describe('the four resource families', () => {
  it('keeps charts, layouts, drawings and templates apart', async () => {
    const adapter = memorySaveLoadAdapter()
    await adapter.charts.create(chart('One'))
    await adapter.layouts.create({ name: 'Four up', content: 'layout' })
    await adapter.drawings({ symbol: 'ESZ2026' }).create({ content: 'lines' })
    await adapter.templates('study').create({ name: 'My RSI', content: 'study' })

    expect(await adapter.charts.list()).toHaveLength(1)
    expect(await adapter.layouts.list()).toHaveLength(1)
    expect(await adapter.drawings({ symbol: 'ESZ2026' }).list()).toHaveLength(1)
    expect(await adapter.templates('study').list()).toHaveLength(1)
    expect(await adapter.templates('drawing').list()).toHaveLength(0)
  })

  it('scopes drawings by symbol, and binds a copy to one chart when a chartId is given', async () => {
    const adapter = memorySaveLoadAdapter()
    await adapter.drawings({ symbol: 'ESZ2026' }).create({ content: 'shared' })
    await adapter.drawings({ symbol: 'ESZ2026', chartId: 'c1' }).create({ content: 'bound' })

    expect((await adapter.drawings({ symbol: 'ESZ2026' }).list())).toHaveLength(1)
    expect((await adapter.drawings({ symbol: 'NQZ2026' }).list())).toHaveLength(0)
    const bound = await adapter.drawings({ symbol: 'ESZ2026', chartId: 'c1' }).list()
    expect(bound).toHaveLength(1)
    const read = await adapter.drawings({ symbol: 'ESZ2026', chartId: 'c1' }).load(bound[0]!.id)
    expect(read?.body.content).toBe('bound')
  })

  it('carries a drawing template tool onto its listing row and leaves study rows without one', async () => {
    const adapter = memorySaveLoadAdapter()
    await adapter.templates('drawing').create({ name: 'Thick', tool: 'trend-line', content: 't' })
    await adapter.templates('study').create({ name: 'Fast', content: 's' })
    expect((await adapter.templates('drawing').list())[0]?.tool).toBe('trend-line')
    expect('tool' in ((await adapter.templates('study').list())[0] ?? {})).toBe(false)
  })
})

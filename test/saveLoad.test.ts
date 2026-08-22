// The save/load adapter contract, pinned on the DEFAULT (storage-backed) implementation — the
// behavior a host inherits with no backend, and the reference the engine-backed adapter must
// match: meta-only listings, content by id, index integrity across overwrite/remove, drawing
// scope separation (shared-by-symbol vs chart-bound), and tool-scoped template names.
import { describe, expect, it } from 'vitest'
import { memoryChartStorage, storageSaveLoadAdapter } from '../src/index'

const fresh = () => storageSaveLoadAdapter(memoryChartStorage())

describe('storageSaveLoadAdapter — named charts', () => {
  it('save without an id CREATES (new id each time); with an id OVERWRITES in place', async () => {
    const a = fresh()
    const id1 = await a.saveChart({ name: 'ES scalp', symbol: 'ES', timeframe: '1m', content: 'c1' })
    const id2 = await a.saveChart({ name: 'NQ swing', symbol: 'NQ', timeframe: '1h', content: 'c2' })
    expect(id1).not.toBe(id2)
    expect((await a.listCharts()).map((r) => r.name).sort()).toEqual(['ES scalp', 'NQ swing'])

    await a.saveChart({ name: 'ES scalp v2', symbol: 'ES', timeframe: '5m', content: 'c1b' }, id1)
    const rows = await a.listCharts()
    expect(rows).toHaveLength(2) // overwrite never duplicates the row
    const row = rows.find((r) => r.id === id1)!
    expect(row.name).toBe('ES scalp v2')
    expect(row.timeframe).toBe('5m')
    await expect(a.loadChart(id1)).resolves.toBe('c1b')
  })

  it('the listing is META ONLY — content loads by id, and an unknown id rejects', async () => {
    const a = fresh()
    const id = await a.saveChart({ name: 'n', symbol: 'ES', timeframe: '1m', content: 'the-blob' })
    const rows = await a.listCharts()
    expect(JSON.stringify(rows)).not.toContain('the-blob')
    await expect(a.loadChart(id)).resolves.toBe('the-blob')
    await expect(a.loadChart('nope')).rejects.toThrow(/no saved chart/)
  })

  it('remove deletes the content AND the index row', async () => {
    const a = fresh()
    const id = await a.saveChart({ name: 'n', symbol: 'ES', timeframe: '1m', content: 'c' })
    await a.removeChart(id)
    expect(await a.listCharts()).toEqual([])
    await expect(a.loadChart(id)).rejects.toThrow()
  })
})

describe('storageSaveLoadAdapter — drawings scopes', () => {
  it('the symbol scope is shared; a chartId binds a SEPARATE copy; absence reads null', async () => {
    const a = fresh()
    await a.saveDrawings({ symbol: 'ES' }, 'shared')
    await a.saveDrawings({ symbol: 'ES', chartId: 'chart-1' }, 'bound')
    await expect(a.loadDrawings({ symbol: 'ES' })).resolves.toBe('shared')
    await expect(a.loadDrawings({ symbol: 'ES', chartId: 'chart-1' })).resolves.toBe('bound')
    await expect(a.loadDrawings({ symbol: 'NQ' })).resolves.toBeNull()
  })

  it('symbols with separator characters cannot collide (keys encode)', async () => {
    const a = fresh()
    await a.saveDrawings({ symbol: 'A:B' }, 'colon-symbol')
    await a.saveDrawings({ symbol: 'A', chartId: 'B' }, 'bound-copy')
    await expect(a.loadDrawings({ symbol: 'A:B' })).resolves.toBe('colon-symbol')
    await expect(a.loadDrawings({ symbol: 'A', chartId: 'B' })).resolves.toBe('bound-copy')
  })
})

describe('storageSaveLoadAdapter — named templates', () => {
  it('kinds are separate stores; save/load/remove round-trip by name', async () => {
    const a = fresh()
    await a.templates('palette').save('Dark Ice', '{"appearance":{}}')
    await a.templates('study').save('Momentum set', '{"inds":[]}')
    await expect(a.templates('palette').load('Dark Ice')).resolves.toBe('{"appearance":{}}')
    await expect(a.templates('study').load('Dark Ice')).resolves.toBeNull() // other kind, other store
    await a.templates('palette').remove('Dark Ice')
    await expect(a.templates('palette').load('Dark Ice')).resolves.toBeNull()
  })

  it('drawing templates are TOOL-scoped: one name on two tools is two templates; a tool-less name with spaces never reads as tool-scoped', async () => {
    const a = fresh()
    const t = a.templates('drawing')
    await t.save('Bold', 'trend-style', 'trendline')
    await t.save('Bold', 'rect-style', 'rectangle')
    await t.save('My Default Look', 'plain-style')
    await expect(t.load('Bold', 'trendline')).resolves.toBe('trend-style')
    await expect(t.load('Bold', 'rectangle')).resolves.toBe('rect-style')
    await expect(t.load('My Default Look')).resolves.toBe('plain-style')
    const rows = await t.list()
    expect(rows).toHaveLength(3)
    expect(rows.find((r) => r.name === 'My Default Look')?.tool).toBeUndefined()
    expect(rows.filter((r) => r.name === 'Bold').map((r) => r.tool).sort()).toEqual(['rectangle', 'trendline'])
  })
})

describe('storageSaveLoadAdapter — settings passthrough', () => {
  it('settings IS the backing store, so widget keys and entities share one adapter', () => {
    const kv = memoryChartStorage()
    const a = storageSaveLoadAdapter(kv)
    a.settings.set('trdrs.chart.widget.symbol.v1', 'NQ')
    expect(kv.get('trdrs.chart.widget.symbol.v1')).toBe('NQ')
  })
})

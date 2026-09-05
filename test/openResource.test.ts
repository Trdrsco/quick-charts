import { describe, expect, it } from 'vitest'
import { openResourceController } from '../src/openResource'
import { memorySaveLoadAdapter, type ChartBody, type ChartMeta, type ResourceStore } from '../src/resources'
import { createChartI18n } from '../src/i18n'
import saveLoadSrc from '../src/widget/saveLoad.ts?raw'
import chartSrc from '../src/widget/chart.ts?raw'
import createSrc from '../src/widget/create.ts?raw'
import layoutSrc from '../src/widget/layout.ts?raw'
import drawingsSrc from '../src/drawings/layer/documents.ts?raw'

// The open resource: what the widget holds for its saved chart and the layout for its saved
// layout. A save is an update at the revision the resource was opened at; a copy or a fresh chart
// creates; a refusal is a typed outcome carrying the catalog's copy, and nothing here writes over a
// newer revision.

const body = (name: string, timeframe = '5m'): ChartBody => ({ name, symbol: 'ES', timeframe, content: '{}' })
const t = createChartI18n().t

describe('openResourceController', () => {
  it('creates when nothing is open, then updates at the held revision and adopts the new one', async () => {
    const adapter = memorySaveLoadAdapter({ now: () => 1 })
    const open = openResourceController<ChartMeta, ChartBody>({ store: () => adapter.charts, t: () => t })
    expect(open.current()).toBeNull()
    const first = await open.save(body('Morning'))
    expect(first.kind).toBe('ok')
    const held = open.current()!
    expect(held.name).toBe('Morning')
    const second = await open.save(body('Morning', '15m'))
    expect(second.kind).toBe('ok')
    expect(open.current()!.ref.id).toBe(held.ref.id)
    expect(open.current()!.ref.revision).not.toBe(held.ref.revision)
    expect((await adapter.charts.load(held.ref.id))!.body.timeframe).toBe('15m')
  })

  it('a save after the resource moved on is a conflict with the catalog copy, and the newer work stands', async () => {
    const adapter = memorySaveLoadAdapter()
    const open = openResourceController<ChartMeta, ChartBody>({ store: () => adapter.charts, t: () => t })
    await open.save(body('Morning'))
    const ref = open.current()!.ref
    // Another tab saves first.
    const elsewhere = await adapter.charts.update(ref, body('Morning', '1h'))
    expect(elsewhere.kind).toBe('ok')
    const refused = await open.save(body('Morning', '1d'))
    expect(refused).toEqual({ kind: 'conflict', current: (elsewhere as { ref: unknown }).ref, message: t('host.saveConflict') })
    expect((await adapter.charts.load(ref.id))!.body.timeframe).toBe('1h')
  })

  it('asNew creates a copy and leaves the original where it was', async () => {
    const adapter = memorySaveLoadAdapter()
    const open = openResourceController<ChartMeta, ChartBody>({ store: () => adapter.charts, t: () => t })
    await open.save(body('Morning'))
    const original = open.current()!.ref
    const copy = await open.save(body('Morning copy'), { asNew: true })
    expect(copy.kind).toBe('ok')
    expect(open.current()!.ref.id).not.toBe(original.id)
    expect((await adapter.charts.list()).map((r) => r.name).sort()).toEqual(['Morning', 'Morning copy'])
  })

  it('load opens the resource at its ref; an unknown id is not-found with the catalog copy', async () => {
    const adapter = memorySaveLoadAdapter()
    const created = await adapter.charts.create(body('Evening'))
    if (created.kind !== 'ok') throw new Error('unreachable')
    const open = openResourceController<ChartMeta, ChartBody>({ store: () => adapter.charts, t: () => t })
    const loaded = await open.load(created.ref.id)
    expect(loaded).toEqual({ kind: 'ok', ref: created.ref, body: body('Evening') })
    expect(open.current()).toEqual({ ref: created.ref, name: 'Evening' })
    expect(await open.load('ghost')).toEqual({ kind: 'not-found', message: t('host.saveNotFound') })
  })

  it('a later load supersedes one still in flight: its response is dropped even when it lands last, and the call rejects as aborted', async () => {
    const adapter = memorySaveLoadAdapter()
    const a = await adapter.charts.create(body('A'))
    const b = await adapter.charts.create(body('B', '1h'))
    if (a.kind !== 'ok' || b.kind !== 'ok') throw new Error('unreachable')
    // A store whose answers land when the test releases them, and which ignores the signal it was
    // handed: the hardest case, where the superseded response still arrives.
    const release = new Map<string, () => void>()
    const signals = new Map<string, AbortSignal | undefined>()
    const store: ResourceStore<ChartMeta, ChartBody> = {
      ...adapter.charts,
      load: (id, signal) =>
        new Promise((resolve, reject) => {
          signals.set(id, signal)
          release.set(id, () => adapter.charts.load(id).then(resolve, reject))
        }),
    }
    const open = openResourceController<ChartMeta, ChartBody>({ store: () => store, t: () => t })
    const first = open.load(a.ref.id)
    const second = open.load(b.ref.id)
    expect(signals.get(a.ref.id)!.aborted).toBe(true) // the newer load aborted the older request
    expect(signals.get(b.ref.id)!.aborted).toBe(false)
    release.get(b.ref.id)!()
    expect(await second).toEqual({ kind: 'ok', ref: b.ref, body: body('B', '1h') })
    release.get(a.ref.id)!() // A's answer arrives after B is open
    await expect(first).rejects.toMatchObject({ name: 'AbortError' })
    expect(open.current()).toEqual({ ref: b.ref, name: 'B' })
  })

  it("a caller's own abort rides along and rejects its load the same way", async () => {
    const adapter = memorySaveLoadAdapter()
    const created = await adapter.charts.create(body('A'))
    if (created.kind !== 'ok') throw new Error('unreachable')
    let answer: (() => void) | null = null
    const store: ResourceStore<ChartMeta, ChartBody> = {
      ...adapter.charts,
      load: (id) =>
        new Promise((resolve, reject) => {
          answer = () => adapter.charts.load(id).then(resolve, reject)
        }),
    }
    const open = openResourceController<ChartMeta, ChartBody>({ store: () => store, t: () => t })
    const controller = new AbortController()
    const loading = open.load(created.ref.id, controller.signal)
    controller.abort()
    answer!()
    await expect(loading).rejects.toMatchObject({ name: 'AbortError' })
    expect(open.current()).toBeNull()
  })

  it('remove deletes at the held revision, detaches, and a second remove is not-found', async () => {
    const adapter = memorySaveLoadAdapter()
    const open = openResourceController<ChartMeta, ChartBody>({ store: () => adapter.charts, t: () => t })
    await open.save(body('Morning'))
    expect(await open.remove()).toEqual({ kind: 'ok' })
    expect(open.current()).toBeNull()
    expect((await open.remove()).kind).toBe('not-found')
  })

  it('detach forgets the binding without touching the store, so the next save creates', async () => {
    const adapter = memorySaveLoadAdapter()
    const open = openResourceController<ChartMeta, ChartBody>({ store: () => adapter.charts, t: () => t })
    await open.save(body('Morning'))
    open.detach()
    await open.save(body('Morning again'))
    expect((await adapter.charts.list()).length).toBe(2)
  })

  it('rejects every verb without an adapter, because nothing was wired rather than something failed', async () => {
    const open = openResourceController<ChartMeta, ChartBody>({ store: () => null, t: () => t })
    await expect(open.save(body('x'))).rejects.toThrow(/no save\/load adapter/)
    await expect(open.load('x')).rejects.toThrow(/no save\/load adapter/)
  })
})

describe('the widget, the layout and the drawing layer run over the contract', () => {
  it('the chart saves the open chart through the controller and reads preferences from options.storage', () => {
    expect(saveLoadSrc).toContain(
      "const openChart = openResourceController<ChartMeta, ChartBody>({ store: () => deps.adapter?.charts ?? null, t: () => deps.i18n.t })",
    )
    expect(createSrc).toContain('const backing: ChartStorage = options.storage ?? memoryChartStorage()')
    expect(chartSrc).toContain('resources: deps.saveLoad,')
    for (const src of [saveLoadSrc, chartSrc, createSrc]) expect(src).not.toContain('localStorage')
  })

  it('the layout saves through the layouts family, never through charts', () => {
    expect(layoutSrc).toContain('store: () => deps.adapter?.layouts ?? null')
    expect(layoutSrc).not.toContain('adapter?.charts')
  })

  it('the drawing layer writes at the held ref, adopts the ref a refusal names, and never retries over it', () => {
    expect(drawingsSrc).toContain('const outcome = ref ? await store.update(ref, document) : await store.create(document)')
    // A refusal adopts the ref that stands, merges the stored document over the layer's own rows,
    // reports, and writes the merge once more; it never writes over the newer revision blind.
    expect(drawingsSrc).toContain("else if (outcome.kind === 'conflict') await adopt(symbol, outcome.current, retry)")
    expect(drawingsSrc).toContain('refs.set(symbol, current)')
    expect(drawingsSrc).toContain('docs.set(symbol, mergeDrawingDocuments(stored, documentFor(symbol)))')
    expect(drawingsSrc).toContain('deps.onConflict({ symbol, current })')
    expect(drawingsSrc).toContain('if (retry) upload(symbol, false)')
    expect(drawingsSrc).not.toContain('storage.set(')
    expect(drawingsSrc).not.toContain('localStorage')
  })
})

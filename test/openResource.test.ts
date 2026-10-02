import { describe, expect, it } from 'vitest'
import { openResourceController, ResourceRollbackError } from '../src/openResource'
import { memorySaveLoadAdapter, ResourceAbortError, type ChartBody, type ChartMeta, type ResourceStore } from '../src/resources'
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
  it('keeps command readiness false for the lifetime of a pending viewer load', async () => {
    const adapter = memorySaveLoadAdapter()
    const chosen = await adapter.charts.create(body('Chosen'))
    if (chosen.kind !== 'ok') throw new Error('unreachable')
    let release!: () => void
    const waiting = new Promise<void>((resolve) => { release = resolve })
    const store: ResourceStore<ChartMeta, ChartBody> = {
      ...adapter.charts,
      async load(id, signal) {
        await waiting
        return adapter.charts.load(id, signal)
      },
    }
    const open = openResourceController<ChartMeta, ChartBody>({ store: () => store, t: () => t })
    const loading = open.load(chosen.ref.id)
    try {
      expect(open.loading()).toBe(true)
    } finally {
      release()
    }
    expect((await loading).kind).toBe('ok')
    expect(open.current()?.ref.id).toBe(chosen.ref.id)
    expect(open.loading()).toBe(false)
  })

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

  it('a store that cannot answer is unavailable, carries what it failed with, and binds nothing', async () => {
    const adapter = memorySaveLoadAdapter()
    const created = await adapter.charts.create(body('A'))
    if (created.kind !== 'ok') throw new Error('unreachable')
    const offline = new Error('the network went away')
    const store: ResourceStore<ChartMeta, ChartBody> = { ...adapter.charts, load: () => Promise.reject(offline) }
    const open = openResourceController<ChartMeta, ChartBody>({ store: () => store, t: () => t })
    const applied: string[] = []
    const outcome = await open.load(created.ref.id, undefined, (found) => applied.push(found.name))
    // A store that could not be reached says nothing about the content, so this is its own answer,
    // and a caller tells it from a body it cannot read without reading either message.
    expect(outcome).toEqual({ kind: 'unavailable', message: t('host.loadUnavailable'), cause: offline })
    expect(applied).toEqual([])
    expect(open.current()).toBeNull()
  })

  it('a later load supersedes one still in flight: its response is dropped even when it lands last, and the call is cancelled', async () => {
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
    expect(await first).toEqual({ kind: 'cancelled' })
    expect(open.current()).toEqual({ ref: b.ref, name: 'B' })
  })

  it("a caller's own abort rides along and cancels its load the same way", async () => {
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
    expect(await loading).toEqual({ kind: 'cancelled' })
    expect(open.current()).toBeNull()
  })

  it('a store that rejects with the abort contract is cancelled, never mistaken for a store that failed', async () => {
    const adapter = memorySaveLoadAdapter()
    const created = await adapter.charts.create(body('A'))
    if (created.kind !== 'ok') throw new Error('unreachable')
    // Two shapes of the same contract: the chart's own error, and the `DOMException` a fetch-backed
    // host rejects with. Both are named by the contract, and neither is a transport failure.
    const named = { name: 'AbortError', message: 'the host abandoned the read' }
    for (const rejection of [new ResourceAbortError(), named]) {
      const store: ResourceStore<ChartMeta, ChartBody> = { ...adapter.charts, load: () => Promise.reject(rejection) }
      const open = openResourceController<ChartMeta, ChartBody>({ store: () => store, t: () => t })
      expect(await open.load(created.ref.id)).toEqual({ kind: 'cancelled' })
    }
  })

  it('a destination that refuses the loaded body keeps the binding it had, and the next save still writes there', async () => {
    const adapter = memorySaveLoadAdapter()
    const open = openResourceController<ChartMeta, ChartBody>({ store: () => adapter.charts, t: () => t })
    await open.save(body('A'))
    const a = open.current()!.ref
    const b = await adapter.charts.create(body('B', '1h'))
    if (b.kind !== 'ok') throw new Error('unreachable')
    const refused = await open.load(b.ref.id, undefined, () => {
      throw new Error('this build cannot read that')
    })
    expect(refused).toEqual({ kind: 'invalid', message: t('host.loadInvalid') })
    expect(open.current()).toEqual({ ref: a, name: 'A' })
    await open.save(body('A', '1d'))
    expect(open.current()!.ref.id).toBe(a.id)
    expect((await adapter.charts.load(b.ref.id))!.body.timeframe).toBe('1h')
  })

  it('a refused load onto an unbound destination leaves it unbound, so the next save still creates', async () => {
    const adapter = memorySaveLoadAdapter()
    const b = await adapter.charts.create(body('B'))
    if (b.kind !== 'ok') throw new Error('unreachable')
    const open = openResourceController<ChartMeta, ChartBody>({ store: () => adapter.charts, t: () => t })
    expect(
      (
        await open.load(b.ref.id, undefined, () => {
          throw new Error('this build cannot read that')
        })
      ).kind,
    ).toBe('invalid')
    expect(open.current()).toBeNull()
    await open.save(body('Untitled'))
    expect((await adapter.charts.list()).map((r) => r.name).sort()).toEqual(['B', 'Untitled'])
  })

  it('a destination gone by the time the body arrives cancels the load and binds nothing', async () => {
    const adapter = memorySaveLoadAdapter()
    const b = await adapter.charts.create(body('B'))
    if (b.kind !== 'ok') throw new Error('unreachable')
    const open = openResourceController<ChartMeta, ChartBody>({ store: () => adapter.charts, t: () => t })
    await open.save(body('A'))
    const a = open.current()!
    expect(
      await open.load(b.ref.id, undefined, () => {
        throw new ResourceAbortError('the destination was disposed during the load')
      }),
    ).toEqual({ kind: 'cancelled' })
    expect(open.current()).toEqual(a)
  })

  it('a load that applies commits identity, name and revision together, and the next save updates it', async () => {
    const adapter = memorySaveLoadAdapter()
    const b = await adapter.charts.create(body('B', '1h'))
    if (b.kind !== 'ok') throw new Error('unreachable')
    const open = openResourceController<ChartMeta, ChartBody>({ store: () => adapter.charts, t: () => t })
    await open.save(body('A'))
    const applied: string[] = []
    // The binding is still A's while the body is being applied: identity moves after content, never
    // before it.
    const loaded = await open.load(b.ref.id, undefined, (found) => {
      applied.push(found.name)
      expect(open.current()!.name).toBe('A')
    })
    expect(applied).toEqual(['B'])
    expect(loaded).toEqual({ kind: 'ok', ref: b.ref, body: body('B', '1h') })
    expect(open.current()).toEqual({ ref: b.ref, name: 'B' })
    await open.save(body('B', '4h'))
    expect((await adapter.charts.load(b.ref.id))!.body.timeframe).toBe('4h')
    expect((await adapter.charts.list()).length).toBe(2)
  })

  it('a load superseded before its body applies never reaches the destination and never binds', async () => {
    const adapter = memorySaveLoadAdapter()
    const a = await adapter.charts.create(body('A'))
    const b = await adapter.charts.create(body('B', '1h'))
    if (a.kind !== 'ok' || b.kind !== 'ok') throw new Error('unreachable')
    const release = new Map<string, () => void>()
    const store: ResourceStore<ChartMeta, ChartBody> = {
      ...adapter.charts,
      load: (id) =>
        new Promise((resolve, reject) => {
          release.set(id, () => adapter.charts.load(id).then(resolve, reject))
        }),
    }
    const open = openResourceController<ChartMeta, ChartBody>({ store: () => store, t: () => t })
    const applied: string[] = []
    const first = open.load(a.ref.id, undefined, (found) => applied.push(found.name))
    const second = open.load(b.ref.id, undefined, (found) => applied.push(found.name))
    release.get(b.ref.id)!()
    expect((await second).kind).toBe('ok')
    release.get(a.ref.id)!()
    expect(await first).toEqual({ kind: 'cancelled' })
    expect(applied).toEqual(['B'])
    expect(open.current()).toEqual({ ref: b.ref, name: 'B' })
  })

  it('a body that could not be put back stops the saving, and only a later load that lands starts it again', async () => {
    const adapter = memorySaveLoadAdapter()
    const open = openResourceController<ChartMeta, ChartBody>({ store: () => adapter.charts, t: () => t })
    await open.save(body('A'))
    const a = open.current()!.ref
    const b = await adapter.charts.create(body('B', '1h'))
    const c = await adapter.charts.create(body('C', '4h'))
    if (b.kind !== 'ok' || c.kind !== 'ok') throw new Error('unreachable')
    expect(open.notSaving()).toBe(false)
    const refused = await open.load(b.ref.id, undefined, () => {
      throw new ResourceRollbackError(new Error('half of it landed'), new Error('and the rest would not go back'))
    })
    expect(refused).toEqual({ kind: 'invalid', message: t('host.loadNotRestored') })
    // The binding is untouched, and precisely because it is, nothing may be written through it: what
    // is on screen is neither B nor what A held.
    expect(open.current()).toEqual({ ref: a, name: 'A' })
    expect(open.notSaving()).toBe(true)
    expect(await open.save(body('A', '1d'))).toEqual({ kind: 'not-saving', message: t('host.notSaving') })
    expect((await adapter.charts.load(a.id))!.body.timeframe).toBe('5m')
    // A load that lands puts a whole content on screen under the resource it came from, and the two
    // agree again.
    expect((await open.load(c.ref.id)).kind).toBe('ok')
    expect(open.notSaving()).toBe(false)
    expect((await open.save(body('C', '1d'))).kind).toBe('ok')
    expect((await adapter.charts.load(c.ref.id))!.body.timeframe).toBe('1d')
  })

  it('a copy keeps what is on screen and leaves the resource it was holding whole, and the saving stays stopped', async () => {
    const adapter = memorySaveLoadAdapter()
    const open = openResourceController<ChartMeta, ChartBody>({ store: () => adapter.charts, t: () => t })
    await open.save(body('A'))
    const a = open.current()!.ref
    const b = await adapter.charts.create(body('B', '1h'))
    const c = await adapter.charts.create(body('C', '4h'))
    if (b.kind !== 'ok' || c.kind !== 'ok') throw new Error('unreachable')
    await open.load(b.ref.id, undefined, () => {
      throw new ResourceRollbackError(new Error('half of it landed'), new Error('and the rest would not go back'))
    })
    expect((await open.save(body('A recovered', '1d'), { asNew: true })).kind).toBe('ok')
    // The copy did what it is for: A is untouched at the revision it stood at, and what was on
    // screen is somewhere the viewer can get at it.
    expect((await adapter.charts.load(a.id))!.body.timeframe).toBe('5m')
    expect((await adapter.charts.load(a.id))!.ref.revision).toBe(a.revision)
    expect((await adapter.charts.list()).map((r) => r.name).sort()).toEqual(['A', 'A recovered', 'B', 'C'])
    // What it did NOT do is prove the screen is whole. A store taking a write says nothing about the
    // content of it, so ordinary saving is still refused, the copy it just made included.
    expect(open.notSaving()).toBe(true)
    const copy = open.current()!.ref
    expect(copy.id).not.toBe(a.id)
    expect(await open.save(body('A recovered', '1h'))).toEqual({ kind: 'not-saving', message: t('host.notSaving') })
    expect((await adapter.charts.load(copy.id))!.ref.revision).toBe(copy.revision)
    // A load that lands is what starts it, and a second copy in between changes none of that.
    expect((await open.save(body('A recovered again'), { asNew: true })).kind).toBe('ok')
    expect(open.notSaving()).toBe(true)
    expect((await open.load(c.ref.id)).kind).toBe('ok')
    expect(open.notSaving()).toBe(false)
    expect((await open.save(body('C', '1d'))).kind).toBe('ok')
  })

  it.each([
    ['an id the store does not hold', 'not-found'],
    ['a body the destination refuses', 'invalid'],
    ['a store that could not be reached', 'unavailable'],
    ['a load the caller abandoned', 'cancelled'],
  ])('a recovery that ends as %s leaves the saving stopped', async (_label, kind) => {
    const adapter = memorySaveLoadAdapter()
    const offline = new Error('the network went away')
    // The store goes down only for the recovery attempt, so the load that stops the saving is the
    // one that reaches it.
    let down = false
    const store: ResourceStore<ChartMeta, ChartBody> = {
      ...adapter.charts,
      load: (id, signal) => (down ? Promise.reject(offline) : adapter.charts.load(id, signal)),
    }
    const open = openResourceController<ChartMeta, ChartBody>({ store: () => store, t: () => t })
    await open.save(body('A'))
    const b = await adapter.charts.create(body('B', '1h'))
    if (b.kind !== 'ok') throw new Error('unreachable')
    await open.load(b.ref.id, undefined, () => {
      throw new ResourceRollbackError(new Error('half of it landed'), new Error('and the rest would not go back'))
    })
    expect(open.notSaving()).toBe(true)
    down = kind === 'unavailable'
    // Only a load that LANDS puts a whole content back. A load that ends any other way leaves the
    // screen exactly as unproven as it found it, so the protection has to survive all four.
    const abandoned = new AbortController()
    if (kind === 'cancelled') abandoned.abort()
    const recovery = await open.load(kind === 'not-found' ? 'ghost' : b.ref.id, kind === 'cancelled' ? abandoned.signal : undefined, () => {
      if (kind === 'invalid') throw new Error('this build cannot read that')
    })
    expect(recovery.kind).toBe(kind)
    expect(open.notSaving()).toBe(true)
    expect((await open.save(body('A', '1d'))).kind).toBe('not-saving')
  })

  it('a load refused cleanly leaves the saving alone, because what is on screen is what it was', async () => {
    const adapter = memorySaveLoadAdapter()
    const open = openResourceController<ChartMeta, ChartBody>({ store: () => adapter.charts, t: () => t })
    await open.save(body('A'))
    const b = await adapter.charts.create(body('B', '1h'))
    if (b.kind !== 'ok') throw new Error('unreachable')
    await open.load(b.ref.id, undefined, () => {
      throw new Error('this build cannot read that')
    })
    expect(open.notSaving()).toBe(false)
    expect((await open.save(body('A', '1d'))).kind).toBe('ok')
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

describe('save completion ownership', () => {
  it('a pending create cannot undo a later detach', async () => {
    const adapter = memorySaveLoadAdapter()
    let finish!: () => void
    const store = {
      ...adapter.charts,
      create: (...args: Parameters<typeof adapter.charts.create>) =>
        new Promise<Awaited<ReturnType<typeof adapter.charts.create>>>((resolve) => {
          finish = () => { void adapter.charts.create(...args).then(resolve) }
        }),
    }
    const open = openResourceController<ChartMeta, ChartBody>({ store: () => store, t: () => t })
    const pending = open.save(body('A'))
    open.detach()
    finish()
    expect((await pending).kind).toBe('ok')
    expect(open.current()).toBeNull()
  })

  it('a pending remove cannot detach a subsequently loaded resource', async () => {
    const adapter = memorySaveLoadAdapter()
    let finish!: () => void
    const store = {
      ...adapter.charts,
      remove: (...args: Parameters<typeof adapter.charts.remove>) =>
        new Promise<Awaited<ReturnType<typeof adapter.charts.remove>>>((resolve) => {
          finish = () => { void adapter.charts.remove(...args).then(resolve) }
        }),
    }
    const open = openResourceController<ChartMeta, ChartBody>({ store: () => store, t: () => t })
    await open.save(body('A'))
    const b = await adapter.charts.create(body('B'))
    if (b.kind !== 'ok') throw new Error('unreachable')
    const pending = open.remove()
    await open.load(b.ref.id)
    finish()
    expect((await pending).kind).toBe('ok')
    expect(open.current()).toEqual({ ref: b.ref, name: 'B' })
  })

  it('a pending save cannot rebind a subsequently loaded resource', async () => {
    const adapter = memorySaveLoadAdapter()
    let finish!: () => void
    const store = { ...adapter.charts, update: (...args: Parameters<typeof adapter.charts.update>) => new Promise<Awaited<ReturnType<typeof adapter.charts.update>>>((resolve) => { finish = () => { void adapter.charts.update(...args).then(resolve) } }) }
    const open = openResourceController<ChartMeta, ChartBody>({ store: () => store, t: () => t })
    await open.save(body('A'))
    const b = await adapter.charts.create(body('B'))
    if (b.kind !== 'ok') throw new Error('unreachable')
    const pending = open.save(body('A'))
    await open.load(b.ref.id)
    finish()
    expect((await pending).kind).toBe('ok')
    expect(open.current()).toEqual({ ref: b.ref, name: 'B' })
  })
})

describe('the widget, the layout and the drawing layer run over the contract', () => {
  it('the chart saves the open chart through the controller and reads preferences from options.storage', () => {
    expect(saveLoadSrc).toContain(
      "const openChart = openResourceController<ChartMeta, ChartBody>({ store: () => deps.adapter?.charts ?? null, t: () => deps.i18n.t, committed: () => complete })",
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
    expect(drawingsSrc).toContain("else if (outcome.kind === 'conflict') await adoptConflict(symbol, outcome.current, retry, myEpoch)")
    expect(drawingsSrc).toContain('refs.set(symbol, current)')
    expect(drawingsSrc).toContain('docs.set(symbol, mergeDrawingDocuments(stored, documentFor(symbol)))')
    expect(drawingsSrc).toContain('deps.onConflict({ symbol, current })')
    expect(drawingsSrc).toContain('if (retry) upload(symbol, false)')
    expect(drawingsSrc).not.toContain('storage.set(')
    expect(drawingsSrc).not.toContain('localStorage')
  })
})

// @vitest-environment happy-dom
// Real widget/content/command owners; only the canvas renderer and external ports are fakes.
import { afterEach, expect, it, vi } from 'vitest'
import { createChart, type ChartWidget } from '../../src/widget/create'
import { memorySaveLoadAdapter } from '../../src/resources'
import { memoryChartStorage, type ChartStorage } from '../../src/storage'
import { chartSettingsDefaults, CHART_SETTINGS_SECTIONS } from '../../src/settings/defaults'
import { DARK_THEME } from '../../src/theme/palettes'
import type { ChartWidgetOptions } from '../../src/widget/options'

vi.mock('lightweight-charts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('lightweight-charts')>()
  const { createFakeChart } = await import('./rendererFake')
  return { ...actual, createChart: createFakeChart }
})

let widget: ChartWidget | undefined
afterEach(() => { widget?.dispose(); widget = undefined; vi.useRealTimers(); document.body.replaceChildren() })

function mount(adapter = memorySaveLoadAdapter(), storage?: ChartStorage, drawingPersistence?: ChartWidgetOptions['drawingPersistence'], extensions?: ChartWidgetOptions['extensions']) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  widget = createChart({
    container, saveLoad: adapter, storage, drawingPersistence, extensions, symbol: 'ES', timeframe: '1m',
    features: { drawings: false, replay: false, sessions: false },
    ui: { legend: false, contextMenu: false, navigation: false },
    datafeed: { search: async () => ({ hits: [], hasMore: false }), resolve: async () => null, history: async () => ({ bars: [], noData: true }), subscribeBars: () => () => undefined },
  })
  return widget
}

it('keeps layout write commands unavailable while a viewer load owns selection', async () => {
  const adapter = memorySaveLoadAdapter()
  const w = mount(adapter)
  await w.layout.saveLoad.save('Chosen')
  const chosen = w.layout.saveLoad.current()!.ref
  w.layout.saveLoad.detach()
  const originalLoad = adapter.layouts.load.bind(adapter.layouts)
  let release!: () => void
  const waiting = new Promise<void>((resolve) => { release = resolve })
  vi.spyOn(adapter.layouts, 'load').mockImplementation(async (id, signal) => {
    await waiting
    return originalLoad(id, signal)
  })
  const create = vi.spyOn(adapter.layouts, 'create')
  const loading = w.layout.saveLoad.load(chosen.id)
  try {
    expect(w.commands.available('widget.layout.save')).toBe(false)
    expect(w.commands.execute('widget.layout.save', { name: 'Workspace', asNew: true })).toEqual({ kind: 'unavailable' })
    expect(w.commands.available('widget.layout.rename')).toBe(false)
    expect(create).not.toHaveBeenCalled()
  } finally {
    release()
  }
  expect((await loading).kind).toBe('ok')
  expect(w.layout.saveLoad.current()?.ref.id).toBe(chosen.id)
  expect(w.commands.available('widget.layout.save')).toBe(true)
})

it('a host-created initial layout updates the package toolbar without another viewer interaction', async () => {
  vi.useFakeTimers()
  const w = mount()
  await vi.advanceTimersByTimeAsync(1000)
  expect((await w.layout.saveLoad.save('Workspace', { asNew: true })).kind).toBe('ok')
  expect(w.layout.saveLoad.current()?.name).toBe('Workspace')
  expect(document.querySelector('.qc-layouts-name')?.textContent).toBe('Workspace')
})

it.each(['API', 'command'])('%s layout transitions publish once from the committed binding', async (door) => {
  vi.useFakeTimers()
  const w = mount()
  await vi.advanceTimersByTimeAsync(1000)
  const changed = vi.fn()
  w.on('layout', changed)
  if (door === 'API') await w.layout.saveLoad.save('Workspace')
  else { w.commands.execute('widget.layout.save', 'Workspace'); await vi.advanceTimersByTimeAsync(0) }
  const ref = w.layout.saveLoad.current()!.ref
  expect(changed.mock.calls.map(([event]) => event)).toEqual([{ kind: 'saved', id: ref.id, name: 'Workspace' }])
  changed.mockClear()
  w.layout.saveLoad.detach()
  expect(changed.mock.calls.map(([event]) => event)).toEqual([{ kind: 'detached', id: null, name: null }])
  expect(document.querySelector('.qc-layouts-name')?.textContent).toBe('Unnamed')
  changed.mockClear()
  if (door === 'API') await w.layout.saveLoad.load(ref.id)
  else { w.commands.execute('widget.layout.load', ref.id); await vi.advanceTimersByTimeAsync(0) }
  expect(changed.mock.calls.map(([event]) => event)).toEqual([{ kind: 'loaded', id: ref.id, name: 'Workspace' }])
  expect(document.querySelector('.qc-layouts-name')?.textContent).toBe('Workspace')
  changed.mockClear()
  if (door === 'API') await w.layout.saveLoad.remove()
  else { w.commands.execute('widget.layout.delete', ref); await vi.advanceTimersByTimeAsync(0) }
  expect(changed.mock.calls.map(([event]) => event)).toEqual([{ kind: 'removed', id: ref.id, name: null }])
  expect(w.layout.saveLoad.current()).toBeNull()
  expect(document.querySelector('.qc-layouts-name')?.textContent).toBe('Unnamed')
})

it.each(['API', 'command'])('%s load refusal reports once without a success or clean label', async (door) => {
  vi.useFakeTimers()
  const adapter = memorySaveLoadAdapter()
  const w = mount(adapter)
  await w.layout.saveLoad.save('A')
  w.activeChart().setSymbol('NQ')
  await vi.advanceTimersByTimeAsync(1000)
  const invalid = await adapter.layouts.create({ name: 'Invalid', content: '{}' })
  if (invalid.kind !== 'ok') throw new Error('unreachable')
  const changed = vi.fn(), refused = vi.fn()
  w.on('layout', changed)
  w.on('saveConflict', refused)
  if (door === 'API') expect((await w.layout.saveLoad.load(invalid.ref.id)).kind).toBe('invalid')
  else { w.commands.execute('widget.layout.load', invalid.ref.id); await vi.advanceTimersByTimeAsync(0) }
  expect(changed).not.toHaveBeenCalled()
  expect(refused).toHaveBeenCalledTimes(1)
  expect(document.querySelector('[data-qc-dirty="true"]')).not.toBeNull()
  expect(w.layout.saveLoad.current()?.name).toBe('A')
})

it('saved notification is captured at commit even when a listener detaches synchronously', async () => {
  vi.useFakeTimers()
  const w = mount()
  const changed = vi.fn()
  w.on('layout', (event) => { changed(event); if (event.kind === 'saved') w.layout.saveLoad.detach() })
  w.commands.execute('widget.layout.save', 'A')
  await vi.advanceTimersByTimeAsync(0)
  expect(changed.mock.calls.map(([event]) => event.kind)).toEqual(['saved', 'detached'])
  expect(changed.mock.calls[0]![0].name).toBe('A')
  expect(w.layout.saveLoad.current()).toBeNull()
  expect(document.querySelector('.qc-layouts-name')?.textContent).toBe('Unnamed')
})

it('a missing current row publishes its removal and one refusal; stale quoted deletion cannot detach it', async () => {
  vi.useFakeTimers()
  const adapter = memorySaveLoadAdapter()
  const w = mount(adapter)
  await w.layout.saveLoad.save('A')
  const old = w.layout.saveLoad.current()!.ref
  await w.layout.saveLoad.save('A')
  const current = w.layout.saveLoad.current()!.ref
  const changed = vi.fn(), refused = vi.fn()
  w.on('layout', changed)
  w.on('saveConflict', refused)
  w.commands.execute('widget.layout.delete', old)
  await vi.advanceTimersByTimeAsync(0)
  expect(w.layout.saveLoad.current()!.ref).toEqual(current)
  expect(changed).not.toHaveBeenCalled()
  expect(refused).toHaveBeenCalledTimes(1)
  refused.mockClear()
  await adapter.layouts.remove(current)
  expect((await w.layout.saveLoad.remove()).kind).toBe('not-found')
  expect(changed.mock.calls.map(([event]) => event)).toEqual([{ kind: 'removed', id: current.id, name: null }])
  expect(refused).toHaveBeenCalledTimes(1)
  expect(document.querySelector('.qc-layouts-name')?.textContent).toBe('Unnamed')
})

it('loaded listeners can detach twice without repeating an already ended transition', async () => {
  const w = mount()
  await w.layout.saveLoad.save('A')
  const id = w.layout.saveLoad.current()!.ref.id
  w.layout.saveLoad.detach()
  const changed = vi.fn()
  w.on('layout', (event) => {
    changed(event)
    if (event.kind === 'loaded') { w.layout.saveLoad.detach(); w.layout.saveLoad.detach() }
  })
  expect((await w.layout.saveLoad.load(id)).kind).toBe('ok')
  expect(changed.mock.calls.map(([event]) => event.kind)).toEqual(['loaded', 'detached'])
  expect(w.layout.saveLoad.current()).toBeNull()
})

it('a chart callback that detaches during layout apply stays detached and cannot autosave through the former binding', async () => {
  vi.useFakeTimers()
  const adapter = memorySaveLoadAdapter()
  const w = mount(adapter)
  await w.layout.saveLoad.save('A')
  const a = w.layout.saveLoad.current()!.ref
  w.activeChart().setSymbol('NQ')
  const b = await adapter.layouts.create({ name: 'B', content: w.layout.serialize().content })
  if (b.kind !== 'ok') throw new Error('unreachable')
  w.activeChart().setSymbol('ES')
  await vi.advanceTimersByTimeAsync(1000)
  const transitions: string[] = []
  w.on('layout', (event) => transitions.push(event.kind))
  w.activeChart().on('symbol', (symbol) => {
    if (symbol === 'NQ') w.layout.saveLoad.detach()
  })

  expect((await w.layout.saveLoad.load(b.ref.id)).kind).toBe('cancelled')
  expect(w.activeChart().symbol()).toBe('NQ')
  expect(w.layout.saveLoad.current()).toBeNull()
  expect(transitions).toEqual(['detached'])
  await vi.advanceTimersByTimeAsync(1000)
  expect((await adapter.layouts.load(a.id))!.ref).toEqual(a)
  expect((await adapter.layouts.load(b.ref.id))!.ref).toEqual(b.ref)
})

it('a chart callback that starts a newer layout load never lets the superseded body bind or replace the newer winner', async () => {
  const adapter = memorySaveLoadAdapter()
  const w = mount(adapter)
  await w.layout.saveLoad.save('A')
  w.activeChart().setSymbol('NQ')
  const b = await adapter.layouts.create({ name: 'B', content: w.layout.serialize().content })
  w.activeChart().setSymbol('YM')
  const c = await adapter.layouts.create({ name: 'C', content: w.layout.serialize().content })
  if (b.kind !== 'ok' || c.kind !== 'ok') throw new Error('unreachable')
  w.activeChart().setSymbol('ES')
  const transitions: Array<{ kind: string; id: string | null }> = []
  w.on('layout', (event) => transitions.push({ kind: event.kind, id: event.id }))
  let newer: ReturnType<typeof w.layout.saveLoad.load> | null = null
  w.activeChart().on('symbol', (symbol) => {
    if (symbol === 'NQ' && !newer) newer = w.layout.saveLoad.load(c.ref.id)
  })

  expect((await w.layout.saveLoad.load(b.ref.id)).kind).toBe('cancelled')
  expect(newer).not.toBeNull()
  expect((await newer!).kind).toBe('ok')
  expect(w.activeChart().symbol()).toBe('YM')
  expect(w.layout.saveLoad.current()).toEqual({ ref: c.ref, name: 'C' })
  expect(transitions).toEqual([
    { kind: 'detached', id: null },
    { kind: 'loaded', id: c.ref.id },
  ])
})

it('a newer load refused from a chart callback leaves the already-applied screen unbound from the former resource', async () => {
  vi.useFakeTimers()
  const adapter = memorySaveLoadAdapter()
  const w = mount(adapter)
  await w.layout.saveLoad.save('A')
  const a = w.layout.saveLoad.current()!.ref
  w.activeChart().setSymbol('NQ')
  const b = await adapter.layouts.create({ name: 'B', content: w.layout.serialize().content })
  if (b.kind !== 'ok') throw new Error('unreachable')
  w.activeChart().setSymbol('ES')
  await vi.advanceTimersByTimeAsync(1000)
  let newer: ReturnType<typeof w.layout.saveLoad.load> | null = null
  w.activeChart().on('symbol', (symbol) => {
    if (symbol === 'NQ' && !newer) newer = w.layout.saveLoad.load('missing')
  })

  expect((await w.layout.saveLoad.load(b.ref.id)).kind).toBe('cancelled')
  expect((await newer!).kind).toBe('not-found')
  expect(w.activeChart().symbol()).toBe('NQ')
  expect(w.layout.saveLoad.current()).toBeNull()
  await vi.advanceTimersByTimeAsync(1000)
  expect((await adapter.layouts.load(a.id))!.ref).toEqual(a)
  expect((await adapter.layouts.load(b.ref.id))!.ref).toEqual(b.ref)
})

it('direct refusal refreshes blocked chrome and copy or partial load cannot mark it clean', async () => {
  vi.useFakeTimers()
  const adapter = memorySaveLoadAdapter(), backing = memoryChartStorage()
  let fail = false
  const w = mount(adapter, { ...backing, set(key, value) { backing.set(key, value); if (fail) throw new Error('refused') } })
  await w.layout.saveLoad.save('Whole')
  const whole = w.layout.saveLoad.current()!.ref
  await vi.advanceTimersByTimeAsync(1000)
  w.activeChart().setSymbol('NQ')
  await vi.advanceTimersByTimeAsync(1000)
  fail = true
  expect((await w.layout.saveLoad.load(whole.id)).kind).toBe('invalid')
  fail = false
  const label = document.querySelector<HTMLElement>('.qc-layouts-name')!
  expect(label.dataset.qcNotSaving).toBe('true')
  expect(label.dataset.qcDirty).toBe('true')
  await w.layout.saveLoad.save('Rescue', { asNew: true })
  expect(label.textContent).toBe('Rescue')
  expect(label.dataset.qcNotSaving).toBe('true')
  expect(label.dataset.qcDirty).toBe('true')
  const partial = JSON.parse(w.layout.serialize().content)
  const child = JSON.parse(partial.charts[0].content)
  // A leaf that is PRESENT and unusable is what leaves old state standing. An omitted leaf is one
  // nobody authored, which the theme and the host resolve, so omission is not partiality.
  child.settings = { canvas: { background: 'not-a-color' } }
  partial.charts[0].content = JSON.stringify(child)
  const row = await adapter.layouts.create({ name: 'Partial', content: JSON.stringify(partial) })
  if (row.kind !== 'ok') throw new Error('unreachable')
  expect((await w.layout.saveLoad.load(row.ref.id)).kind).toBe('ok')
  expect(label.textContent).toBe('Partial')
  expect(label.dataset.qcNotSaving).toBe('true')
  expect(label.dataset.qcDirty).toBe('true')
  await w.layout.saveLoad.load(whole.id)
  expect(label.textContent).toBe('Whole')
  expect(label.dataset.qcNotSaving).toBe('false')
  expect(label.dataset.qcDirty).toBe('false')
})

it.each(['load', 'detach', 'dispose'])('a pending direct save cannot publish after %s replaces its binding lifetime', async (next) => {
  const adapter = memorySaveLoadAdapter()
  let release!: () => void
  const update = adapter.layouts.update
  adapter.layouts.update = async (...args) => { await new Promise<void>((resolve) => { release = resolve }); return update(...args) }
  const w = mount(adapter)
  await w.layout.saveLoad.save('A')
  const b = await adapter.layouts.create({ name: 'B', content: w.layout.serialize().content })
  if (b.kind !== 'ok') throw new Error('unreachable')
  const changed = vi.fn()
  w.on('layout', changed)
  const pending = w.layout.saveLoad.save('Late A')
  if (next === 'load') await w.layout.saveLoad.load(b.ref.id)
  else if (next === 'detach') w.layout.saveLoad.detach()
  else w.dispose()
  changed.mockClear()
  release()
  expect((await pending).kind).toBe('ok')
  expect(changed).not.toHaveBeenCalled()
  expect(w.layout.saveLoad.current()?.name ?? null).toBe(next === 'load' ? 'B' : next === 'dispose' ? 'A' : null)
})

it('a late removal cannot detach or announce removal of a newer binding', async () => {
  const adapter = memorySaveLoadAdapter()
  let release!: () => void
  const remove = adapter.layouts.remove
  adapter.layouts.remove = async (...args) => { await new Promise<void>((resolve) => { release = resolve }); return remove(...args) }
  const w = mount(adapter)
  await w.layout.saveLoad.save('A')
  const b = await adapter.layouts.create({ name: 'B', content: w.layout.serialize().content })
  if (b.kind !== 'ok') throw new Error('unreachable')
  const changed = vi.fn()
  w.on('layout', changed)
  const pending = w.layout.saveLoad.remove()
  await w.layout.saveLoad.load(b.ref.id)
  changed.mockClear()
  release()
  expect((await pending).kind).toBe('ok')
  expect(changed).not.toHaveBeenCalled()
  expect(w.layout.saveLoad.current()?.name).toBe('B')
})

it('deleting another row preserves the current binding and dirty content', async () => {
  vi.useFakeTimers()
  const adapter = memorySaveLoadAdapter()
  const w = mount(adapter)
  await w.layout.saveLoad.save('A')
  const at = w.layout.saveLoad.current()
  const b = await adapter.layouts.create({ name: 'B', content: w.layout.serialize().content })
  if (b.kind !== 'ok') throw new Error('unreachable')
  w.activeChart().setSymbol('NQ')
  await vi.advanceTimersByTimeAsync(1000)
  const changed = vi.fn()
  w.on('layout', changed)
  w.commands.execute('widget.layout.delete', b.ref)
  await vi.advanceTimersByTimeAsync(0)
  expect(changed.mock.calls.map(([event]) => event)).toEqual([{ kind: 'removed', id: b.ref.id, name: null }])
  expect(w.layout.saveLoad.current()).toEqual(at)
  expect(document.querySelector<HTMLElement>('.qc-layouts-name')!.dataset.qcDirty).toBe('true')
})

it.each([false, true])('real chart and layout hydration preserve only prior viewer dirtiness (%s)', async (dirty) => {
  vi.useFakeTimers()
  const w = mount()
  await vi.advanceTimersByTimeAsync(1000)
  const needed = vi.fn()
  w.on('saveNeeded', needed)
  const held = w.layout.serialize().content
  if (dirty) w.activeChart().setSymbol('CL')
  const next = JSON.parse(w.activeChart().saveLoad.serialize().content)
  next.symbol = 'NQ'
  w.activeChart().saveLoad.restore(JSON.stringify(next))
  w.layout.restore(held)
  await vi.advanceTimersByTimeAsync(1000)
  expect(needed).toHaveBeenCalledTimes(dirty ? 1 : 0)
})

it.each(['failed load', 'direct shrink'] as const)('parent protection survives a blocked child destroyed by %s', async (operation) => {
  vi.useFakeTimers()
  const adapter = memorySaveLoadAdapter()
  const backing = memoryChartStorage()
  let poison: (() => void) | undefined
  let refuseNQ = false
  const w = mount(adapter, { ...backing, set(key, value) {
    backing.set(key, value)
    if (poison) {
      const apply = poison
      poison = undefined
      apply()
      poison = apply
      throw new Error('child apply and rollback refused')
    }
    if (refuseNQ && value === 'NQ') { refuseNQ = false; throw new Error('outer load refused') }
  } })
  w.layout.setArrangement('2v')
  await w.layout.saveLoad.save('A')
  const original = w.layout.saveLoad.current()!
  const whole = w.layout.serialize().content
  const doomed = w.charts()[1]!
  poison = () => doomed.setTimeframe('15m')
  expect(() => doomed.saveLoad.restore(doomed.saveLoad.serialize().content)).toThrow()
  poison = undefined
  expect(doomed.timeframe()).toBe('15m')
  expect(doomed.saveLoad.notSaving()).toBe(true)
  if (operation === 'failed load') {
    const body = JSON.parse(whole)
    body.arrangement = 's'
    body.geometry = [{ x: 0, y: 0, w: 1, h: 1 }]
    body.charts = body.charts.slice(0, 1)
    const chart = JSON.parse(body.charts[0].content)
    chart.symbol = 'NQ'
    body.charts[0].content = JSON.stringify(chart)
    const b = await adapter.layouts.create({ name: 'B', content: JSON.stringify(body) })
    if (b.kind !== 'ok') throw new Error('unreachable')
    refuseNQ = true
    expect((await w.layout.saveLoad.load(b.ref.id)).kind).toBe('invalid')
    expect(w.charts()).toHaveLength(2)
    expect(w.charts()[1]).not.toBe(doomed)
    expect(w.charts()[1]!.timeframe()).toBe('15m')
  } else w.layout.setArrangement('s')

  expect(w.layout.saveLoad.notSaving()).toBe(true)
  expect((await w.layout.saveLoad.save('A')).kind).toBe('not-saving')
  w.commands.execute('widget.layout.autosave', true)
  w.commands.execute('widget.layout.save')
  await vi.advanceTimersByTimeAsync(1000)
  expect((await adapter.layouts.load(original.ref.id))!.ref).toEqual(original.ref)
  expect((await w.layout.saveLoad.save('Rescue', { asNew: true })).kind).toBe('ok')
  expect(w.layout.saveLoad.notSaving()).toBe(true)
  w.layout.restore(whole)
  expect(w.layout.saveLoad.notSaving()).toBe(true)
  expect((await w.layout.saveLoad.load(original.ref.id)).kind).toBe('ok')
  expect(w.layout.saveLoad.notSaving()).toBe(false)
  expect(w.charts()[1]!.timeframe()).toBe('1m')
})

for (const family of ['chart', 'layout'] as const) {
  it.each([
    { name: 'missing known namespace', ext: {} },
    { name: 'unknown namespace alone', ext: { unknown: { opaque: 1 } } },
    { name: 'null dictionary', ext: null },
    { name: 'array dictionary', ext: [] },
    { name: 'scalar dictionary', ext: 'invalid' },
    { name: 'partial known state', ext: { known: { level: 1 } } },
    { name: 'malformed known state', ext: { known: { level: 'invalid', enabled: true } } },
    { name: 'restore exception', ext: { known: { level: 1, enabled: true } }, throws: 'restore' },
    { name: 'serialize exception', ext: { known: { level: 1, enabled: true } }, throws: 'serialize' },
  ])(`${family} recovery refuses to certify extension $name`, async ({ ext, throws }) => {
    const adapter = memorySaveLoadAdapter()
    const backing = memoryChartStorage()
    let failStorage = false
    let failExtension: string | undefined
    let state = { level: 1, enabled: true }
    const w = mount(adapter, { ...backing, set(key, value) { backing.set(key, value); if (failStorage) throw new Error('storage refused') } }, undefined, [{
      id: 'known', attach: () => ({ detach() {},
        serialize() { if (failExtension === 'serialize') throw new Error('serialize refused'); return { enabled: state.enabled, level: state.level, omitted: undefined } },
        restore(value) {
          if (failExtension === 'restore') throw new Error('restore refused')
          const next = value as Partial<typeof state> | null
          if (typeof next?.level === 'number') state.level = next.level
          if (typeof next?.enabled === 'boolean') state.enabled = next.enabled
        },
      }),
    }])
    const child = w.activeChart().saveLoad
    const destination = family === 'chart' ? child : w.layout.saveLoad
    const good = child.serialize()
    const layout = JSON.parse(w.layout.serialize().content)
    await destination.save('A')
    failStorage = true
    expect(() => child.restore(good.content)).toThrow()
    failStorage = false
    state = { level: 999, enabled: false }
    failExtension = throws
    const incoming = JSON.parse(good.content)
    incoming.ext = ext
    const body = family === 'chart' ? { name: 'Partial', ...good, content: JSON.stringify(incoming) }
      : { name: 'Partial', content: JSON.stringify({ ...layout, charts: [{ ...layout.charts[0], content: JSON.stringify(incoming) }] }) }
    const store = family === 'chart' ? adapter.charts : adapter.layouts
    const saved = await store.create(body as Parameters<typeof adapter.charts.create>[0])
    if (saved.kind !== 'ok') throw new Error('unreachable')
    await destination.load(saved.ref.id)
    expect(child.notSaving()).toBe(true)
    expect(w.layout.saveLoad.notSaving()).toBe(true)
    expect((await destination.save('No overwrite')).kind).toBe('not-saving')
    expect((await destination.save('Rescue', { asNew: true })).kind).toBe('ok')
    expect(child.notSaving()).toBe(true)

    failExtension = undefined
    // A canonical namespace may reorder keys and coexist with unknown opaque ids. Serialization
    // also omits undefined object leaves; neither difference changes JSON state.
    incoming.ext = { known: { level: 1, enabled: true }, unknown: { opaque: ['keep separate'] } }
    const recovered = await store.create((family === 'chart' ? { name: 'Recovered', ...good, content: JSON.stringify(incoming) }
      : { name: 'Recovered', content: JSON.stringify({ ...layout, charts: [{ ...layout.charts[0], content: JSON.stringify(incoming) }] }) }) as Parameters<typeof adapter.charts.create>[0])
    if (recovered.kind !== 'ok') throw new Error('unreachable')
    expect((await destination.load(recovered.ref.id)).kind).toBe('ok')
    expect(child.notSaving()).toBe(false)
    expect(w.layout.saveLoad.notSaving()).toBe(false)
    expect(state).toEqual({ level: 1, enabled: true })
  })
}

it('an extension no-op cannot make a failed chart application count as a restored rollback', async () => {
  const adapter = memorySaveLoadAdapter()
  const backing = memoryChartStorage()
  let level = 1
  let refuse = false
  const w = mount(adapter, { ...backing, set(key, value) {
    backing.set(key, value)
    if (refuse) { refuse = false; level = 999; throw new Error('apply refused') }
  } }, undefined, [{ id: 'known', attach: () => ({
    detach() {}, serialize: () => ({ level }), restore() { /* deliberately ignores held state */ },
  }) }])
  const child = w.activeChart().saveLoad
  await w.layout.saveLoad.save('A')
  const good = child.serialize()
  refuse = true
  expect(() => child.restore(good.content)).toThrow()
  expect(level).toBe(999)
  expect(child.notSaving()).toBe(true)
  expect((await w.layout.saveLoad.save('Unsafe')).kind).toBe('not-saving')
})

it('a stale save completion neither rebinds nor announces the current layout as saved', async () => {
  const adapter = memorySaveLoadAdapter()
  let finish!: () => void
  const layouts = { ...adapter.layouts, update: (...args: Parameters<typeof adapter.layouts.update>) => new Promise<Awaited<ReturnType<typeof adapter.layouts.update>>>((resolve) => { finish = () => { void adapter.layouts.update(...args).then(resolve) } }) }
  const w = mount({ ...adapter, layouts })
  await w.layout.saveLoad.save('A')
  const b = await adapter.layouts.create({ name: 'B', content: w.layout.serialize().content })
  if (b.kind !== 'ok') throw new Error('unreachable')
  const events: string[] = []
  w.on('layout', event => events.push(event.kind))
  w.commands.execute('widget.layout.save')
  await w.layout.saveLoad.load(b.ref.id)
  finish()
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(w.layout.saveLoad.current()).toEqual({ ref: b.ref, name: 'B' })
  expect(events).not.toContain('saved')
})

it.each([false, true])('real failed child apply and rollback protect parent autosave and preserve prior dirtiness (%s)', async (dirty) => {
  vi.useFakeTimers()
  const adapter = memorySaveLoadAdapter()
  const backing = memoryChartStorage()
  let fail = false
  const w = mount(adapter, { ...backing, set: (key, value) => { backing.set(key, value); if (fail) throw new Error('storage refused') } })
  await w.layout.saveLoad.save('A')
  const at = w.layout.saveLoad.current()!
  await vi.advanceTimersByTimeAsync(1000)
  const needed = vi.fn()
  w.on('saveNeeded', needed)
  if (dirty) w.activeChart().setSymbol('CL')
  const content = w.activeChart().saveLoad.serialize().content
  fail = true
  expect(() => w.activeChart().saveLoad.restore(content)).toThrow()
  fail = false
  expect(w.layout.saveLoad.notSaving()).toBe(true)
  await vi.advanceTimersByTimeAsync(1000)
  expect(needed).toHaveBeenCalledTimes(dirty ? 1 : 0)
  w.commands.execute('widget.layout.autosave', true)
  w.commands.execute('widget.layout.save')
  await vi.advanceTimersByTimeAsync(1000)
  expect((await adapter.layouts.load(at.ref.id))!.ref).toEqual(at.ref)
})

const incompleteBodies: { name: string; change: (body: Record<string, unknown>) => void }[] = [
  { name: 'missing indicators', change: (body) => { delete body.indicators } },
  { name: 'missing combined drawings', change: (body) => { delete body.drawings } },
  // Settings in content are the AUTHORED leaves, so an omitted leaf is one nobody chose and the
  // theme and the host resolve it: only a leaf that is present and unusable can leave old state
  // standing, and only that refuses to certify recovery. `settings: undefined` is still a missing
  // field rather than an empty authored record.
  { name: 'missing settings', change: (body) => { delete body.settings } },
  { name: 'malformed color', change: (body) => { body.settings = { canvas: { background: 'not-a-color' } } } },
  { name: 'unresolved color variable', change: (body) => { body.settings = { canvas: { background: 'var(--missing)' } } } },
  ...[
    ['canvas', 'verticalGrid', 'false'],
    ['priceLabels', 'countdown', null],
    ['canvas', 'marginTop', '10'],
    ['symbol', 'session', 'overnight'],
    ['timeScale', 'dateFormat', 'yyyy.MM.dd'],
    ['priceLabels', 'symbolLineColor', 12],
  ].map(([section, leaf, value]) => (
    { name: `wrong type for ${section}.${leaf}`, change: (body: Record<string, unknown>) => { body.settings = { [section as string]: { [leaf as string]: value } } } }
  )),
]

/** Bodies whose settings name fewer leaves than the tree has. Each is a complete statement of the
 *  authored leaves, so each certifies recovery: what a viewer never chose is not missing. */
const authoredAppearances: { name: string; change: (body: Record<string, unknown>) => void }[] = [
  { name: 'an empty authored record', change: (body) => { body.settings = {} } },
  { name: 'one authored leaf', change: (body) => { body.settings = { canvas: { background: '#123456' } } } },
  ...CHART_SETTINGS_SECTIONS.map((section) => (
    { name: `every section but ${section}`, change: (body: Record<string, unknown>) => {
      body.settings = Object.fromEntries(Object.entries(chartSettingsDefaults(DARK_THEME)).filter(([name]) => name !== section))
    } }
  )),
]

for (const family of ['chart', 'layout'] as const) {
  it.each(['red', 'transparent', 'hsl(120, 100%, 50%)'])(`${family} recovery accepts the renderer's valid %s color`, async (color) => {
    const adapter = memorySaveLoadAdapter()
    const backing = memoryChartStorage()
    let fail = false
    const w = mount(adapter, { ...backing, set: (key, value) => { backing.set(key, value); if (fail) throw new Error('storage refused') } })
    w.activeChart().applySettings({ candles: { upColor: color } })
    const child = w.activeChart().saveLoad
    const goodChart = child.serialize()
    const goodLayout = w.layout.serialize().content
    const destination = family === 'chart' ? child : w.layout.saveLoad
    fail = true
    expect(() => child.restore(goodChart.content)).toThrow()
    fail = false
    const saved = family === 'chart'
      ? await adapter.charts.create({ name: 'Recovered', ...goodChart })
      : await adapter.layouts.create({ name: 'Recovered', content: goodLayout })
    if (saved.kind !== 'ok') throw new Error('unreachable')
    expect((await destination.load(saved.ref.id)).kind).toBe('ok')
    expect(child.notSaving()).toBe(false)
    expect(w.activeChart().settings().candles.upColor).toBe(color)
  })

  it(`${family} recovery accepts a complete separate-mode body without combined drawings`, async () => {
    const adapter = memorySaveLoadAdapter()
    const backing = memoryChartStorage()
    let fail = false
    const w = mount(adapter, { ...backing, set: (key, value) => { backing.set(key, value); if (fail) throw new Error('storage refused') } }, { mode: 'separate', scope: 'symbol-global' })
    const child = w.activeChart().saveLoad
    const goodChart = child.serialize()
    expect(JSON.parse(goodChart.content)).not.toHaveProperty('drawings')
    const destination = family === 'chart' ? child : w.layout.saveLoad
    const goodLayout = w.layout.serialize().content
    await destination.save('A')
    fail = true
    expect(() => child.restore(goodChart.content)).toThrow()
    fail = false
    expect(child.notSaving()).toBe(true)
    expect((await destination.save('Rescue', { asNew: true })).kind).toBe('ok')
    expect(child.notSaving()).toBe(true)
    const saved = family === 'chart'
      ? await adapter.charts.create({ name: 'Recovered', ...goodChart })
      : await adapter.layouts.create({ name: 'Recovered', content: goodLayout })
    if (saved.kind !== 'ok') throw new Error('unreachable')
    expect((await destination.load(saved.ref.id)).kind).toBe('ok')
    expect(child.notSaving()).toBe(false)
    expect(w.layout.saveLoad.notSaving()).toBe(false)
  })

  it.each(incompleteBodies)(`${family} recovery does not certify $name`, async ({ change }) => {
    const adapter = memorySaveLoadAdapter()
    const backing = memoryChartStorage()
    let fail = false
    const w = mount(adapter, { ...backing, set: (key, value) => { backing.set(key, value); if (fail) throw new Error('storage refused') } })
    const child = w.activeChart().saveLoad
    const destination = family === 'chart' ? child : w.layout.saveLoad
    const goodChart = child.serialize()
    const goodLayout = JSON.parse(w.layout.serialize().content)
    await child.save('Child A')
    await w.layout.saveLoad.save('Layout A')
    const childBinding = child.current()
    fail = true
    expect(() => child.restore(goodChart.content)).toThrow()
    fail = false
    expect(child.notSaving()).toBe(true)

    const partial = JSON.parse(goodChart.content) as Record<string, unknown>
    change(partial)
    const body = family === 'chart'
      ? { name: 'Partial', ...goodChart, content: JSON.stringify(partial) }
      : { name: 'Partial', content: JSON.stringify({ ...goodLayout, charts: [{ ...goodLayout.charts[0], content: JSON.stringify(partial) }] }) }
    const store = family === 'chart' ? adapter.charts : adapter.layouts
    const saved = await store.create(body as Parameters<typeof adapter.charts.create>[0])
    if (saved.kind !== 'ok') throw new Error('unreachable')
    await destination.load(saved.ref.id)
    expect(child.notSaving()).toBe(true)
    expect(w.layout.saveLoad.notSaving()).toBe(true)
    if (family === 'layout') expect(child.current()).toEqual(childBinding)
    expect((await destination.save('Rescue', { asNew: true })).kind).toBe('ok')
    expect(child.notSaving()).toBe(true)
    expect((await destination.save('Rescue')).kind).toBe('not-saving')

    const complete = await store.create((family === 'chart'
      ? { name: 'Complete', ...goodChart }
      : { name: 'Complete', content: JSON.stringify(goodLayout) }) as Parameters<typeof adapter.charts.create>[0])
    if (complete.kind !== 'ok') throw new Error('unreachable')
    expect((await destination.load(complete.ref.id)).kind).toBe('ok')
    expect(child.notSaving()).toBe(false)
    expect(w.layout.saveLoad.notSaving()).toBe(false)
  })

  it.each(authoredAppearances)(`${family} recovery certifies $name`, async ({ change }) => {
    const adapter = memorySaveLoadAdapter()
    const backing = memoryChartStorage()
    let fail = false
    const w = mount(adapter, { ...backing, set: (key, value) => { backing.set(key, value); if (fail) throw new Error('storage refused') } })
    const child = w.activeChart().saveLoad
    const destination = family === 'chart' ? child : w.layout.saveLoad
    const goodChart = child.serialize()
    const goodLayout = JSON.parse(w.layout.serialize().content)
    fail = true
    expect(() => child.restore(goodChart.content)).toThrow()
    fail = false
    expect(child.notSaving()).toBe(true)

    const authoredBody = JSON.parse(goodChart.content) as Record<string, unknown>
    change(authoredBody)
    const body = family === 'chart'
      ? { name: 'Authored', ...goodChart, content: JSON.stringify(authoredBody) }
      : { name: 'Authored', content: JSON.stringify({ ...goodLayout, charts: [{ ...goodLayout.charts[0], content: JSON.stringify(authoredBody) }] }) }
    const store = family === 'chart' ? adapter.charts : adapter.layouts
    const saved = await store.create(body as Parameters<typeof adapter.charts.create>[0])
    if (saved.kind !== 'ok') throw new Error('unreachable')
    expect((await destination.load(saved.ref.id)).kind).toBe('ok')
    expect(child.notSaving()).toBe(false)
    expect(w.layout.saveLoad.notSaving()).toBe(false)
  })
}

// THE SAVE/LOAD OUTCOME CONTRACT, held the way a consumer holds it.
//
// The runtime API-surface pin beside this file records exported names and their `typeof`. It cannot
// see a union that grew a member, a member that changed meaning, or a promise that stopped
// rejecting, because none of those changes a name or a type of value. Three things here can:
//
//   1. Handlers written the way a host writes them, switching over every kind of the three public
//      unions with a `never` in the default. Adding a kind makes the default reachable and fails to
//      compile; removing one leaves a `case` for a kind the union no longer carries, which fails to
//      compile too. Each branch reads the fields its kind carries, so a payload that moves fails
//      here as well.
//   2. A key map per union, so the set of kinds is also a value a test can read.
//   3. Runtime checks for the two answers that are behavior rather than shape: a load the caller
//      abandoned RESOLVES with `cancelled` instead of rejecting, and a widget with no adapter still
//      rejects, because a host that wired nothing asked for something that cannot happen.
//
// The types come through the package entry, which is what a consumer imports. The same outcomes are
// driven through the public mount by `persistence.load-outcomes` in the conformance suite.
import { describe, expect, it } from 'vitest'
import type { ChartBody, ChartMeta, ChartSaveLoadAdapter, ResourceLoadOutcome, ResourceRemoveOutcome, ResourceSaveOutcome, ResourceStore } from '../src/index'
import { memorySaveLoadAdapter } from '../src/index'
import { createChartI18n } from '../src/i18n'
import { createSaveLoadApi, serializeChartContent, type ChartContent } from '../src/widget/saveLoad'

const i18n = createChartI18n()
const t = i18n.t

const contentOf = (symbol: string, timeframe: string): ChartContent => ({
  symbol,
  timeframe,
  style: 'candles',
  scale: 'normal',
  priceAxis: 'auto',
  indicators: [],
  settings: {},
  compares: null,
  panes: ['main'],
  ext: {},
})

/** A chart stripped to what save/load touches. `refuse` names the symbols its apply throws on, which
 *  is how a body is refused and, where it names the symbol on screen as well, how the content it
 *  held fails to go back. */
function chartApi(opts: { adapter: ChartSaveLoadAdapter | null; refuse?: string[] }) {
  let state = contentOf('ES', '5m')
  const refuse = opts.refuse ?? []
  return createSaveLoadApi({
    adapter: opts.adapter,
    i18n,
    symbol: () => state.symbol,
    timeframe: () => state.timeframe,
    content: () => state,
    apply: (parsed) => {
      if (parsed.symbol !== undefined && refuse.includes(parsed.symbol)) throw new Error('this chart could not take that symbol')
      state = { ...state, symbol: parsed.symbol ?? state.symbol, timeframe: parsed.timeframe ?? state.timeframe }
    },
    disposed: () => false,
  })
}

const rowFor = (name: string, symbol: string, timeframe: string, content?: string): ChartBody => ({
  name,
  symbol,
  timeframe,
  content: content ?? serializeChartContent(contentOf(symbol, timeframe)),
})

// ── The handlers a host writes ─────────────────────────────────────────────────────────────────

function describeLoad(outcome: ResourceLoadOutcome<ChartBody>): string {
  switch (outcome.kind) {
    case 'ok':
      return `opened ${outcome.body.name} at ${outcome.ref.revision}`
    case 'not-found':
      // A resource the store answered for and does not hold: a host offers to save it again as new.
      return `gone: ${outcome.message}`
    case 'invalid':
      // A body this build cannot take. Permanent for that resource, so a host does not retry it.
      return `refused: ${outcome.message}`
    case 'unavailable':
      // The store, not the body. A host retries this one, and logs what its own service failed with.
      return `unreachable: ${outcome.message} / ${String((outcome.cause as Error).message)}`
    case 'cancelled':
      // Nobody is waiting for it: a later load is landing, or the asker went away.
      return 'abandoned'
    default: {
      const unhandled: never = outcome
      return unhandled
    }
  }
}

function describeSave(outcome: ResourceSaveOutcome<ChartMeta>): string {
  switch (outcome.kind) {
    case 'ok':
      return `saved ${outcome.meta?.name ?? '(no listing row)'} at ${outcome.ref.revision}`
    case 'conflict':
      // Newer work stands. A host reloads at the ref this carries and asks the viewer again.
      return `conflict at ${outcome.current.revision}: ${outcome.message}`
    case 'not-found':
      return `gone: ${outcome.message}`
    case 'not-saving':
      // Refused before the store was touched at all: the chart holds content it could not put back.
      return `not saving: ${outcome.message}`
    default: {
      const unhandled: never = outcome
      return unhandled
    }
  }
}

function describeRemove(outcome: ResourceRemoveOutcome): string {
  switch (outcome.kind) {
    case 'ok':
      return 'deleted'
    case 'conflict':
      return `conflict at ${outcome.current.revision}: ${outcome.message}`
    case 'not-found':
      return `gone: ${outcome.message}`
    default: {
      const unhandled: never = outcome
      return unhandled
    }
  }
}

/** The kinds as a value. A member added or removed fails to compile here too, and reads as a list. */
const LOAD_KINDS: Record<ResourceLoadOutcome<ChartBody>['kind'], true> = { ok: true, 'not-found': true, invalid: true, unavailable: true, cancelled: true }
const SAVE_KINDS: Record<ResourceSaveOutcome<ChartMeta>['kind'], true> = { ok: true, conflict: true, 'not-found': true, 'not-saving': true }
const REMOVE_KINDS: Record<ResourceRemoveOutcome['kind'], true> = { ok: true, conflict: true, 'not-found': true }

describe('every outcome a save/load consumer switches on', () => {
  it('the load union is those five kinds, and a chart produces every one of them', async () => {
    expect(Object.keys(LOAD_KINDS).sort()).toEqual(['cancelled', 'invalid', 'not-found', 'ok', 'unavailable'])
    const base = memorySaveLoadAdapter()
    const good = await base.charts.create(rowFor('Good', 'NQ', '1h'))
    const unreadable = await base.charts.create({ name: 'Unreadable', symbol: 'CL', timeframe: '1h', content: JSON.stringify({ v: 99 }) })
    if (good.kind !== 'ok' || unreadable.kind !== 'ok') throw new Error('unreachable')
    const offline = new Error('the network went away')
    let down = false
    const charts: ResourceStore<ChartMeta, ChartBody> = { ...base.charts, load: (id, signal) => (down ? Promise.reject(offline) : base.charts.load(id, signal)) }
    const api = chartApi({ adapter: { ...base, charts } })
    expect(describeLoad(await api.load(good.ref.id))).toBe(`opened Good at ${good.ref.revision}`)
    expect(describeLoad(await api.load('no-such-chart'))).toBe(`gone: ${t('host.saveNotFound')}`)
    expect(describeLoad(await api.load(unreadable.ref.id))).toBe(`refused: ${t('host.loadInvalid')}`)
    down = true
    expect(describeLoad(await api.load(good.ref.id))).toBe(`unreachable: ${t('host.loadUnavailable')} / the network went away`)
    down = false
    const abandoned = new AbortController()
    abandoned.abort()
    expect(describeLoad(await api.load(good.ref.id, abandoned.signal))).toBe('abandoned')
  })

  it('the save union is those four kinds, and a chart produces every one of them', async () => {
    expect(Object.keys(SAVE_KINDS).sort()).toEqual(['conflict', 'not-found', 'not-saving', 'ok'])
    const adapter = memorySaveLoadAdapter()
    // This chart refuses the symbol a load brings AND the one on screen, so the body fails part-way
    // and the content it held fails to go back: the one way into `not-saving`.
    const api = chartApi({ adapter, refuse: ['CL', 'ES'] })
    const saved = await api.save('Morning')
    expect(describeSave(saved)).toMatch(/^saved Morning at /)
    if (saved.kind !== 'ok') throw new Error('unreachable')
    // Another tab writes first, and the chart's next save quotes a revision that no longer stands.
    const elsewhere = await adapter.charts.update(saved.ref, rowFor('Morning', 'ES', '1h'))
    if (elsewhere.kind !== 'ok') throw new Error('unreachable')
    expect(describeSave(await api.save('Morning'))).toBe(`conflict at ${elsewhere.ref.revision}: ${t('host.saveConflict')}`)
    // And then it is deleted out from under the chart entirely.
    await adapter.charts.remove(elsewhere.ref)
    expect(describeSave(await api.save('Morning'))).toBe(`gone: ${t('host.saveNotFound')}`)
    const refused = await adapter.charts.create(rowFor('Refused', 'CL', '1h'))
    if (refused.kind !== 'ok') throw new Error('unreachable')
    expect(describeLoad(await api.load(refused.ref.id))).toBe(`refused: ${t('host.loadNotRestored')}`)
    expect(api.notSaving()).toBe(true)
    expect(describeSave(await api.save('Morning'))).toBe(`not saving: ${t('host.notSaving')}`)
  })

  it('the remove union is those three kinds, and a chart produces every one of them', async () => {
    expect(Object.keys(REMOVE_KINDS).sort()).toEqual(['conflict', 'not-found', 'ok'])
    const adapter = memorySaveLoadAdapter()
    const api = chartApi({ adapter })
    // Nothing open is nothing to delete.
    expect(describeRemove(await api.remove())).toBe(`gone: ${t('host.saveNotFound')}`)
    const saved = await api.save('Morning')
    if (saved.kind !== 'ok') throw new Error('unreachable')
    const elsewhere = await adapter.charts.update(saved.ref, rowFor('Morning', 'ES', '1h'))
    if (elsewhere.kind !== 'ok') throw new Error('unreachable')
    expect(describeRemove(await api.remove())).toBe(`conflict at ${elsewhere.ref.revision}: ${t('host.saveConflict')}`)
    const again = await api.save('Morning', { asNew: true })
    if (again.kind !== 'ok') throw new Error('unreachable')
    expect(describeRemove(await api.remove())).toBe('deleted')
  })

  it('a load the caller abandoned RESOLVES with cancelled: no verb of the family rejects for it', async () => {
    const adapter = memorySaveLoadAdapter()
    const created = await adapter.charts.create(rowFor('Morning', 'NQ', '1h'))
    if (created.kind !== 'ok') throw new Error('unreachable')
    const api = chartApi({ adapter })
    const abandoned = new AbortController()
    abandoned.abort()
    // Settled either way, then read: an outcome under `resolved` is the contract, an error under
    // `rejected` is the old shape of it.
    const settled = await api.load(created.ref.id, abandoned.signal).then(
      (value) => ({ resolved: value }),
      (error: unknown) => ({ rejected: error }),
    )
    expect(settled).toEqual({ resolved: { kind: 'cancelled' } })
    // A later load supersedes one still in flight, and the superseded call answers the same way,
    // with no signal of the caller's own involved.
    const other = await adapter.charts.create(rowFor('Evening', 'CL', '4h'))
    if (other.kind !== 'ok') throw new Error('unreachable')
    const release = new Map<string, () => void>()
    const charts: ResourceStore<ChartMeta, ChartBody> = {
      ...adapter.charts,
      load: (id) =>
        new Promise((resolve, reject) => {
          release.set(id, () => adapter.charts.load(id).then(resolve, reject))
        }),
    }
    const slow = chartApi({ adapter: { ...adapter, charts } })
    const first = slow.load(created.ref.id).then(
      (value) => ({ resolved: value }),
      (error: unknown) => ({ rejected: error }),
    )
    const second = slow.load(other.ref.id)
    release.get(other.ref.id)!()
    expect((await second).kind).toBe('ok')
    release.get(created.ref.id)!()
    expect(await first).toEqual({ resolved: { kind: 'cancelled' } })
  })

  it('a chart with no adapter REJECTS every verb, because nothing was wired rather than something failed', async () => {
    const api = chartApi({ adapter: null })
    await expect(api.save('Morning')).rejects.toThrow(/no save\/load adapter/)
    await expect(api.load('anything')).rejects.toThrow(/no save\/load adapter/)
    await expect(api.remove()).rejects.toThrow(/no save\/load adapter/)
    // What a host can still do without one: read the chart's content, and apply one it holds itself.
    expect(api.serialize().symbol).toBe('ES')
    expect(api.current()).toBeNull()
    expect(api.notSaving()).toBe(false)
  })
})

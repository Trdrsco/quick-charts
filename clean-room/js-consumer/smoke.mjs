// Plain-JS ESM consumer: the tarball must RESOLVE and EXECUTE (not just typecheck) in a project
// with no TypeScript at all. Pure exports run for real; DOM-needing exports only need to exist.
import { BUILT_IN_INDICATORS, attachDrawings, attachIndicators, buildManifestPlots, coerceScaleMode, createChart, createUdfDatafeed, isIntradayTimeframe, mergeOverrides, olderPageVerdict, parseSessionModel, planPaneOp, sessionStateAt, tfToUdfResolution } from 'quickcharts'
import { parseDrawingsStore, serializeDrawingsStore, drawingTools } from 'quickcharts/drawings'

const fail = (msg) => {
  console.error(`clean-room js (esm): ${msg}`)
  process.exit(1)
}

if (typeof createChart !== 'function') fail('createChart missing')
if (typeof createUdfDatafeed !== 'function') fail('createUdfDatafeed missing')
if (typeof attachDrawings !== 'function') fail('attachDrawings missing')
if (olderPageVerdict({ bars: [], noData: true }, 100, false).kind !== 'end') fail('olderPageVerdict wrong')
if (tfToUdfResolution('1d') !== '1D') fail('tfToUdfResolution wrong')
if (typeof mergeOverrides(null).appearance.background !== 'string') fail('mergeOverrides defaults wrong')
if (drawingTools.all().length < 80) fail(`drawingTools too small: ${drawingTools.all().length}`)

// Draw → persist → reload, through the SHIPPED persistence codec: a drawing created via the
// registry must survive serializeDrawingsStore → parseDrawingsStore → registry restore with its
// document unchanged. This is the store a licensee's saved charts live in.
const line = drawingTools.create('trend_line', 'cr-1', [
  { time: 60, price: 1 },
  { time: 120, price: 2 },
])
if (!line) fail('trend_line did not create')
const saved = serializeDrawingsStore({ ES: [line.toJSON()] })
const loaded = parseDrawingsStore(saved)
const restored = loaded.ES && loaded.ES[0] ? drawingTools.restore(loaded.ES[0]) : null
if (!restored) fail('drawing did not restore from the persisted store')
if (JSON.stringify(restored.toJSON()) !== JSON.stringify(line.toJSON())) fail('draw/persist/reload round-trip drifted')
if (parseDrawingsStore('garbage {{{').constructor !== Object) fail('parseDrawingsStore not total')

// The indicator pipeline executes for real: a manifest + computed channels walk into the render
// spec with warmup gaps as whitespace and histogram sign-coloring applied.
if (typeof attachIndicators !== 'function') fail('attachIndicators missing')
const spec = buildManifestPlots(
  { manifest: { pane: 'pane', plots: { v: { kind: 'histogram', up: '#0f0', down: '#f00' } } }, plots: { v: [1, -1, null] } },
  [60, 120, 180],
  'T',
  '#abc',
)
if (spec.placement !== 'pane') fail('walker placement wrong')
if (spec.plots[0].data.length !== 2) fail('histogram should drop the null, not bridge it')
if (spec.plots[0].data[1].color !== '#f00') fail('histogram sign-coloring wrong')

// The parity modules execute from the shipped artifact: pane planning conserves height, the
// session classifier answers, and the scale-mode coercion fails closed.
const plan = planPaneOp({ heights: { 0: 300, 1: 100 }, remembered: {} }, { kind: 'collapse', pane: 1 })
if (plan.apply[1] === undefined || plan.apply[0] + plan.apply[1] !== 400) fail('pane plan does not conserve height')
if (sessionStateAt(parseSessionModel({ timezone: 'Etc/UTC', session: '24x7' }), 1_700_000_000) !== 'open') fail('a continuous session must always be open')
if (coerceScaleMode('banana') !== 'normal') fail('scale-mode coercion not failing closed')
if (isIntradayTimeframe('1d') || !isIntradayTimeframe('5m')) fail('intraday predicate wrong')

// The built-in indicators execute from the shipped artifact: the registry holds the 23, and one
// computes over plain bars and walks into the render spec with nothing else of ours installed.
if (BUILT_IN_INDICATORS.length !== 23) fail(`built-in registry holds ${BUILT_IN_INDICATORS.length}, not 23`)
const rsi = BUILT_IN_INDICATORS.find((d) => d.id === 'rsi')
const rsiBars = Array.from({ length: 40 }, (_, i) => ({ t: 60 * (i + 1), o: 100 + i, h: 101 + i, l: 99 + i, c: 100.5 + i, v: 10 }))
const rsiInputs = Object.fromEntries(Object.entries(rsi.manifest.inputs).map(([k, s]) => [k, s.default]))
const rsiSpec = buildManifestPlots({ manifest: rsi.manifest, plots: rsi.compute(rsiBars, rsiInputs) }, rsiBars.map((b) => b.t), 'RSI', '#f5a623')
if (rsiSpec.placement !== 'pane' || rsiSpec.plots[0].data.filter((p) => 'value' in p).length === 0) fail('the built-in RSI did not compute')
if (!rsiSpec.fills || !rsiSpec.fills[0].upperData) fail('the built-in RSI background must carry its level edges')

console.log('clean-room js (esm): ok')

// The order ticket: the tarball must resolve and its pure core must execute; the mount only needs to exist.
const ticket = await import('@trdrs/order-ticket')
if (typeof ticket.createOrderTicket !== 'function') fail('createOrderTicket missing')
if (typeof ticket.Panel !== 'function') fail('Panel missing')
const ticketPlan = ticket.buildSubmitPlan({ scope: 'x|1', instrument: 'ESZ2026', root: 'ES', side: 'sell', qty: 1, orderType: 'Market', limitPrice: 0, stopPrice: 0, stopLimitPrice: 0, canSnapEntry: true, tick: 0.25, markRef: 5000, entryRef: 5000, tif: 'GTC', sl: { enabled: false, price: 0, ticks: 0 }, tp: { enabled: false, price: 0, ticks: 0 }, strategy: null })
if (!ticketPlan.ok || ticketPlan.key !== 'x|1|ESZ2026|sell|1|market||||gtc|sl|tp') fail(`buildSubmitPlan wrong: ${JSON.stringify(ticketPlan)}`)
if (ticket.ticketStrings().t('panel.buy') !== 'Buy') fail('built-in English missing')
console.log('clean-room js (esm): order ticket OK')

// The optional REST save/load adapter, over a host service that lives in this file. The point is
// that a fresh project can reach `quickcharts/adapters/rest` from the packed tarball, hand it its
// own transport, and get the port's typed outcomes back: nothing here configures an origin, a
// credential or a header, because the adapter takes none.
const { createRestSaveLoadAdapter, RestSaveLoadError } = await import('quickcharts/adapters/rest')
if (typeof createRestSaveLoadAdapter !== 'function') fail('createRestSaveLoadAdapter missing')

const BASE = 'https://saves.example.com/v1'
const rows = new Map()
let seq = 0
const service = async (url, init) => {
  const [path, query = ''] = url.slice(BASE.length).split('?')
  const parts = path.split('/').filter(Boolean)
  const collection = parts[0] === 'drawings' ? `drawings?${query}` : parts[0]
  const id = parts[1]
  const answer = (status, body) => ({ status, text: async () => (body === undefined ? '' : JSON.stringify(body)) })
  const body = init.body === undefined ? null : JSON.parse(init.body)
  if (id === undefined) {
    if (init.method === 'GET') return answer(200, { items: [...rows].filter(([, r]) => r.collection === collection).map(([rowId, r]) => ({ id: rowId, revision: String(r.revision), ...r.meta })) })
    const rowId = `row-${++seq}`
    rows.set(rowId, { collection, revision: 1, body, meta: { name: body.name, symbol: body.symbol, timeframe: body.timeframe, updatedAt: Date.now() } })
    return answer(200, { id: rowId, revision: '1' })
  }
  const row = rows.get(id)
  if (init.method === 'GET') return row ? answer(200, { id, revision: String(row.revision), body: row.body }) : answer(404, { error: 'not_found' })
  if (init.headers['if-match'] === undefined) return answer(428, { error: 'revision_required' })
  if (!row) return answer(404, { error: 'not_found' })
  if (init.headers['if-match'] !== String(row.revision)) return answer(409, { error: 'conflict', current: { id, revision: String(row.revision) } })
  if (init.method === 'DELETE') {
    rows.delete(id)
    return answer(200, { id, revision: String(row.revision) })
  }
  row.revision += 1
  row.body = body
  return answer(200, { id, revision: String(row.revision) })
}

const saves = createRestSaveLoadAdapter({ baseUrl: BASE, request: service })
const chartBody = { name: 'Morning', symbol: 'ES', timeframe: '5m', content: '{"v":1}' }
const created = await saves.charts.create(chartBody)
if (created.kind !== 'ok') fail(`the REST create did not land: ${JSON.stringify(created)}`)
if ((await saves.charts.list()).length !== 1) fail('the REST listing did not answer the created row')
const read = await saves.charts.load(created.ref.id)
if (!read || read.body.content !== chartBody.content) fail('the REST load did not answer the stored chart')
const updated = await saves.charts.update(created.ref, { ...chartBody, timeframe: '1h' })
if (updated.kind !== 'ok' || updated.ref.revision === created.ref.revision) fail('the REST update did not move the revision')
const stale = await saves.charts.update(created.ref, chartBody)
if (stale.kind !== 'conflict' || stale.current.revision !== updated.ref.revision) fail('a stale REST write must be a conflict carrying the ref that stands')
if (await saves.charts.load('no-such-chart') !== null) fail('an unknown id must read as null')
if ((await saves.charts.remove(updated.ref)).kind !== 'ok') fail('the REST delete did not land')
if ((await saves.charts.remove(updated.ref)).kind !== 'not-found') fail('a second REST delete must be not-found')
// A status the contract gives no meaning to is raised with what it was, never swallowed as empty.
const outage = createRestSaveLoadAdapter({ baseUrl: BASE, request: async () => ({ status: 503, text: async () => '' }) })
const raised = await outage.charts.list().then(() => null, (e) => e)
if (!(raised instanceof RestSaveLoadError) || raised.status !== 503) fail(`a 503 must raise a typed error: ${String(raised)}`)
console.log('clean-room js (esm): REST save/load adapter OK')

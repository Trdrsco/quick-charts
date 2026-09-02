// Plain-JS ESM consumer: the tarball must RESOLVE and EXECUTE (not just typecheck) in a project
// with no TypeScript at all. Pure exports run for real; DOM-needing exports only need to exist.
import { attachDrawings, attachIndicators, buildManifestPlots, coerceScaleMode, createChart, createUdfDatafeed, isIntradayTf, mergeOverrides, olderPageVerdict, planPaneOp, sessionOf, tfToUdfResolution } from 'quickcharts'
import { parseDrawingsStore, serializeDrawingsStore, toolRegistry } from '@trdrs/chart-drawings'

const fail = (msg) => {
  console.error(`clean-room js (esm): ${msg}`)
  process.exit(1)
}

if (typeof createChart !== 'function') fail('createChart missing')
if (typeof createUdfDatafeed !== 'function') fail('createUdfDatafeed missing')
if (typeof attachDrawings !== 'function') fail('attachDrawings missing')
if (olderPageVerdict({ bars: [], noData: true }, 100, false).kind !== 'end') fail('olderPageVerdict wrong')
if (tfToUdfResolution('1d') !== '1D') fail('tfToUdfResolution wrong')
if (mergeOverrides(null).trading.pnlMode !== 'money') fail('mergeOverrides defaults wrong')
if (toolRegistry.all().length < 80) fail(`toolRegistry too small: ${toolRegistry.all().length}`)

// Draw → persist → reload, through the SHIPPED persistence codec: a drawing created via the
// registry must survive serializeDrawingsStore → parseDrawingsStore → registry restore with its
// document unchanged. This is the store a licensee's saved charts live in.
const line = toolRegistry.create('trend_line', 'cr-1', [
  { time: 60, price: 1 },
  { time: 120, price: 2 },
])
if (!line) fail('trend_line did not create')
const saved = serializeDrawingsStore({ ES: [line.toJSON()] })
const loaded = parseDrawingsStore(saved)
const restored = loaded.ES && loaded.ES[0] ? toolRegistry.restore(loaded.ES[0]) : null
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
if (sessionOf(1_700_000_000, 'crypto') !== 'open') fail('crypto must always be open')
if (coerceScaleMode('banana') !== 'normal') fail('scale-mode coercion not failing closed')
if (isIntradayTf('1d') || !isIntradayTf('5m')) fail('intraday predicate wrong')

console.log('clean-room js (esm): ok')

// The order ticket: the tarball must resolve and its pure core must execute; the mount only needs to exist.
const ticket = await import('@trdrs/order-ticket')
if (typeof ticket.createOrderTicket !== 'function') fail('createOrderTicket missing')
if (typeof ticket.Panel !== 'function') fail('Panel missing')
const ticketPlan = ticket.buildSubmitPlan({ scope: 'x|1', instrument: 'ESZ2026', root: 'ES', side: 'sell', qty: 1, orderType: 'Market', limitPrice: 0, stopPrice: 0, stopLimitPrice: 0, canSnapEntry: true, tick: 0.25, markRef: 5000, entryRef: 5000, tif: 'GTC', sl: { enabled: false, price: 0, ticks: 0 }, tp: { enabled: false, price: 0, ticks: 0 }, strategy: null })
if (!ticketPlan.ok || ticketPlan.key !== 'x|1|ESZ2026|sell|1|market||||gtc|sl|tp') fail(`buildSubmitPlan wrong: ${JSON.stringify(ticketPlan)}`)
if (ticket.ticketStrings().t('panel.buy') !== 'Buy') fail('built-in English missing')
console.log('clean-room js (esm): order ticket OK')

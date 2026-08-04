// Plain-JS ESM consumer: the tarball must RESOLVE and EXECUTE (not just typecheck) in a project
// with no TypeScript at all. Pure exports run for real; DOM-needing exports only need to exist.
import { attachDrawings, createChart, createUdfDatafeed, mergeOverrides, olderPageVerdict, tfToUdfResolution } from '@trdrs/chart'
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

console.log('clean-room js (esm): ok')

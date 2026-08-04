// Plain-JS ESM consumer: the tarball must RESOLVE and EXECUTE (not just typecheck) in a project
// with no TypeScript at all. Pure exports run for real; DOM-needing exports only need to exist.
import { createChart, createUdfDatafeed, mergeOverrides, olderPageVerdict, tfToUdfResolution } from '@trdrs/chart'
import { toolRegistry } from '@trdrs/chart-drawings'

const fail = (msg) => {
  console.error(`clean-room js (esm): ${msg}`)
  process.exit(1)
}

if (typeof createChart !== 'function') fail('createChart missing')
if (typeof createUdfDatafeed !== 'function') fail('createUdfDatafeed missing')
if (olderPageVerdict({ bars: [], noData: true }, 100, false).kind !== 'end') fail('olderPageVerdict wrong')
if (tfToUdfResolution('1d') !== '1D') fail('tfToUdfResolution wrong')
if (mergeOverrides(null).trading.pnlMode !== 'money') fail('mergeOverrides defaults wrong')
if (toolRegistry.all().length < 80) fail(`toolRegistry too small: ${toolRegistry.all().length}`)
console.log('clean-room js (esm): ok')

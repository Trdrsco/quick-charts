// The clean-room host of the Quick Charts conformance suite: every check in
// packages/chart/test/conformance, run over the INSTALLED tarball in a happy-dom document. The suite
// arrives as the copy clean-room/run.mjs compiled beside this consumer (./conformance, ignored by
// git), so its `quickcharts` imports resolve to node_modules/quickcharts here exactly as a customer's
// would. The browser shim that stands in for the canvas travels with it.
//
//   node conformance.mjs
//
// The host declares what it cannot mount: the drawing plane stays off until W4-B lands its fix in
// the widget constructor (mounting with drawings on throws before the layout exists), so the checks
// that need drawings report skipped with that reason. Checks that document a known defect are
// skipped by the suite itself and printed with their sentence.
import { Window } from 'happy-dom'
import { BROWSER_GLOBALS, installBrowserShim } from './conformance/browserShim.js'
import { formatResults, runConformance } from './conformance/index.js'

const window = new Window({ url: 'http://localhost/' })
for (const name of BROWSER_GLOBALS) {
  if (name in window && !(name in globalThis)) Object.defineProperty(globalThis, name, { value: window[name], configurable: true, writable: true })
}
const shim = installBrowserShim(window)

const { createChart } = await import('quickcharts')

const results = await runConformance({
  createWidget: (options) => createChart(options),
  document: window.document,
  unavailable: {
    features: { drawings: false },
    reason: "W4-B: createChart with drawings on throws Cannot access 'layout' before initialization",
  },
})

console.log(formatResults(results))
const failed = results.filter((r) => r.status === 'failed')
const passed = results.filter((r) => r.status === 'passed').length
const skipped = results.filter((r) => r.status === 'skipped').length
console.log(`\nclean-room conformance: ${passed} passed, ${skipped} skipped, ${failed.length} failed`)

shim.uninstall()
await window.happyDOM.close()
if (failed.length > 0) process.exit(1)

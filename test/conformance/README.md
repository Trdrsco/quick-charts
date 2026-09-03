# The Quick Charts conformance suite

One assertion module, three hosts. `index.ts` holds every check the chart's public contract is
held to: the API surface, feature configuration, the access policy, command dispatch and shortcut
remapping, lifecycle and disposal, theme switching and palette apply and reset, two instances in one
document, strings through the catalog, accessibility, image capture, download and copy, chart-root
fullscreen, persistence over two independent host adapters, the feed's capability fallback, older
paging, reconnect snapshots and terminal unavailable state, data-only replay, the four scale modes,
sessions and holiday injection, compare placement, indicator families, layouts, the seven styles,
and the drawing catalog.

The module imports `quickcharts` and `quickcharts/drawings` and nothing else. It observes only what
a consumer can observe: the widget's answers, its events, the theme root attribute the theme manifest
publishes, ARIA roles and accessible names, and element identity. It is a test-only path: it is not
exported by the package and never packed.

## Importing it

Every host builds a `ConformanceHost` and runs the checks through it.

| Host | Where | How it reaches the module |
|---|---|---|
| The workspace build | `packages/chart/test/conformance/conformance.test.ts` | `import { CONFORMANCE_CHECKS, runCheck } from './index'` under Vitest and happy-dom, `createChart` from the package source, the browser shim from `packages/chart/scripts/browserShim.ts` standing in for the canvas. |
| The clean-room consumers | `clean-room/run.mjs` | Copies this folder and the browser shim beside the consumers, typechecks the copy against the packed declarations with `skipLibCheck` off, compiles it, and runs it under happy-dom over the installed tarball (`clean-room/js-consumer/conformance.mjs`). |
| The app mount | `apps/web/e2e/conformance.spec.ts` | Bundles `packages/chart/test/conformance/index.ts` into the widget smoke page and runs `runConformance` in the browser with `createWidget` bound to the app's own composition (`apps/web/src/integrations/quickcharts/compose.ts`). The page exposes the results; the spec asserts every one passed or was skipped for a stated reason. |

A host that cannot mount a plane names it in `unavailable`; the checks that need it report skipped
with the reason rather than passing on nothing. A host that can stand in a Fullscreen API or an
image-taking clipboard passes `fullscreen` and `clipboard`; a browser host leaves them out and the
checks prove the refusal path instead.

## The host contract

```ts
import { runConformance, formatResults, type ConformanceHost } from '../../packages/chart/test/conformance/index'

const host: ConformanceHost = {
  createWidget: (options) => createChart(options),
  document,
}
const results = await runConformance(host)
console.log(formatResults(results))
if (results.some((r) => r.status === 'failed')) process.exit(1)
```

`CONFORMANCE_CHECKS` is the list; `runCheck(check, host)` runs one; `skipReason(check, host)` says
why a host would skip it. A check that documents a known defect names it in `defect` and is skipped
by every host until the fix lands; the sentence travels with the check so no report loses it.

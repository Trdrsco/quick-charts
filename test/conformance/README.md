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
| The app mount | `apps/web/e2e/conformance.spec.ts` | Loads this module into the live app page through the dev server's filesystem serving (`/@fs/<workspace>/packages/chart/test/conformance/index.ts`), where its `quickcharts` imports resolve to the same source URLs the app's do, and runs `runCheck` in the browser with `createWidget` bound to the app's own composition (`apps/web/src/integrations/quickcharts/compose.ts`, reached through the door `compositionDoor.ts` puts on `window` under the dev server only). The spec asserts every result passed or was skipped for a stated reason, and prints the report. |

A host that cannot mount a plane names it in `unavailable`; the checks that need it report skipped
with the reason rather than passing on nothing. A host that can stand in a Fullscreen API or an
image-taking clipboard passes `fullscreen` and `clipboard`; a browser host leaves them out and the
checks prove the refusal path instead.

The app host is the one whose `createWidget` is a production door rather than the package
constructor. What a caller of that door decides rides through from the check's options: the
symbol, timeframe, features, access, indicators, layout, preferences, the feed and the save/load
adapter. What the app decides for every chart it mounts stands as the app mounts it: its theme, its
language, where the viewer's preferences live, how drawings persist, the image line, the fullscreen
frame, the search recents, the drawing assets and the extensions. A check observing one of those
planes observes the app's real choice, and where its expectation differs it fails naming the value
the app mounted; the spec reports that as a finding against the composition or the check, never as
a skip. The engine is mocked at the network edge, with the revisioned `/api/charts` families in
memory, so a check that mounts without an adapter of its own saves through the app's engine
adapter. Every mount gets its own mount id, so no check reads another's stored preferences.

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

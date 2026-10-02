# The Quick Charts conformance suite

One assertion module, three hosts. `index.ts` holds every check the chart's public contract is
held to: the API surface, feature configuration, the access policy, command dispatch and shortcut
remapping, lifecycle and disposal, theme switching and palette apply and reset, two instances in one
document, strings through the catalog, accessibility, image capture, download and copy, chart-root
fullscreen, persistence over two independent host adapters, the feed's capability fallback, older
paging, reconnect snapshots and terminal unavailable state, data-only replay, the four scale modes,
sessions and holiday injection, compare placement, indicator families, layouts, the seven styles,
the drawing catalog, and the presentation plane: hidden controls that leave their commands, a host
control in a top-bar slot, and a host's drawings for the chart's icons.

The module imports `@trdrs/quickcharts` and `@trdrs/quickcharts/drawings` and nothing else. It observes only what
a consumer can observe: the widget's answers, its events, the theme root attribute the theme manifest
publishes, ARIA roles and accessible names, and element identity. It is a test-only path, outside
the package's exports and its packed files.

## Importing it

Every host builds a `ConformanceHost` and runs the checks through it.

| Host | Where | How it reaches the module |
|---|---|---|
| The workspace build | `test/conformance/conformance.test.ts` | `import { CONFORMANCE_CHECKS, runCheck } from './index'` under Vitest and happy-dom, `createChart` from the package source, the browser shim from `scripts/browserShim.ts` standing in for the canvas. |
| The clean-room consumers | `clean-room/run.mjs` | Copies this folder and the browser shim beside the consumers, typechecks the copy against the packed declarations with `skipLibCheck` off, compiles it, and runs it under happy-dom over the installed tarball (`clean-room/js-consumer/conformance.mjs`). |
| An application mount | the application's own end-to-end suite | An application that embeds Quick Charts loads this module in the browser and runs `runCheck` with `createWidget` bound to its own composition, then asserts that every result passed or was skipped for a stated reason. |

A host that cannot mount a plane names it in `unavailable`; the checks that need it report skipped
with the reason rather than passing on nothing. A host whose door decides a construction choice for
every widget it builds (the theme mode, the drawing persistence mode) names it in `fixed` with the
reason; a check that must make that choice itself (`chooses`) reports skipped with the reason, and
every other check runs and observes the host's real choice. A host that can stand in a Fullscreen
API or an image-taking clipboard passes `fullscreen` and `clipboard`; a browser host leaves them
out and the checks prove the refusal path instead.

What each host declares:

| Host | `unavailable` | `fixed` | `fullscreen` / `clipboard` |
|---|---|---|---|
| The workspace build | nothing: every plane mounts | nothing: `createChart` takes every option | both, over the browser shim |
| The clean-room consumers | nothing: every plane mounts | nothing: `createChart` takes every option | both, over the browser shim |
| An application mount | nothing: every plane mounts | what the application decides for every chart it mounts, for example `theme` (an application that composes every chart in its own mode and palette) and `drawingPersistence` (an application that keeps drawings in a separate symbol-global document) | neither: a real browser refuses without a gesture |

So the workspace and clean-room hosts run `theme.two-instances` and `persistence.drawings.mode`,
and an application host that fixes those two reports both skipped with those two reasons.

An application host's `createWidget` is a production door rather than the package constructor.
What a caller of that door decides rides through from the check's options: the symbol, timeframe,
features, the presentation, the icons, access, indicators, layout, preferences, the feed and the
save/load adapter. What the application decides for every chart it mounts stands as the
application mounts it: its theme, its language, where the viewer's preferences live, how drawings
persist, the image line, the fullscreen frame, the search recents, the drawing assets and the
extensions. A check observing one of those planes observes the application's real choice, and
where its expectation differs it fails naming the value the application mounted; the
application's suite reports that as a finding against the composition or the check, never as a
skip. A check that mounts without an adapter of its own saves through the application's adapter,
so the application's suite serves that adapter's backend from memory. An application host gives
every mount its own storage scope, so no check reads another's stored preferences, and a check
that balances the widget's document listeners counts every listener on the document, so the page
adds none of its own while the checks run.

## The host contract

```ts
import { runConformance, formatResults, type ConformanceHost } from '../../test/conformance/index'

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

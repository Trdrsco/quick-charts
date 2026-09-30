# Support

Quick Charts is supported through the `quick-charts` repository. This page states what the
maintainers support, where the library is verified to run, and how versions change.

## What is supported

- The documented API of the `quickcharts` package: the root entrypoint, `quickcharts/drawings`,
  `quickcharts/adapters/rest`, and `quickcharts/styles.css`.
- The behavior the package tests prove: the feature manifest in `dist/feature-manifest.json`, the
  theme manifest in `dist/theme-manifest.json`, the REST wire contract in `dist/rest-openapi.json`,
  and the contract tests beside the source.
- The `README.md` examples, which type-check against the package exports in its test suite.

Outside support: your datafeed and its data, your storage service, your page's other scripts and
styles, the internal selectors and custom properties of the stylesheet, and any behavior reached by
importing a path the package does not export.

## Ask a question

Search the open and closed issues, then open an issue with the version you installed and the
smallest page that shows the question. Questions about your own datafeed or backend are answered
only as far as the library's contract reaches.

## Browser and runtime support

Quick Charts is a browser package with ESM exports and TypeScript declarations. The clean-room
consumers verify declarations with library checking enabled and production bundling without
workspace dependencies. The release toolchain uses Node 24.15.0 and npm 12.1.0.

The required `lightweight-charts` 5 peer is installed automatically with default npm peer
resolution. The primary command is `npm install quickcharts`.

The packed production bundle passes the automated public conformance suite in Chromium, Firefox
and WebKit through Playwright 1.61.0. These checks cover chart behavior, controls, themes,
persistence, accessible names and lifecycle. Playwright WebKit is not a claim of measured Safari
or iOS support. Manual screen-reader acceptance and actual Safari/device measurements remain
release evidence to complete before advertising those environments.

The optional local WebView guest is excluded from the npm package. No native-host distribution or
WebView support promise is part of this release. The stylesheet follows the root element's reading
direction and the controls honor `prefers-reduced-motion`.

## Versions

Versions follow Semantic Versioning.

- A **major** version removes or renames an export, changes the meaning of an option, or changes a
  saved format in a way an earlier version cannot read.
- A **minor** version adds surface: a new export, a new optional method or field on a port, a new
  option with a default that keeps the earlier behavior.
- A **patch** version fixes behavior without changing the surface.

The public surface is pinned by an API-surface test, so a change in it is a decision, never drift.
New capabilities on a port arrive as optional members; an implementation you wrote against an
earlier minor keeps compiling within the major.

## Deprecation

An export or option that is going away is marked `@deprecated` in the declarations, with its
replacement named in the note, for the remainder of the current major. It is removed in the next
major and never before. The changelog names each deprecation when it is introduced and when it is
removed.

## Support window

The latest minor of the latest major receives fixes. The previous major receives security fixes
for twelve months after the next major's first release, as `SECURITY.md` states.

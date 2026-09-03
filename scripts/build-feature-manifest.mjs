#!/usr/bin/env node
// The feature manifest generator: one built artifact, one published inventory.
//
//   dist/feature-manifest.json   every registry the chart ships, read from the built entrypoints the
//                                consumer installs: the seven styles, the built-in indicators, the drawing
//                                tools, the layout arrangements, the preset timeframes, the timezones, the
//                                command registry, the feature flags, the theme modes and roles, and the
//                                built-in locales
//
// It runs from `pnpm --filter quickcharts build:manifest`, and `postbuild` runs it after the theme
// generator for every build, so a manifest never describes an artifact older than itself. The
// registries are read from `dist/index.js` and `dist/drawings.js`, not from source: what the manifest
// publishes is what the tarball carries. The inventory tests hold the manifest to the source registries
// and the README's count claims to the manifest, so a product claim cannot outrun the code.
//
// The command registry is a runtime thing: it exists only inside a mounted widget. The script therefore
// mounts one real widget with every plane on into a happy-dom document, over a datafeed that serves
// nothing, with the browser shim standing in for the canvas and the layout, and reads
// `widget.commands.list()`.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Window } from 'happy-dom'

import { BROWSER_GLOBALS, installBrowserShim } from './browserShim.ts'
import { resolveFeatures } from '../src/widget/planes.ts'

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const manifestPath = join(pkgRoot, 'package.json')
const { version } = JSON.parse(readFileSync(manifestPath, 'utf8'))
const themeManifest = JSON.parse(readFileSync(join(pkgRoot, 'dist/theme-manifest.json'), 'utf8'))

// ── A document to mount into ────────────────────────────────────────────────────────────────────
const window = new Window({ url: 'http://localhost/' })
for (const name of BROWSER_GLOBALS) {
  if (name in window && !(name in globalThis)) Object.defineProperty(globalThis, name, { value: window[name], configurable: true, writable: true })
}
const shim = installBrowserShim(window)

// ── The built entrypoints, exactly as the tarball carries them ──────────────────────────────────
const root = await import(pathToFileURL(join(pkgRoot, 'dist/index.js')).href)
const drawings = await import(pathToFileURL(join(pkgRoot, 'dist/drawings.js')).href)

const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

/** The command registry, read off one mounted widget. */
function commandsOf() {
  const container = window.document.createElement('div')
  container.style.width = '800px'
  container.style.height = '400px'
  window.document.body.appendChild(container)
  const datafeed = {
    resolve: async () => null,
    history: async () => ({ bars: [], noData: true }),
    subscribeBars: () => () => undefined,
  }
  const widget = root.createChart({ container, datafeed, symbol: 'MANIFEST', timeframe: '1m' })
  try {
    return widget.commands
      .list()
      .map((spec) => ({ id: spec.id, scope: spec.scope, ...(spec.shortcut ? { shortcut: spec.shortcut } : {}) }))
      .sort(byId)
  } finally {
    widget.dispose()
    container.remove()
  }
}

const features = resolveFeatures()

const manifest = {
  version,
  styles: root.CHART_STYLES.map((id) => ({ id, valueShaped: root.valueShaped(id) })),
  indicators: root.BUILT_IN_INDICATORS.map((d) => ({ id: d.id, tag: d.tag, category: d.category, pane: d.manifest.pane })),
  drawings: drawings.drawingTools.all().map((t) => ({ id: t.type, category: t.category, anchors: t.anchors, ...(t.placement ? { placement: t.placement } : {}) })),
  layouts: root.ARRANGEMENTS.map((a) => ({ id: a.code, panes: a.count })),
  timeframes: root.TIMEFRAME_PRESETS.flatMap((g) => g.tokens.map((id) => ({ id, unit: g.unit }))),
  timezones: root.TIMEZONES.map((z) => ({ id: z.id, city: z.city })),
  commands: commandsOf(),
  features: Object.keys(features)
    .sort()
    .map((id) => ({ id, default: features[id] })),
  themes: {
    modes: themeManifest.modes,
    roles: themeManifest.roles.map((r) => ({ id: r.id, family: r.family, kind: r.kind })),
  },
  locales: root.BUILT_IN_LOCALES.map((l) => ({ id: l.code, tag: l.tag, dir: l.dir })),
}

const out = join(pkgRoot, 'dist/feature-manifest.json')
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, `${JSON.stringify(manifest, null, 2)}\n`)

shim.uninstall()
await window.happyDOM.close()

const counts = ['styles', 'indicators', 'drawings', 'layouts', 'timeframes', 'timezones', 'commands', 'features', 'locales'].map((k) => `${k} ${manifest[k].length}`)
console.log(`feature manifest: ${counts.join(', ')}, themes ${manifest.themes.modes.length} modes over ${manifest.themes.roles.length} roles`)
console.log(`  ${out}`)

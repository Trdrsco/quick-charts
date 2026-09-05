#!/usr/bin/env node
// The theme generator: one typed source, three generated artifacts.
//
//   dist/quickcharts.css     the distributable stylesheet, the built-in mode blocks followed by the
//                            authored structural rules and then every component recipe file under
//                            src/styles/components, in name order
//   dist/theme-manifest.json the published role inventory, both palettes, the scoped root
//                            attribute, and the stylesheet entry name
//   test/theme/vectors.json  the committed declaration vectors the drift gate compares against
//
// It runs from `pnpm --filter quickcharts build:theme`, and `postbuild` runs it for every build, so
// a build never ships a stylesheet older than the palettes it was generated from. It follows the
// bundler rather than preceding it because the bundler clears `dist` as it starts. Committing a
// palette change without rerunning it fails the drift block of `theme/stylesheet.test.ts`.
//
// The script imports the theme source directly (see scripts/stylesheet.mjs for why those modules
// carry no runtime import of their own).
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { THEME_MODES, THEME_ROLES } from '../src/theme/schema.ts'
import { BUILT_IN_THEMES } from '../src/theme/palettes.ts'
import { themeDeclarations, THEME_ROOT_ATTRIBUTE } from '../src/theme/css-contract.ts'
import { composeDistributableStylesheet } from './stylesheet.mjs'

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const CSS_ENTRY = 'quickcharts/styles.css'

// The stylesheet itself comes from the composition the guest build shares (scripts/stylesheet.mjs).
const css = composeDistributableStylesheet()

const manifest = {
  rootAttribute: THEME_ROOT_ATTRIBUTE,
  cssEntry: CSS_ENTRY,
  modes: [...THEME_MODES],
  families: [...new Set(THEME_ROLES.map((r) => r.family))].map((family) => ({
    family,
    roles: THEME_ROLES.filter((r) => r.family === family).map((r) => r.id),
  })),
  roles: THEME_ROLES.map((role) => ({
    id: role.id,
    family: role.family,
    kind: role.kind,
    description: role.description,
    ...('contrast' in role ? { contrast: { over: role.contrast.over, min: role.contrast.min } } : {}),
    values: Object.fromEntries(THEME_MODES.map((mode) => [mode, BUILT_IN_THEMES[mode][role.id]])),
  })),
}

const vectors = {
  rootAttribute: THEME_ROOT_ATTRIBUTE,
  modes: Object.fromEntries(THEME_MODES.map((mode) => [mode, themeDeclarations(BUILT_IN_THEMES[mode])])),
}

const write = (relative, contents) => {
  const path = join(pkgRoot, relative)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, contents)
  return path
}

const cssPath = write('dist/quickcharts.css', css)
const manifestPath = write('dist/theme-manifest.json', `${JSON.stringify(manifest, null, 2)}\n`)
const vectorsPath = write('test/theme/vectors.json', `${JSON.stringify(vectors, null, 2)}\n`)

const size = (text) => `${Buffer.byteLength(text, 'utf8')} bytes`
console.log(`theme: ${THEME_ROLES.length} roles in ${manifest.families.length} families, ${THEME_MODES.length} built-in palettes`)
console.log(`  ${cssPath} (${size(css)})`)
console.log(`  ${manifestPath}`)
console.log(`  ${vectorsPath}`)

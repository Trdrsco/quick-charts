#!/usr/bin/env node
// The WebView guest build: one self-contained page under dist/guest.
//
//   dist/guest/index.html            the page a native host loads from its own files
//   dist/guest/guest.css             the page's own sizing rules
//   dist/guest/quickcharts.css       the package stylesheet, composed from the theme source beside the page
//   dist/guest/quickcharts-guest.js  guest/main.ts with the chart and its renderer bundled in: no
//                                    bare import survives, nothing is fetched at runtime
//   dist/guest/build-manifest.json   the package version and the SHA-256 of every file above
//
// It runs from `pnpm --filter quickcharts build:guest`, and `postbuild` runs it after the theme
// generator, whose stylesheet it copies. The build is deterministic: the same source builds the
// same bytes, and the manifest carries no clock, so two builds compare equal file for file. The
// guest fixture (test/guest) builds twice into scratch directories through `--out` and proves it.
//
// The guest is packed nowhere: package.json's `files` leaves dist/guest out of the tarball. It is an
// artifact a native host copies into its own bundle, not a consumer install.
import { createHash } from 'node:crypto'
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'tsup'
import { lfSources } from './lf-sources.mjs'
import { composeDistributableStylesheet } from './stylesheet.mjs'

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const { version } = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8'))

const outArg = process.argv.find((a) => a.startsWith('--out='))
const out = outArg ? resolve(outArg.slice('--out='.length)) : join(pkgRoot, 'dist', 'guest')

rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })

await build({
  config: false,
  entry: { 'quickcharts-guest': join(pkgRoot, 'guest', 'main.ts') },
  outDir: out,
  format: ['esm'],
  platform: 'browser',
  target: 'es2022',
  // Everything the page runs is in this one file: the chart, its two bundled seams, and the
  // renderer, so the page loads with no bare specifier to resolve and no request to make.
  noExternal: [/.*/],
  splitting: false,
  sourcemap: false,
  minify: false,
  treeshake: true,
  dts: false,
  clean: false,
  silent: true,
  define: { __QC_VERSION__: JSON.stringify(version) },
  esbuildPlugins: [lfSources],
})

copyFileSync(join(pkgRoot, 'guest', 'index.html'), join(out, 'index.html'))
copyFileSync(join(pkgRoot, 'guest', 'guest.css'), join(out, 'guest.css'))
// The stylesheet is composed here from the same source the theme generator reads, so the guest
// needs no earlier build and can never carry a stylesheet older than the palettes.
writeFileSync(join(out, 'quickcharts.css'), composeDistributableStylesheet())

const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex')
const files = Object.fromEntries(
  readdirSync(out)
    .filter((name) => name !== 'build-manifest.json')
    .sort()
    .map((name) => [name, sha256(join(out, name))]),
)
const manifest = { version, entry: 'index.html', files }
writeFileSync(join(out, 'build-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)

console.log(`guest: ${Object.keys(files).length} files under ${out}`)
for (const [name, hash] of Object.entries(files)) console.log(`  ${name}  ${hash.slice(0, 12)}`)

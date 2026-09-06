// The bundler gate of the clean room: Vite builds the installed tarball the way a licensee's build
// does, and the bundles are read for what they must not carry.
//
//   node build.mjs
//
// Two builds. `full` bundles the root, the drawings subpath, the REST adapter and the stylesheet
// from src/full.ts; `root` bundles the root alone from src/root.ts. Both are library builds with
// the renderer external, so the output is the chart's own code and nothing else, and both are
// unminified so a name in the output is a name in the source. The checks: no test code, no trdrs
// host or service route, no path of this workspace, the renderer still a bare import, the
// stylesheet emitted with the chart's own selectors, and the REST adapter present in the full
// bundle and absent from the root-only one.
import { readdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'

const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, '..', '..')

const fail = (msg) => {
  console.error(`clean-room vite: ${msg}`)
  process.exit(1)
}

async function bundle(name, entry) {
  const outDir = join(here, 'dist', name)
  rmSync(outDir, { recursive: true, force: true })
  await build({
    root: here,
    configFile: false,
    logLevel: 'error',
    build: {
      outDir,
      emptyOutDir: true,
      minify: false,
      cssCodeSplit: false,
      lib: { entry: join(here, 'src', entry), formats: ['es'], fileName: name },
      rollupOptions: { external: ['lightweight-charts'] },
    },
  })
  const files = readdirSync(outDir).sort()
  const read = (suffix) =>
    files
      .filter((f) => f.endsWith(suffix))
      .map((f) => readFileSync(join(outDir, f), 'utf8'))
      .join('\n')
  return { files, js: read('.js'), css: read('.css') }
}

/** Every shape neither bundle may carry, each named for the report. */
const FORBIDDEN = [
  { name: 'test code', pattern: /\b(describe|expect)\s*\(|\bvitest\b|happy-dom/ },
  { name: 'a private host or service route', pattern: /trdrs\.co\b|localhost:8080|["'`]\/api\/|@trdrs\// },
  { name: 'a source path', pattern: /\/src\/internal\/|\/test\/|file:\/\/\// },
  { name: 'this checkout', pattern: new RegExp([repo, repo.replace(/\\/g, '/')].map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')) },
]

const ADAPTER = [/createRestSaveLoadAdapter/, /RestSaveLoadError/, /if-match/i]

const full = await bundle('full', 'full.ts')
const root = await bundle('root', 'root.ts')

for (const [name, out] of [
  ['full', full],
  ['root', root],
]) {
  if (!out.js) fail(`${name}: no JavaScript emitted (${out.files.join(', ')})`)
  for (const { name: shape, pattern } of FORBIDDEN) {
    const line = out.js.split('\n').find((l) => pattern.test(l))
    if (line !== undefined) fail(`${name} carries ${shape}: ${line.trim().slice(0, 120)}`)
  }
  if (!/from\s*["']lightweight-charts["']/.test(out.js)) fail(`${name}: the renderer is not a bare import`)
  if (!out.js.includes('createChart')) fail(`${name}: the widget constructor is missing`)
}

if (!full.css) fail(`full: no stylesheet emitted (${full.files.join(', ')})`)
if (!full.css.includes('.qc-chrome')) fail('full: the stylesheet carries none of the chart chrome')
for (const pattern of ADAPTER) if (!pattern.test(full.js)) fail(`full: the REST adapter is missing (${pattern})`)
for (const pattern of ADAPTER) if (pattern.test(root.js)) fail(`root: the REST adapter reached a root-only build (${pattern})`)
if (root.css) fail('root: a stylesheet was emitted without an import of it')

console.log(`clean-room vite: full ${full.files.join(', ')} (${full.js.length} bytes of JavaScript, ${full.css.length} of CSS); root ${root.files.join(', ')} (${root.js.length} bytes): ok`)

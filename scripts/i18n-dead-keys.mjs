#!/usr/bin/env node
// Lists catalog keys no source file mentions by their literal name. A key nobody reads is translated
// into every language for nothing, so this runs before a translation pass. A key can legitimately be
// absent here when code builds it dynamically (`tool.${type}`, `layout.${code}`, `session.${name}`
// via `arrangementName`, `toolName` or a template) — those prefixes are listed so the report stays a
// to-do list.
//
//   node scripts/i18n-dead-keys.mjs chart   keys under src/i18n/en, searched in src
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const target = process.argv[2]
const CFG = {
  chart: { catalog: 'src/i18n/en', search: ['src'], dynamic: ['tool.', 'layout.', 'session.'] },
}[target]
if (!CFG) {
  console.error('usage: i18n-dead-keys.mjs chart')
  process.exit(2)
}

const walk = (dir, out) => {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name === 'messages' || name === 'i18n') continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p)
  }
}
const files = []
for (const s of CFG.search) walk(resolve(ROOT, s), files)
const corpus = files.map((f) => readFileSync(f, 'utf8')).join('\n')

const index = readFileSync(resolve(ROOT, CFG.catalog, 'index.ts'), 'utf8')
const surfaces = [...index.matchAll(/^import \{ (\w+) \} from '\.\/(\w+)'/gm)].map((m) => m[2])
const keys = []
for (const s of surfaces) {
  const src = readFileSync(resolve(ROOT, CFG.catalog, `${s}.ts`), 'utf8')
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  const mod = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)
  for (const k of Object.keys(Object.values(mod)[0])) keys.push([s, k])
}

const dead = keys.filter(([, k]) => !CFG.dynamic.some((p) => k.startsWith(p)) && !corpus.includes(`'${k}'`) && !corpus.includes(`"${k}"`))
for (const [s, k] of dead) console.log(`${s}: ${k}`)
console.log(`\n${dead.length} of ${keys.length} keys have no literal reference in ${files.length} source files`)
process.exit(dead.length ? 1 : 0)

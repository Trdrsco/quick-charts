#!/usr/bin/env node
// The localization workbench: one command that keeps twenty languages in step with the English
// source, for every catalog (the app's, the chart's, and the private organs'). English is edited by hand; every other
// language file is GENERATED from English plus its existing translations, so a developer touches
// one line and never twenty files.
//
//   pnpm i18n sync             fill new keys (English-seeded), drop stray keys, reseed translations
//                              whose English changed, regenerate every language file and index,
//                              update source.lock.json. Run after any change to an en/ file.
//   pnpm i18n sync --check     the same, without writing: exits 1 when a file or the lock is out of
//                              step (CI runs this so an English change cannot ship without a sync).
//   pnpm i18n todo [--lang de] [--json]
//                              what still reads English per language — the translator's work list.
//   pnpm i18n glossary [--lang de]
//                              the standing vocabulary for core concepts, derived from the catalogs.
//   pnpm i18n check            sync --check + the literal sweep + the dead-key check (the CI gate).
//
// How staleness works: source.lock.json records a hash of each English value at the last sync. When
// an English value changes, the next sync reseeds that key with the new English in every language
// (the old translation described the old meaning) and `todo` lists it. A pure typo fix in English
// therefore also invalidates the translations — accept that, or restore them by hand when the
// meaning is unchanged. Renaming a key is a new key plus a dropped one: translations do not follow.
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { LOCALE_SOURCES, readLocales } from './i18n-locales.mjs'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
// Each catalog follows the locale inventory of the runtime that renders it and types its language
// files against that runtime's `Translation`: the app catalog and the chart-trading catalog against
// `@trdrs/i18n`, the chart catalog against the chart's own runtime beside it, and the order ticket's
// and the account manager's against the structural `Translation` each declares in its own terms
// (they consume the seam and nothing else; the host binds their dictionaries).
// scripts/i18n-locales.mjs reads both locale tables.
const CATALOGS = {
  app: { base: 'apps/web/src/i18n/messages', locales: LOCALE_SOURCES.app, translationImport: '@trdrs/i18n' },
  sdk: { base: 'packages/chart/src/i18n', locales: LOCALE_SOURCES.sdk, translationImport: '../runtime' },
  trading: { base: 'packages/chart-trading/src/i18n', locales: LOCALE_SOURCES.app, translationImport: '@trdrs/i18n' },
  ticket: { base: 'packages/order-ticket/src/i18n', locales: LOCALE_SOURCES.app, translationImport: '../translation' },
  manager: { base: 'packages/account-manager/src/i18n', locales: LOCALE_SOURCES.app, translationImport: '../translation' },
}
const [command, ...rest] = process.argv.slice(2)
const flag = (name) => rest.includes(`--${name}`)
const opt = (name) => {
  const i = rest.indexOf(`--${name}`)
  return i >= 0 ? rest[i + 1] : undefined
}

// ── the language inventory, read from each catalog's runtime so this never drifts ───────────────
const targetsFor = (name) => readLocales(CATALOGS[name].locales).filter((l) => l.code !== 'en')
const CLDR_ORDER = ['zero', 'one', 'two', 'few', 'many', 'other']
const categoriesFor = (tag) => {
  const set = new Set(new Intl.PluralRules(tag).resolvedOptions().pluralCategories)
  return CLDR_ORDER.filter((c) => set.has(c))
}

// ── reading catalogs: strip types, evaluate the object literal ───────────────────────────────────
async function loadModule(path) {
  const src = readFileSync(path, 'utf8')
    .replace(/^import .*$/gm, '')
    .replace(/: Translation<typeof \w+>/, '')
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  const mod = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)
  const value = Object.values(mod)[0]
  if (!value || typeof value !== 'object') throw new Error(`${path} exports no catalog object`)
  return value
}

async function readCatalog(name) {
  const base = resolve(ROOT, CATALOGS[name].base)
  const index = readFileSync(join(base, 'en', 'index.ts'), 'utf8')
  const surfaces = [...index.matchAll(/^import \{ (\w+) \} from '\.\/(\w+)'/gm)].map((m) => ({ name: m[1], file: m[2] }))
  if (!surfaces.length) throw new Error(`no surface imports in ${name} en/index.ts`)
  const en = {}
  for (const s of surfaces) en[s.file] = await loadModule(join(base, 'en', `${s.file}.ts`))
  const eol = index.includes('\r\n') ? '\r\n' : '\n'
  return { name, base, surfaces, en, eol, targets: targetsFor(name), translationImport: CATALOGS[name].translationImport }
}

const hash = (value) => createHash('sha1').update(JSON.stringify(value)).digest('hex').slice(0, 10)
const lockPath = (cat) => join(cat.base, 'source.lock.json')
const readLock = (cat) => (existsSync(lockPath(cat)) ? JSON.parse(readFileSync(lockPath(cat), 'utf8')) : { keys: {} })
const renderLock = (keys) => JSON.stringify({ keys: Object.fromEntries(Object.entries(keys).sort(([a], [b]) => (a < b ? -1 : 1))) }, null, 2) + '\n'

// ── rendering a language file from English + what the language already says ─────────────────────
const q = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r?\n/g, '\\n')}'`
const isPlural = (v) => typeof v === 'object'
const wantedForms = (enValue, cats) => CLDR_ORDER.filter((c) => cats.includes(c) || (c === 'zero' && 'zero' in enValue))

/** The value a language file carries for one key: its translation when it is current and the right
 *  shape, else the English seed — reported so `todo` can list it. */
function decide(key, enValue, have, staleKey, cats, report, code) {
  const shapeOk = have !== undefined && isPlural(enValue) === isPlural(have)
  if (shapeOk && !staleKey) {
    if (!isPlural(enValue)) return have
    const out = {}
    for (const c of wantedForms(enValue, cats)) out[c] = have[c] ?? have.other ?? enValue[c] ?? enValue.other
    return out
  }
  report.seeded.push({ code, key, reason: staleKey ? 'changed' : have === undefined ? 'new' : 'shape' })
  if (!isPlural(enValue)) return enValue
  const out = {}
  for (const c of wantedForms(enValue, cats)) out[c] = enValue[c] ?? enValue.other
  return out
}

function renderSurface(cat, surface, entries, eol) {
  const lines = [
    `import type { Translation } from '${cat.translationImport}'`,
    `import type { ${surface.name} as source } from '../en/${surface.file}'`,
    '',
    `export const ${surface.name}: Translation<typeof source> = {`,
  ]
  for (const [key, value] of entries) {
    if (!isPlural(value)) lines.push(`  ${q(key)}: ${q(value)},`)
    else lines.push(`  ${q(key)}: { ${Object.entries(value).map(([c, t]) => `${c}: ${q(t)}`).join(', ')} },`)
  }
  lines.push('}', '')
  return lines.join(eol)
}

function renderIndex(cat) {
  const lines = [`import type { Translation } from '${cat.translationImport}'`, `import type { en } from '../en'`]
  for (const s of cat.surfaces) lines.push(`import { ${s.name} } from './${s.file}'`)
  lines.push('', `const dict: Translation<typeof en> = { ${cat.surfaces.map((s) => `...${s.name}`).join(', ')} }`, 'export default dict', '')
  return lines.join(cat.eol)
}

const fileEol = (path, fallback) => (existsSync(path) ? (readFileSync(path, 'utf8').includes('\r\n') ? '\r\n' : '\n') : fallback)

async function sync(check) {
  let problems = 0
  for (const name of Object.keys(CATALOGS)) {
    const cat = await readCatalog(name)
    const lock = readLock(cat)
    const next = {}
    const report = { seeded: [], stray: [], written: 0 }
    for (const s of cat.surfaces) for (const key of Object.keys(cat.en[s.file])) next[key] = hash(cat.en[s.file][key])
    for (const { code, tag } of cat.targets) {
      const cats = categoriesFor(tag)
      const dir = join(cat.base, code)
      if (!check) mkdirSync(dir, { recursive: true })
      for (const s of cat.surfaces) {
        const path = join(dir, `${s.file}.ts`)
        const have = existsSync(path) ? await loadModule(path) : {}
        const en = cat.en[s.file]
        const entries = Object.keys(en).map((key) => {
          const stale = lock.keys[key] !== undefined && lock.keys[key] !== next[key]
          return [key, decide(key, en[key], have[key], stale, cats, report, code)]
        })
        for (const key of Object.keys(have)) if (!(key in en)) report.stray.push({ code, key })
        const content = renderSurface(cat, s, entries, fileEol(path, cat.eol))
        const current = existsSync(path) ? readFileSync(path, 'utf8') : null
        if (content !== current) {
          if (check) {
            problems++
            console.log(`${name}: ${code}/${s.file}.ts is out of step with en/${s.file}.ts`)
          } else {
            writeFileSync(path, content)
            report.written++
          }
        }
      }
      const indexPath = join(dir, 'index.ts')
      const index = renderIndex({ ...cat, eol: fileEol(indexPath, cat.eol) })
      if (!existsSync(indexPath) || readFileSync(indexPath, 'utf8') !== index) {
        if (check) {
          problems++
          console.log(`${name}: ${code}/index.ts is out of step`)
        } else {
          writeFileSync(indexPath, index)
          report.written++
        }
      }
    }
    // The lock is compared and written like every other generated file: by content, in the line
    // ending the checkout uses, so a CRLF working copy and a LF one agree on what is in step.
    const lockText = renderLock(next)
    const lockOnDisk = existsSync(lockPath(cat)) ? readFileSync(lockPath(cat), 'utf8').replace(/\r\n/g, '\n') : null
    if (lockOnDisk !== lockText) {
      if (check) {
        problems++
        console.log(`${name}: source.lock.json is out of date — an en/ value changed without \`pnpm i18n sync\``)
      } else writeFileSync(lockPath(cat), lockText.replace(/\n/g, fileEol(lockPath(cat), cat.eol)))
    }
    if (!check) {
      const byKey = new Map()
      for (const s of report.seeded) if (!byKey.has(s.key)) byKey.set(s.key, s.reason)
      const strayKeys = [...new Set(report.stray.map((s) => s.key))]
      console.log(`${name}: ${report.written} file(s) written, ${byKey.size} key(s) seeded from English across ${cat.targets.length} languages, ${strayKeys.length} stray key(s) dropped`)
      for (const [key, reason] of byKey) console.log(`  ${reason.padEnd(7)} ${key}`)
      for (const key of strayKeys) console.log(`  dropped ${key}`)
    }
  }
  if (check) {
    console.log(problems ? `\n${problems} file(s) out of step — run \`pnpm i18n sync\` and commit the result` : 'i18n sync: every language is in step with English')
    process.exit(problems ? 1 : 0)
  } else console.log('Translate what reads English with `pnpm i18n todo --lang <code>`.')
}

// ── what still reads English ─────────────────────────────────────────────────────────────────────
/** Values that legitimately match English everywhere: product names, codes, bare placeholders. */
const SAME_EVERYWHERE = /^(\{\w+\}|trdrs|Trader Copier|Rithmic|TastyTrade|Tradovate|TradingView|Stripe|Discord|Telegram|Google|OK|Admin|Pro|Free|Trader|JSON|AI|FX|[^A-Za-z]*)$/

async function stillEnglish(cat, code) {
  const out = []
  for (const s of cat.surfaces) {
    const path = join(cat.base, code, `${s.file}.ts`)
    if (!existsSync(path)) continue
    const have = await loadModule(path)
    for (const [key, en] of Object.entries(cat.en[s.file])) {
      const mine = have[key]
      if (mine === undefined) continue
      if (!isPlural(en)) {
        if (mine === en && !SAME_EVERYWHERE.test(en)) out.push({ surface: s.file, key, en })
        continue
      }
      const forms = new Set(Object.values(en))
      const mineForms = Object.values(mine)
      if (mineForms.length && mineForms.every((f) => forms.has(f))) out.push({ surface: s.file, key, en })
    }
  }
  return out
}

async function todo() {
  const only = opt('lang')
  const json = flag('json')
  const cats = await Promise.all(Object.keys(CATALOGS).map(readCatalog))
  const result = {}
  for (const cat of cats) {
    for (const { code } of cat.targets) {
      if (only && code !== only) continue
      ;(result[code] ??= {})[cat.name] = await stillEnglish(cat, code)
    }
  }
  if (json) {
    console.log(JSON.stringify(result, null, 2))
    return
  }
  for (const [code, byCat] of Object.entries(result)) {
    const total = Object.values(byCat).reduce((n, list) => n + list.length, 0)
    console.log(`${code}: ${total} value(s) still English`)
    if (!only) continue
    for (const [name, list] of Object.entries(byCat)) {
      if (!list.length) continue
      console.log(`  [${name}]`)
      for (const t of list) console.log(`    ${t.key}: ${isPlural(t.en) ? JSON.stringify(t.en) : t.en}`)
    }
  }
  if (!only) console.log('Pass --lang <code> for the list; each remaining value is either untranslated or legitimately identical (a name, a code).')
}

// ── the standing vocabulary, derived ─────────────────────────────────────────────────────────────
/** Core concepts a translator must render the same way everywhere; read from the catalogs, so the
 *  glossary is never a document to maintain. */
const CONCEPTS = [
  ['app', 'shell.widgetWatchlist'], ['app', 'ticket.tabOrders'], ['app', 'ticket.tabPositions'],
  ['app', 'ticket.colStopLoss'], ['app', 'ticket.colTakeProfit'], ['app', 'ticket.typeMarket'],
  ['app', 'ticket.typeLimit'], ['app', 'ticket.typeStop'], ['app', 'chart.replay'],
  ['app', 'chart.indicators'], ['app', 'chart.timeframe'], ['app', 'alerts.title'],
  ['app', 'shell.pageJournal'], ['app', 'shell.pageBacktest'], ['app', 'watchlist.watchlists'],
  ['sdk', 'account.positions'], ['sdk', 'account.orders'], ['sdk', 'lines.takeProfit'],
  ['sdk', 'lines.stopLoss'], ['sdk', 'session.open'], ['sdk', 'rail.cursor'],
]

async function glossary() {
  const only = opt('lang')
  const cats = Object.fromEntries(await Promise.all(Object.keys(CATALOGS).map(async (n) => [n, await readCatalog(n)])))
  const lookup = async (cat, code, key) => {
    const s = cat.surfaces.find((s) => key in cat.en[s.file])
    if (!s) return undefined
    const path = join(cat.base, code, `${s.file}.ts`)
    if (code !== 'en' && !existsSync(path)) return undefined
    const obj = code === 'en' ? cat.en[s.file] : await loadModule(path)
    return obj[key]
  }
  const codes = [...new Set(Object.values(cats).flatMap((cat) => cat.targets.map((t) => t.code)))]
  for (const code of codes) {
    if (only && code !== only) continue
    const rows = []
    for (const [name, key] of CONCEPTS) {
      const en = await lookup(cats[name], 'en', key)
      const mine = await lookup(cats[name], code, key)
      if (en !== undefined) rows.push(`${en} → ${mine}`)
    }
    console.log(`${code}: ${rows.join(' · ')}`)
  }
}

// ── the gate ─────────────────────────────────────────────────────────────────────────────────────
function check() {
  const steps = [
    ['sync', [process.execPath, resolve(ROOT, 'scripts/i18n.mjs'), 'sync', '--check']],
    ['literals', [process.execPath, resolve(ROOT, 'scripts/check-i18n-literals.mjs')]],
    ['dead keys (app)', [process.execPath, resolve(ROOT, 'scripts/i18n-dead-keys.mjs'), 'app']],
    ['dead keys (sdk)', [process.execPath, resolve(ROOT, 'scripts/i18n-dead-keys.mjs'), 'sdk']],
    ['dead keys (trading)', [process.execPath, resolve(ROOT, 'scripts/i18n-dead-keys.mjs'), 'trading']],
    ['dead keys (ticket)', [process.execPath, resolve(ROOT, 'scripts/i18n-dead-keys.mjs'), 'ticket']],
    ['dead keys (manager)', [process.execPath, resolve(ROOT, 'scripts/i18n-dead-keys.mjs'), 'manager']],
  ]
  let failed = 0
  for (const [label, [cmd, ...args]] of steps) {
    console.log(`\n── i18n ${label}`)
    const r = spawnSync(cmd, args, { stdio: 'inherit', cwd: ROOT })
    if (r.status !== 0) failed++
  }
  console.log(failed ? `\ni18n check: ${failed} check(s) failed` : '\ni18n check: clean')
  process.exit(failed ? 1 : 0)
}

switch (command) {
  case 'sync':
    await sync(flag('check'))
    break
  case 'todo':
    await todo()
    break
  case 'glossary':
    await glossary()
    break
  case 'check':
    check()
    break
  default:
    console.log('usage: pnpm i18n <sync [--check] | todo [--lang code] [--json] | glossary [--lang code] | check>')
    process.exit(2)
}

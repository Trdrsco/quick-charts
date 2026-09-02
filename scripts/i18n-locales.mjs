// The locale inventories the localization tooling reads, one per catalog, each parsed from the
// runtime that ships it so the tooling can never drift from the code: the app catalog follows the
// `@trdrs/i18n` inventory, the chart catalog follows the chart's own runtime. The two tables are
// pinned equal by scripts/test/i18n-inventory.test.ts, and each is parsed by its line shape rather
// than executed, so this stays a plain script with no TypeScript loader.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))

/** Where each catalog's inventory lives, root-relative. */
export const LOCALE_SOURCES = {
  app: 'packages/i18n/src/locales.ts',
  sdk: 'packages/chart/src/i18n/runtime/locales.ts',
}

const ENTRY = /\{ code: '([A-Za-z_]+)', endonym: '([^']*)', tag: '([A-Za-z-]+)', dir: '(ltr|rtl)'/g

/** The `{ code, endonym, tag, dir }` rows of a locale table, in file order. */
export function readLocales(source) {
  const text = readFileSync(resolve(ROOT, source), 'utf8')
  const locales = [...text.matchAll(ENTRY)].map((m) => ({ code: m[1], endonym: m[2], tag: m[3], dir: m[4] }))
  if (locales.length < 21) throw new Error(`expected 21 locales in ${source}, parsed ${locales.length}`)
  return locales
}

// The locale inventory the localization tooling reads, parsed from the runtime that ships it so
// the tooling can never drift from the code. It is read by its line shape rather than executed, so
// this stays a plain script with no TypeScript loader.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))

/** Where the catalog's inventory lives, root-relative. */
export const LOCALE_SOURCES = {
  chart: 'src/i18n/runtime/locales.ts',
}

const ENTRY = /\{ code: '([A-Za-z_]+)', endonym: '([^']*)', tag: '([A-Za-z-]+)', dir: '(ltr|rtl)'/g

/** The `{ code, endonym, tag, dir }` rows of a locale table, in file order. */
export function readLocales(source) {
  const text = readFileSync(resolve(ROOT, source), 'utf8')
  const locales = [...text.matchAll(ENTRY)].map((m) => ({ code: m[1], endonym: m[2], tag: m[3], dir: m[4] }))
  if (locales.length < 21) throw new Error(`expected 21 locales in ${source}, parsed ${locales.length}`)
  return locales
}

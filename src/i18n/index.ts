// The widget's strings, in the language the host asked for. Framework-free like the rest of the
// chrome: modules receive a `ChartI18n`, read `t` when they render, and re-render on `onChange`.
// The runtime underneath (`./runtime`) is the chart's own and ships inside this package.
import {
  BUILT_IN_LOCALES,
  BUILT_IN_LOCALE_REGISTRY,
  DEFAULT_LOCALE,
  createDictionaryLoader,
  createLocaleRegistry,
  createTranslator,
  isBuiltInLocaleCode,
  type DictionaryLoader,
  type LocaleDefinition,
  type LocaleRegistry,
  type Translate,
  type Translation,
} from './runtime'
import { en, type ChartMessageKey } from './en'

export { BUILT_IN_LOCALES } from './runtime'
export type { ChartLocale, ChartLocaleCode } from './runtime'
export type { ChartMessageKey } from './en'
export type ChartTranslate = Translate<typeof en>
/** The widget's catalog in one language: every key of the English source, in the same shape. */
export type ChartDictionary = Translation<typeof en>

/** A locale a host adds beyond the built-in inventory: its stable code, canonical BCP 47 tag,
 *  reading direction, endonym, and the dictionary chunk to fetch the first time it is chosen. */
export interface ChartCustomLocale extends LocaleDefinition {
  dictionary: () => Promise<{ default: ChartDictionary }>
}

export interface ChartI18nOptions {
  /** Locales registered beside the built-in inventory. A code or tag the inventory already holds
   *  is refused: the built-in dictionaries are not overridden through this door. */
  locales?: readonly ChartCustomLocale[]
  /** Hears every key a loaded dictionary is missing; the text falls back to English. The typed
   *  catalogs cannot miss a key, so this only ever reports a dictionary loaded from data. */
  onMissing?: (key: ChartMessageKey, locale: string) => void
}

export interface ChartI18n {
  /** The host-owned stable locale code. It does not need to use the built-in vocabulary. */
  locale(): string
  /** The BCP 47 tag for `Intl` and for the chart library's own axis and crosshair formatting. */
  tag(): string
  t: ChartTranslate
  /** Switch language. The translation loads once; until it lands `t` reads English. Resolves when
   *  the switch is complete (or has settled on English because the chunk failed). */
  setLocale(code: string): Promise<void>
  /** Hear every change of `t`; a module re-renders its text in the handler. */
  onChange(listener: () => void): () => void
}

/** One chunk per language the widget ships, every language in `BUILT_IN_LOCALES`, fetched the
 *  first time it is chosen. */
export const chartDictionaries = createDictionaryLoader(en, {
  de: () => import('./de'),
  fr: () => import('./fr'),
  es: () => import('./es'),
  it: () => import('./it'),
  ca_ES: () => import('./ca_ES'),
  pl: () => import('./pl'),
  sv: () => import('./sv'),
  tr: () => import('./tr'),
  ru: () => import('./ru'),
  pt: () => import('./pt'),
  id_ID: () => import('./id_ID'),
  ms_MY: () => import('./ms_MY'),
  th: () => import('./th'),
  vi: () => import('./vi'),
  ja: () => import('./ja'),
  ko: () => import('./ko'),
  zh: () => import('./zh'),
  zh_TW: () => import('./zh_TW'),
  ar: () => import('./ar'),
  he_IL: () => import('./he_IL'),
})

const dynamic = (t: ChartTranslate) => t as unknown as (key: string) => string

/** The English source translator, for a pure helper called WITHOUT a language: every function here
 *  that returns trader-visible text takes `t` optionally and falls back to this, so a host that has
 *  not passed one reads exactly the English it always did. Built once and shared; the menu model
 *  composes its rows on every raise. */
let source: ChartTranslate | null = null
export const englishChartStrings = (): ChartTranslate => (source ??= createTranslator(en, null, 'en'))

/** A drawing tool's display name for a registry `type`: the catalog's when it knows the type, else
 *  the registry's own English `name`, so a tool the catalog has not met still has a name. */
export function toolName(t: ChartTranslate, type: string, fallback: string): string {
  const key = `tool.${type}`
  return key in en ? dynamic(t)(key) : fallback
}

/** A multi-chart arrangement's display name for its code, else the arrangement catalog's English
 *  label. An arrangement code separates its parts with hyphens (`2-2-l`) where a catalog key uses
 *  underscores, so the code is converted rather than asking every caller to. */
export function arrangementName(t: ChartTranslate, code: string, fallback: string): string {
  const key = `layout.${code.replace(/-/g, '_')}`
  return key in en ? dynamic(t)(key) : fallback
}

/** The registry and loader a `ChartI18n` reads: the built-in inventory alone, or the inventory
 *  with the host's custom locales beside it. A custom locale's chunk is cached by its own loader;
 *  the built-in chunks stay in the shared `chartDictionaries` cache so two instances never fetch
 *  one language twice. */
function inventory(custom: readonly ChartCustomLocale[]): { registry: LocaleRegistry<string>; dictionaries: DictionaryLoader<typeof en, string> } {
  if (custom.length === 0) return { registry: BUILT_IN_LOCALE_REGISTRY, dictionaries: chartDictionaries }
  const registry = createLocaleRegistry<string>([...BUILT_IN_LOCALES, ...custom], DEFAULT_LOCALE)
  const own = createDictionaryLoader<typeof en, string>(en, Object.fromEntries(custom.map((l) => [l.code, l.dictionary])), DEFAULT_LOCALE)
  return {
    registry,
    dictionaries: {
      ifLoaded: (code) => (isBuiltInLocaleCode(code) ? chartDictionaries.ifLoaded(code) : own.ifLoaded(code)),
      load: (code) => (isBuiltInLocaleCode(code) ? chartDictionaries.load(code) : own.load(code)),
      has: (code) => (isBuiltInLocaleCode(code) ? chartDictionaries.has(code) : own.has(code)),
    },
  }
}

/** A `ChartI18n` over the widget's own catalog, starting in `initial` (English when omitted): one
 *  of the built-in codes, or a code the `locales` option registers. */
export function createChartI18n(initial: string = DEFAULT_LOCALE, options: ChartI18nOptions = {}): ChartI18n {
  const { registry, dictionaries } = inventory(options.locales ?? [])
  if (!registry.is(initial)) throw new Error(`unsupported chart locale "${initial}"`)
  let locale = initial
  let dict = dictionaries.ifLoaded(locale)
  let epoch = 0
  const listeners = new Set<() => void>()
  const missing = options.onMissing
  const translator = () => createTranslator(en, dict, registry.info(locale).tag, missing && ((key) => missing(key, locale)))
  const api: ChartI18n = {
    locale: () => locale,
    tag: () => registry.info(locale).tag,
    t: translator(),
    async setLocale(code) {
      if (code === locale) return
      if (!registry.is(code)) throw new Error(`unsupported chart locale "${code}"`)
      locale = code
      const mine = ++epoch
      dict = dictionaries.ifLoaded(code)
      rebuild()
      if (dict) return
      const loaded = await dictionaries.load(code).catch(() => null)
      if (mine !== epoch) return // a later switch superseded this one
      dict = loaded
      rebuild()
    },
    onChange(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
  const rebuild = () => {
    api.t = translator()
    for (const listener of listeners) listener()
  }
  return api
}

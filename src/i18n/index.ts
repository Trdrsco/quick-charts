// The widget's strings, in the language the host asked for. Framework-free like the rest of the
// chrome: modules receive a `ChartI18n`, read `t` when they render, and re-render on `onChange`.
// The runtime underneath (`./runtime`) is the chart's own and ships inside this package.
import { BUILT_IN_LOCALE_REGISTRY, DEFAULT_LOCALE, createDictionaryLoader, createTranslator, type ChartLocaleCode, type Translate } from './runtime'
import { en } from './en'

export { BUILT_IN_LOCALES } from './runtime'
export type { ChartLocale, ChartLocaleCode } from './runtime'
export type { ChartMessageKey } from './en'
export type ChartTranslate = Translate<typeof en>

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
 *  not passed one reads exactly the English it always did. Built once and shared; the trade-line
 *  render path composes its labels on every paint. */
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

/** A `ChartI18n` over the widget's own catalog, starting in `initial` (English when omitted), one
 *  of the built-in codes. */
export function createChartI18n(initial: ChartLocaleCode = DEFAULT_LOCALE): ChartI18n {
  const registry = BUILT_IN_LOCALE_REGISTRY
  if (!registry.is(initial)) throw new Error(`unsupported chart locale "${String(initial)}"`)
  let locale: ChartLocaleCode = initial
  let dict = chartDictionaries.ifLoaded(locale)
  let epoch = 0
  const listeners = new Set<() => void>()
  const translator = () => createTranslator(en, dict, registry.info(locale).tag)
  const api: ChartI18n = {
    locale: () => locale,
    tag: () => registry.info(locale).tag,
    t: translator(),
    async setLocale(code) {
      if (code === locale) return
      if (!registry.is(code)) throw new Error(`unsupported chart locale "${code}"`)
      locale = code
      const mine = ++epoch
      dict = chartDictionaries.ifLoaded(code)
      rebuild()
      if (dict) return
      const loaded = await chartDictionaries.load(code).catch(() => null)
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

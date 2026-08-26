// The widget's strings, in the language the host asked for. Framework-free like the rest of the
// chrome: modules receive a `ChartI18n`, read `t` when they render, and re-render on `onChange`.
import { DEFAULT_LOCALE, createDictionaryLoader, createTranslator, localeInfo, type LanguageCode, type Translate } from '@trdrs/i18n'
import { en } from './en'

export type { ChartMessageKey } from './en'
export type ChartTranslate = Translate<typeof en>

export interface ChartI18n {
  locale(): LanguageCode
  /** The BCP 47 tag for `Intl` and for the chart library's own axis and crosshair formatting. */
  tag(): string
  t: ChartTranslate
  /** Switch language. The translation loads once; until it lands `t` reads English. Resolves when
   *  the switch is complete (or has settled on English because the chunk failed). */
  setLocale(code: LanguageCode): Promise<void>
  /** Hear every change of `t` — a module re-renders its text in the handler. */
  onChange(listener: () => void): () => void
}

/** One chunk per language the widget ships, fetched the first time it is chosen. A language absent
 *  here reads English. */
export const chartDictionaries = createDictionaryLoader(en, {})

const dynamic = (t: ChartTranslate) => t as unknown as (key: string) => string

/** A drawing tool's display name for a registry `type`: the catalog's when it knows the type, else
 *  the registry's own English `name`, so a tool the catalog has not met still has a name. */
export function toolName(t: ChartTranslate, type: string, fallback: string): string {
  const key = `tool.${type}`
  return key in en ? dynamic(t)(key) : fallback
}

/** A multi-chart arrangement's display name for its code, else the arrangement catalog's English label. */
export function arrangementName(t: ChartTranslate, code: string, fallback: string): string {
  const key = `layout.${code}`
  return key in en ? dynamic(t)(key) : fallback
}

export function createChartI18n(initial: LanguageCode = DEFAULT_LOCALE): ChartI18n {
  let locale: LanguageCode = initial
  let dict = chartDictionaries.ifLoaded(locale)
  let epoch = 0
  const listeners = new Set<() => void>()
  const api: ChartI18n = {
    locale: () => locale,
    tag: () => localeInfo(locale).tag,
    t: createTranslator(en, dict, localeInfo(initial).tag),
    async setLocale(code) {
      if (code === locale) return
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
    api.t = createTranslator(en, dict, localeInfo(locale).tag)
    for (const listener of listeners) listener()
  }
  return api
}

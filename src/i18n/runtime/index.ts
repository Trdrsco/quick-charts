// The chart's own localization runtime, built into the one `quickcharts` artifact: the locale
// inventory and registry shape, typed message catalogs with CLDR plural selection through `Intl`,
// the translator with source fallback and a diagnostic, the lazy per-language dictionary loader,
// and the conformance check every shipped translation is held to. Framework-free and DOM-free, so
// a server render can import it.
export { BUILT_IN_LOCALES, BUILT_IN_LOCALE_REGISTRY, DEFAULT_LOCALE, builtInLocaleInfo } from './locales'
export type { ChartLocale, ChartLocaleCode } from './locales'
export { catalogProblems, createTranslator } from './dictionary'
export type { Translate, Translation } from './dictionary'
export { createDictionaryLoader } from './loader'

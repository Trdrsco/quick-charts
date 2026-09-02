// The locales the chart knows: a generic registry shape any product can fill, and the built-in
// inventory this package ships a dictionary for. A host-owned `ChartI18n` is not limited to the
// inventory; the inventory is what `createChart({ locale })` and `createChartI18n(code)` accept
// without a custom locale being registered.

/** A locale a product ships or a host registers. `code` is the stable product-facing identifier;
 *  `tag` is the canonical BCP 47 value for `Intl` and the document language. */
export interface LocaleDefinition<Code extends string = string> {
  code: Code
  endonym: string
  tag: string
  dir: 'ltr' | 'rtl'
}

export interface LocaleRegistry<Code extends string> {
  readonly locales: readonly LocaleDefinition<Code>[]
  readonly defaultCode: Code
  is(value: unknown): value is Code
  /** The definition for a code; the default locale's for a code the registry does not hold. */
  info(code: Code): LocaleDefinition<Code>
}

/** Canonicalize a locale value. An invalid tag returns null instead of throwing. */
export function canonicalLocaleTag(value: string): string | null {
  try {
    return Intl.getCanonicalLocales(value.replace(/_/g, '-'))[0] ?? null
  } catch {
    return null
  }
}

/** Build a locale registry. A registry cannot hold two locales with one code or one canonical
 *  tag, and every tag must be written in its canonical form. */
export function createLocaleRegistry<const Code extends string>(definitions: readonly LocaleDefinition<Code>[], defaultCode: Code): LocaleRegistry<Code> {
  if (definitions.length === 0) throw new Error('a locale registry needs at least one locale')

  const byCode = new Map<string, LocaleDefinition<Code>>()
  const byTag = new Map<string, LocaleDefinition<Code>>()

  for (const definition of definitions) {
    if (byCode.has(definition.code)) throw new Error(`duplicate locale code "${definition.code}"`)
    const tag = canonicalLocaleTag(definition.tag)
    if (!tag) throw new Error(`invalid BCP 47 locale tag "${definition.tag}"`)
    if (tag !== definition.tag) throw new Error(`locale tag "${definition.tag}" must be canonical "${tag}"`)
    byCode.set(definition.code, definition)

    const key = tag.toLowerCase()
    const existing = byTag.get(key)
    if (existing && existing.code !== definition.code) throw new Error(`locale tag "${tag}" maps to more than one code`)
    byTag.set(key, definition)
  }

  const fallback = byCode.get(defaultCode)
  if (!fallback) throw new Error(`default locale "${defaultCode}" is not in the registry`)

  return Object.freeze({
    locales: Object.freeze([...definitions]),
    defaultCode,
    is: (value: unknown): value is Code => typeof value === 'string' && byCode.has(value),
    info: (code: Code) => byCode.get(code) ?? fallback,
  })
}

/** The languages this package ships a dictionary for. */
export type ChartLocaleCode =
  | 'en'
  | 'de'
  | 'fr'
  | 'es'
  | 'it'
  | 'ca_ES'
  | 'pl'
  | 'sv'
  | 'tr'
  | 'ru'
  | 'pt'
  | 'id_ID'
  | 'ms_MY'
  | 'th'
  | 'vi'
  | 'ja'
  | 'ko'
  | 'zh'
  | 'zh_TW'
  | 'ar'
  | 'he_IL'

export type ChartLocale = LocaleDefinition<ChartLocaleCode>

/** English first, then the Latin-script languages, then the others. Endonyms let every reader find
 *  their own language in a picker. `scripts/i18n.mjs` reads this table by its line shape, and
 *  `scripts/test/i18n-inventory.test.ts` pins it equal to the app runtime's inventory. */
export const BUILT_IN_LOCALES: readonly ChartLocale[] = [
  { code: 'en', endonym: 'English', tag: 'en', dir: 'ltr' },
  { code: 'de', endonym: 'Deutsch', tag: 'de', dir: 'ltr' },
  { code: 'fr', endonym: 'Français', tag: 'fr', dir: 'ltr' },
  { code: 'es', endonym: 'Español', tag: 'es', dir: 'ltr' },
  { code: 'it', endonym: 'Italiano', tag: 'it', dir: 'ltr' },
  { code: 'ca_ES', endonym: 'Català', tag: 'ca-ES', dir: 'ltr' },
  { code: 'pl', endonym: 'Polski', tag: 'pl', dir: 'ltr' },
  { code: 'sv', endonym: 'Svenska', tag: 'sv', dir: 'ltr' },
  { code: 'tr', endonym: 'Türkçe', tag: 'tr', dir: 'ltr' },
  { code: 'ru', endonym: 'Русский', tag: 'ru', dir: 'ltr' },
  { code: 'pt', endonym: 'Português', tag: 'pt', dir: 'ltr' },
  { code: 'id_ID', endonym: 'Bahasa Indonesia', tag: 'id-ID', dir: 'ltr' },
  { code: 'ms_MY', endonym: 'Bahasa Melayu', tag: 'ms-MY', dir: 'ltr' },
  { code: 'th', endonym: 'ภาษาไทย', tag: 'th', dir: 'ltr' },
  { code: 'vi', endonym: 'Tiếng Việt', tag: 'vi', dir: 'ltr' },
  { code: 'ja', endonym: '日本語', tag: 'ja', dir: 'ltr' },
  { code: 'ko', endonym: '한국어', tag: 'ko', dir: 'ltr' },
  { code: 'zh', endonym: '简体中文', tag: 'zh-CN', dir: 'ltr' },
  { code: 'zh_TW', endonym: '繁體中文', tag: 'zh-TW', dir: 'ltr' },
  { code: 'ar', endonym: 'العربية', tag: 'ar', dir: 'rtl' },
  { code: 'he_IL', endonym: 'עברית', tag: 'he-IL', dir: 'rtl' },
]

export const DEFAULT_LOCALE: ChartLocaleCode = 'en'
export const BUILT_IN_LOCALE_REGISTRY: LocaleRegistry<ChartLocaleCode> = createLocaleRegistry(BUILT_IN_LOCALES, DEFAULT_LOCALE)

export const isBuiltInLocaleCode = (value: unknown): value is ChartLocaleCode => BUILT_IN_LOCALE_REGISTRY.is(value)
export const builtInLocaleInfo = (code: ChartLocaleCode): ChartLocale => BUILT_IN_LOCALE_REGISTRY.info(code)

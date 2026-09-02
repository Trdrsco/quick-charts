// The chart's own localization runtime, piece by piece: the locale registry and inventory, message
// formatting and CLDR plural selection, the translator's fallback and diagnostic, the lazy loader's
// coalescing and retry, and the conformance check. Framework-free and DOM-free.
import { describe, expect, it, vi } from 'vitest'
import { BUILT_IN_LOCALES, DEFAULT_LOCALE, builtInLocaleInfo, createLocaleRegistry, isBuiltInLocaleCode } from '../src/i18n/runtime/locales'
import { catalogProblems, createTranslator, format, numberFormat, pluralRules, resolve, selectPlural, type Translation } from '../src/i18n/runtime/dictionary'
import { createDictionaryLoader } from '../src/i18n/runtime/loader'

describe('the locale inventory', () => {
  it('lists each language once, English first', () => {
    const codes = BUILT_IN_LOCALES.map((l) => l.code)
    expect(new Set(codes).size).toBe(codes.length)
    expect(codes[0]).toBe('en')
    expect(BUILT_IN_LOCALES).toHaveLength(21)
  })

  it('carries a canonical BCP 47 tag that Intl resolves to the same language', () => {
    for (const l of BUILT_IN_LOCALES) {
      expect(Intl.getCanonicalLocales(l.tag), l.code).toEqual([l.tag])
      const resolved = new Intl.NumberFormat(l.tag).resolvedOptions().locale
      expect(resolved.split('-')[0], `${l.code} resolved to ${resolved}`).toBe(l.tag.split('-')[0])
    }
  })

  it('reads right to left for Arabic and Hebrew only', () => {
    expect(BUILT_IN_LOCALES.filter((l) => l.dir === 'rtl').map((l) => l.code)).toEqual(['ar', 'he_IL'])
  })

  it('isBuiltInLocaleCode admits exactly the built-in inventory', () => {
    for (const l of BUILT_IN_LOCALES) expect(isBuiltInLocaleCode(l.code)).toBe(true)
    for (const bad of ['EN', 'zh-TW', 'zh_tw', '', 'klingon', 42, null, undefined]) {
      expect(isBuiltInLocaleCode(bad), String(bad)).toBe(false)
    }
  })

  it('builtInLocaleInfo answers for every built-in code and falls back to English for a stranger', () => {
    expect(builtInLocaleInfo('zh_TW').tag).toBe('zh-TW')
    expect(builtInLocaleInfo('nope' as never).code).toBe(DEFAULT_LOCALE)
  })
})

describe('createLocaleRegistry', () => {
  it('lets a host own a different locale inventory and stable code vocabulary', () => {
    const registry = createLocaleRegistry(
      [
        { code: 'default', endonym: 'English', tag: 'en-US', dir: 'ltr' },
        { code: 'canada', endonym: 'Français (Canada)', tag: 'fr-CA', dir: 'ltr' },
      ] as const,
      'default',
    )
    expect(registry.locales.map(({ code }) => code)).toEqual(['default', 'canada'])
    expect(registry.defaultCode).toBe('default')
    expect(registry.is('canada')).toBe(true)
    expect(registry.is('fr-CA')).toBe(false)
    expect(registry.info('canada').tag).toBe('fr-CA')
    expect(registry.info('nope' as never).code).toBe('default')
  })

  it('rejects an empty, ambiguous, non-canonical, or invalid registry', () => {
    expect(() => createLocaleRegistry([], 'en' as never)).toThrow('at least one locale')
    expect(() =>
      createLocaleRegistry(
        [
          { code: 'first', endonym: 'English', tag: 'en', dir: 'ltr' },
          { code: 'second', endonym: 'English again', tag: 'en', dir: 'ltr' },
        ] as const,
        'first',
      ),
    ).toThrow('maps to more than one code')
    expect(() =>
      createLocaleRegistry(
        [
          { code: 'twice', endonym: 'English', tag: 'en', dir: 'ltr' },
          { code: 'twice', endonym: 'Deutsch', tag: 'de', dir: 'ltr' },
        ] as const,
        'twice',
      ),
    ).toThrow('duplicate locale code "twice"')
    expect(() => createLocaleRegistry([{ code: 'en', endonym: 'English', tag: 'not a tag', dir: 'ltr' }] as const, 'en')).toThrow(
      'invalid BCP 47 locale tag',
    )
    expect(() => createLocaleRegistry([{ code: 'en', endonym: 'English', tag: 'en_us', dir: 'ltr' }] as const, 'en')).toThrow('must be canonical "en-US"')
    expect(() => createLocaleRegistry([{ code: 'en', endonym: 'English', tag: 'en', dir: 'ltr' }] as const, 'de' as never)).toThrow(
      'default locale "de" is not in the registry',
    )
  })
})

describe('messages', () => {
  it('format fills {name} slots, writes numbers in the language, and leaves an unknown slot visible', () => {
    expect(format('Hello {name}', { name: 'Joe' })).toBe('Hello Joe')
    expect(format('{n} alerts', { n: 3 })).toBe('3 alerts')
    expect(format('{n} alerts', { n: 1234.5 }, (v) => numberFormat('de').format(v))).toBe('1.234,5 alerts')
    expect(format('{missing} stays', {})).toBe('{missing} stays')
    expect(format('no vars')).toBe('no vars')
  })

  it('selectPlural follows each language’s CLDR categories', () => {
    const ru = { one: 'one', few: 'few', many: 'many', other: 'other' }
    const rules = pluralRules('ru')
    expect([1, 2, 5, 21, 22, 25, 0].map((n) => selectPlural(ru, n, rules))).toEqual(['one', 'few', 'many', 'one', 'few', 'many', 'many'])
    expect(selectPlural({ one: 'one', other: 'other' }, 1, pluralRules('en'))).toBe('one')
    expect(selectPlural({ one: 'one', other: 'other' }, 0, pluralRules('en'))).toBe('other')
    expect(selectPlural({ other: 'other' }, 1, pluralRules('ja'))).toBe('other')
    expect(selectPlural({ zero: 'none', one: 'one', two: 'two', few: 'few', many: 'many', other: 'other' }, 0, pluralRules('ar'))).toBe('none')
  })

  it('an explicit zero form wins for an exact 0 in every language, and a missing form falls to other', () => {
    expect(selectPlural({ zero: 'No alerts', one: '{count} alert', other: '{count} alerts' }, 0, pluralRules('en'))).toBe('No alerts')
    expect(selectPlural({ other: 'other' } as { other: string; one?: string }, 1, pluralRules('en'))).toBe('other')
  })

  it('resolve picks the form by count and fills it', () => {
    const m = { one: '{count} alert', other: '{count} alerts' }
    expect(resolve(m, { count: 1 }, pluralRules('en'))).toBe('1 alert')
    expect(resolve(m, { count: 2500 }, pluralRules('en'), (v) => numberFormat('en').format(v))).toBe('2,500 alerts')
    expect(resolve('plain {x}', { x: 'y' }, pluralRules('en'))).toBe('plain y')
  })

  it('caches one Intl object per tag and options', () => {
    expect(pluralRules('ru')).toBe(pluralRules('ru'))
    expect(numberFormat('de')).toBe(numberFormat('de'))
    expect(numberFormat('de', { maximumFractionDigits: 0 })).not.toBe(numberFormat('de'))
  })
})

// A toy catalog: one surface, a string with a slot, a plural.
const source = {
  'toy.hello': 'Hello {name}',
  'toy.alerts': { one: '{count} alert', other: '{count} alerts' },
  'toy.plain': 'Plain',
} as const
const de: Translation<typeof source> = {
  'toy.hello': 'Hallo {name}',
  'toy.alerts': { one: '{count} Alarm', other: '{count} Alarme' },
  'toy.plain': 'Schlicht',
}

describe('createTranslator', () => {
  it('reads the translation, picks plural forms by the language, and writes numbers in it', () => {
    const t = createTranslator(source, de, 'de')
    expect(t('toy.hello', { name: 'Joe' })).toBe('Hallo Joe')
    expect(t('toy.alerts', { count: 1 })).toBe('1 Alarm')
    expect(t('toy.alerts', { count: 1234 })).toBe('1.234 Alarme')
  })

  it('falls through to the source for a missing key and reports it, but never while no translation is loaded', () => {
    const missing = vi.fn()
    const partial = { ...de } as Record<string, unknown>
    delete partial['toy.plain']
    const t = createTranslator(source, partial as Translation<typeof source>, 'de', missing)
    expect(t('toy.plain')).toBe('Plain')
    expect(missing).toHaveBeenCalledWith('toy.plain')

    const loading = vi.fn()
    expect(createTranslator(source, null, 'de', loading)('toy.plain')).toBe('Plain')
    expect(loading).not.toHaveBeenCalled()
  })
})

describe('createDictionaryLoader', () => {
  it('has English in memory before anything loads, and knows which languages the catalog ships', () => {
    const loader = createDictionaryLoader(source, { de: () => Promise.resolve({ default: de }) })
    expect(loader.ifLoaded('en')).toBe(source)
    expect(loader.ifLoaded('de')).toBeNull()
    expect(loader.has('en')).toBe(true)
    expect(loader.has('de')).toBe(true)
    expect(loader.has('fr')).toBe(false)
  })

  it('loads once, shares the in-flight request, and reads the source for a language it does not ship', async () => {
    const fetch = vi.fn(() => Promise.resolve({ default: de }))
    const loader = createDictionaryLoader(source, { de: fetch })
    const first = loader.load('de')
    expect(loader.load('de')).toBe(first)
    await expect(first).resolves.toBe(de)
    expect(loader.ifLoaded('de')).toBe(de)
    await expect(loader.load('de')).resolves.toBe(de)
    expect(fetch).toHaveBeenCalledTimes(1)
    await expect(loader.load('fr')).resolves.toBe(source)
  })

  it('a failed chunk rejects, and the next call tries again', async () => {
    let attempts = 0
    const loader = createDictionaryLoader(source, {
      de: () => (++attempts === 1 ? Promise.reject(new Error('offline')) : Promise.resolve({ default: de })),
    })
    await expect(loader.load('de')).rejects.toThrow('offline')
    await expect(loader.load('de')).resolves.toBe(de)
    expect(attempts).toBe(2)
  })

  it('accepts a host-owned locale code vocabulary and source locale', async () => {
    const loader = createDictionaryLoader<typeof source, 'source' | 'translated'>(source, { translated: () => Promise.resolve({ default: de }) }, 'source')
    expect(loader.ifLoaded('source')).toBe(source)
    await expect(loader.load('translated')).resolves.toBe(de)
  })
})

describe('catalogProblems', () => {
  it('is silent for a conforming translation and for the source against itself', () => {
    expect(catalogProblems(source, de, 'de')).toEqual([])
    expect(catalogProblems(source, source, 'en')).toEqual([])
  })

  it('names a missing key, a stray key, a wrong shape, empty text, a missing plural form, a placeholder drift', () => {
    const problems = catalogProblems(
      source,
      {
        'toy.hello': 'Hallo {nom}',
        'toy.alerts': { one: '{count} Alarm', other: ' ' },
        'toy.extra': 'x',
      },
      'de',
    )
    expect(problems).toEqual([
      'toy.extra: not in the source catalog',
      'toy.alerts: empty other',
      'toy.hello: placeholders {nom} but the source has {name}',
      'toy.plain: missing',
    ])
    expect(catalogProblems(source, { ...de, 'toy.alerts': 'flat' }, 'de')).toEqual(['toy.alerts: a plural in the source, a string here'])
  })

  it('demands the plural forms the TRANSLATION language distinguishes, not English’s', () => {
    const ru = { ...de, 'toy.alerts': { one: '{count} оповещение', other: '{count} оповещений' } }
    expect(catalogProblems(source, ru, 'ru')).toEqual([
      'toy.alerts: no "few" form (ru distinguishes one/few/many/other)',
      'toy.alerts: no "many" form (ru distinguishes one/few/many/other)',
    ])
    const ja = { ...de, 'toy.alerts': { other: '{count} 件のアラート' } }
    expect(catalogProblems(source, ja, 'ja')).toEqual([])
  })
})

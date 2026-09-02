// The widget's own catalog held to the runtime's standard, and the language object the chrome
// modules read: English by default, switchable, re-rendering its listeners as a translation lands.
// The PCL-4 proofs live here too (public-chart-library-boundary-plan.md): a server can import the
// runtime, a host registers a locale the inventory does not hold, reading direction is metadata,
// concurrent loads coalesce, a missing key falls back with a diagnostic, every shipped language
// conforms, and the packed declarations name no private workspace package.
import { describe, expect, it, vi } from 'vitest'
import { BUILT_IN_LOCALES, builtInLocaleInfo, catalogProblems } from '../src/i18n/runtime'
import { chartDictionaries, createChartI18n, type ChartCustomLocale, type ChartDictionary } from '../src/i18n'
import { catalogs, en } from '../src/i18n/en'
import { packedFileList, packedText } from './boundary/scan'

const KEYS = Object.keys(en)

// First in the file on purpose: the German chunk must not be in memory yet, or the construction-
// time fetch this proves would be indistinguishable from a cache hit.
describe('createChartI18n, constructed in a language whose chunk is not in memory', () => {
  it('fetches that language now and tells its listeners when it lands, rather than reading English until the next switch', async () => {
    expect(chartDictionaries.ifLoaded('de')).toBeNull()
    const i18n = createChartI18n('de')
    const heard = vi.fn()
    i18n.onChange(heard)
    expect(i18n.locale()).toBe('de')
    expect(i18n.t('legend.hideIndicator')).toBe('Hide indicator') // English until the chunk lands
    await chartDictionaries.load('de')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(heard).toHaveBeenCalledTimes(1)
    expect(i18n.t('legend.hideIndicator')).toBe('Indikator ausblenden')
  })
})

describe('the widget catalog', () => {
  it('is assembled from surface catalogs that define no key twice', () => {
    expect(catalogs.reduce((n, c) => n + Object.keys(c).length, 0)).toBe(KEYS.length)
  })

  it('names every key by its surface and conforms to itself', () => {
    for (const key of KEYS) expect(key, key).toMatch(/^[a-z]+\.[A-Za-z0-9_]+$/)
    expect(catalogProblems(en, en, 'en')).toEqual([])
  })

  // Vite transforms each locale chunk on first load. Start them together so this contract checks
  // the complete catalog inventory without turning transform scheduling into a serial bottleneck.
  it('ships every built-in language, and every one conforms', { timeout: 60_000 }, async () => {
    expect(BUILT_IN_LOCALES).toHaveLength(21)
    const locales = BUILT_IN_LOCALES.filter(({ code }) => code !== 'en')
    for (const { code } of locales) {
      expect(chartDictionaries.has(code), code).toBe(true)
    }
    const dictionaries = await Promise.all(locales.map(({ code }) => chartDictionaries.load(code)))
    for (const [index, { code, tag }] of locales.entries()) {
      expect(catalogProblems(en, dictionaries[index]!, tag), code).toEqual([])
    }
  })

  it('carries reading direction as locale metadata: Arabic and Hebrew read right to left', () => {
    expect(BUILT_IN_LOCALES.filter((l) => l.dir === 'rtl').map((l) => l.code)).toEqual(['ar', 'he_IL'])
    expect(builtInLocaleInfo('ar')).toEqual({ code: 'ar', endonym: 'العربية', tag: 'ar', dir: 'rtl' })
    expect(builtInLocaleInfo('he_IL')).toEqual({ code: 'he_IL', endonym: 'עברית', tag: 'he-IL', dir: 'rtl' })
    expect(builtInLocaleInfo('en').dir).toBe('ltr')
  })

  it('coalesces concurrent loads of one language into one dictionary', async () => {
    // The runtime test proves two in-flight calls share one promise; this proves the chart's own
    // chunks land as one object, whether or not another test already fetched the language.
    const first = chartDictionaries.load('th')
    const second = chartDictionaries.load('th')
    const [a, b] = await Promise.all([first, second])
    expect(a).toBe(b)
    expect(chartDictionaries.ifLoaded('th')).toBe(a)
    await expect(chartDictionaries.load('th')).resolves.toBe(a)
  })
})

describe('the runtime under a server render', () => {
  it('is imported here with no window and no document, and builds a translator without either', async () => {
    expect(typeof window).toBe('undefined')
    expect(typeof document).toBe('undefined')
    const runtime = await import('../src/i18n/runtime')
    expect(runtime.BUILT_IN_LOCALES).toHaveLength(21)
    const { createChartI18n: create } = await import('../src/i18n')
    expect(create('ja').tag()).toBe('ja')
    expect(create().t('legend.hideIndicator')).toBe('Hide indicator')
  })
})

describe('createChartI18n', () => {
  it('starts in English (or the language asked for) and exposes the BCP 47 tag', () => {
    expect(createChartI18n().locale()).toBe('en')
    expect(createChartI18n().tag()).toBe('en')
    expect(createChartI18n('zh_TW').tag()).toBe('zh-TW')
    expect(createChartI18n().t('legend.hideIndicator')).toBe('Hide indicator')
    expect(createChartI18n().t('legend.priceScale', { mode: 'log' })).toBe('Price scale: log')
  })

  it('switches language, tells its listeners, and always has text: English until a translation lands', async () => {
    const i18n = createChartI18n()
    const listener = vi.fn()
    const off = i18n.onChange(listener)
    await i18n.setLocale('de')
    expect(i18n.locale()).toBe('de')
    expect(i18n.tag()).toBe('de')
    expect(listener).toHaveBeenCalled()
    const text = i18n.t('legend.hideIndicator')
    expect(text.trim()).not.toBe('')
    if (!chartDictionaries.has('de')) expect(text).toBe('Hide indicator')

    const calls = listener.mock.calls.length
    await i18n.setLocale('de') // same language: nothing to say
    expect(listener).toHaveBeenCalledTimes(calls)
    off()
    await i18n.setLocale('fr')
    expect(listener).toHaveBeenCalledTimes(calls)
  })

  it('refuses a locale neither the inventory nor the host registered, at construction and on switch', async () => {
    const i18n = createChartI18n()
    await expect(i18n.setLocale('fr-CA')).rejects.toThrow('unsupported chart locale "fr-CA"')
    expect(i18n.locale()).toBe('en')
    expect(() => createChartI18n('fr-CA')).toThrow('unsupported chart locale "fr-CA"')
  })
})

/** A host's Canadian French: the English catalog with one key translated, loaded through the
 *  host's own chunk. */
const frCA = (dictionary: Partial<ChartDictionary>, fetch = vi.fn()): ChartCustomLocale => ({
  code: 'fr-CA',
  endonym: 'Français (Canada)',
  tag: 'fr-CA',
  dir: 'ltr',
  dictionary: () => {
    fetch()
    return Promise.resolve({ default: { ...en, ...dictionary } as ChartDictionary })
  },
})

describe('a host-registered locale', () => {
  it('joins the inventory for this instance: its code starts or switches the language, and its tag is its own', async () => {
    const fetch = vi.fn()
    const locale = frCA({ 'legend.hideIndicator': "Masquer l'indicateur" }, fetch)
    const i18n = createChartI18n('en', { locales: [locale] })
    const listener = vi.fn()
    i18n.onChange(listener)
    await i18n.setLocale('fr-CA')
    expect(i18n.locale()).toBe('fr-CA')
    expect(i18n.tag()).toBe('fr-CA')
    expect(i18n.t('legend.hideIndicator')).toBe("Masquer l'indicateur")
    expect(listener).toHaveBeenCalledTimes(2) // once as the switch begins in English, once as the chunk lands
    expect(fetch).toHaveBeenCalledTimes(1)

    const fromStart = createChartI18n('fr-CA', { locales: [locale] })
    expect(fromStart.locale()).toBe('fr-CA')
    expect(fromStart.tag()).toBe('fr-CA')
    await fromStart.setLocale('de')
    expect(fromStart.tag()).toBe('de')
  })

  it('fetches its chunk once for concurrent switches and shares the built-in cache', async () => {
    const fetch = vi.fn()
    const locale = frCA({}, fetch)
    const a = createChartI18n('en', { locales: [locale] })
    await Promise.all([a.setLocale('fr-CA'), a.setLocale('fr-CA')])
    expect(fetch).toHaveBeenCalledTimes(1)
    await a.setLocale('th')
    expect(a.t('legend.hideIndicator')).toBe(createChartI18n('th').t('legend.hideIndicator'))
  })

  it('cannot shadow a built-in code or tag', () => {
    expect(() => createChartI18n('en', { locales: [{ ...frCA({}), code: 'de' }] })).toThrow('duplicate locale code "de"')
    expect(() => createChartI18n('en', { locales: [{ ...frCA({}), code: 'deutsch', tag: 'de' }] })).toThrow('maps to more than one code')
    expect(() => createChartI18n('en', { locales: [{ ...frCA({}), tag: 'fr_CA' }] })).toThrow('must be canonical "fr-CA"')
  })

  it('falls back to English for a key its dictionary misses, and the diagnostic names the key and the locale', async () => {
    const missing = vi.fn()
    const partial = { ...en } as Record<string, unknown>
    delete partial['legend.hideIndicator']
    const locale: ChartCustomLocale = { ...frCA({}), dictionary: () => Promise.resolve({ default: partial as ChartDictionary }) }
    const i18n = createChartI18n('en', { locales: [locale], onMissing: missing })
    expect(i18n.t('legend.hideIndicator')).toBe('Hide indicator')
    expect(missing).not.toHaveBeenCalled() // English is the source; nothing is missing from it
    await i18n.setLocale('fr-CA')
    expect(i18n.t('legend.hideIndicator')).toBe('Hide indicator')
    expect(missing).toHaveBeenCalledWith('legend.hideIndicator', 'fr-CA')
    expect(i18n.t('legend.showIndicator')).toBe('Show indicator')
    expect(missing).toHaveBeenCalledTimes(1)
  })
})

describe('the packed declarations', () => {
  it('name no private workspace package in any packed declaration file', () => {
    const declarations = packedFileList().filter((path) => /\.d\.ts$/.test(path))
    for (const path of declarations) {
      const text = packedText(path)
      expect(text, `${path} is packed but unreadable`).not.toBeNull()
      expect(text, path).not.toMatch(/@trdrs\/i18n/)
    }
  })
})

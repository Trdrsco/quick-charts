// The widget's own catalog held to the runtime's standard, and the language object the chrome
// modules read: English by default, switchable, re-rendering its listeners as a translation lands.
import { describe, expect, it, vi } from 'vitest'
import { LOCALES, catalogProblems } from '@trdrs/i18n'
import { chartDictionaries, createChartI18n } from '../src/i18n'
import { catalogs, en } from '../src/i18n/en'

const KEYS = Object.keys(en)

describe('the widget catalog', () => {
  it('is assembled from surface catalogs that define no key twice', () => {
    expect(catalogs.reduce((n, c) => n + Object.keys(c).length, 0)).toBe(KEYS.length)
  })

  it('names every key by its surface and conforms to itself', () => {
    for (const key of KEYS) expect(key, key).toMatch(/^[a-z]+\.[A-Za-z0-9_]+$/)
    expect(catalogProblems(en, en, 'en')).toEqual([])
  })

  // Loads and checks 21 catalogs; on a busy machine that outlasts the default 5s per-test budget.
  it('ships every registry language, and every one conforms', { timeout: 60_000 }, async () => {
    for (const { code, tag } of LOCALES) {
      if (code === 'en') continue
      expect(chartDictionaries.has(code), code).toBe(true)
      expect(catalogProblems(en, await chartDictionaries.load(code), tag), code).toEqual([])
    }
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

  it('switches language, tells its listeners, and always has text — English until a translation lands', async () => {
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
})

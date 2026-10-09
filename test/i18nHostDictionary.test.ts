// A dictionary of your own measured against the major's baseline: every key of the major's first
// release is required, a key the catalog gained within the major is optional and reads English
// until the dictionary carries it, and every built-in language still carries every key. The type
// checks here are compiled by `pnpm typecheck`; the runtime checks run in the suite.
import { describe, expect, it, vi } from 'vitest'
import { BUILT_IN_LOCALES, createChartI18n, type ChartCustomLocale, type ChartDictionary, type ChartMessageKey } from '../src/i18n'
import { en } from '../src/i18n/en'
import { KEYS_ADDED_IN_MAJOR, type KeyAddedInMajor } from '../src/i18n/additions'
import type { Translation } from '../src/i18n/runtime'
import baseline from '../src/i18n/baseline.json'
import manifest from '../package.json'

type Catalog = Translation<typeof en>

/** A dictionary without one of its keys. */
function without<D extends object, K extends keyof D>(dictionary: D, key: K): Omit<D, K> {
  const out: Partial<D> = { ...dictionary }
  delete out[key]
  return out as unknown as Omit<D, K>
}

/** The English catalog without the keys it gained within the major: a dictionary that holds exactly
 *  the keys of the major's first release. */
function baselineDictionary(): Omit<Catalog, KeyAddedInMajor> {
  const out: Partial<Catalog> = { ...en }
  for (const key of KEYS_ADDED_IN_MAJOR) delete out[key]
  return out as Omit<Catalog, KeyAddedInMajor>
}

/** The keys a type requires: those an object of it cannot leave out. */
type RequiredKeys<T> = { [K in keyof T]-?: {} extends Pick<T, K> ? never : K }[keyof T]
/** Whether a catalog type requires every key of the English source. */
type CarriesEveryKey<T> = [ChartMessageKey] extends [RequiredKeys<T>] ? true : false

describe('a dictionary of your own', () => {
  it(`type-checks holding exactly the keys of ${baseline.release}, the first release of the major`, () => {
    const mine: ChartDictionary = baselineDictionary()
    expect(Object.keys(mine).sort()).toEqual(baseline.keys)
  })

  it("fails to type-check without a key of the major's first release", () => {
    // @ts-expect-error: every key of the major's first release is required
    const lacking: ChartDictionary = without(baselineDictionary(), 'legend.hideIndicator')
    expect('legend.hideIndicator' in lacking).toBe(false)
  })

  it('reads each key the catalog gained within the major that it leaves out in English, and reports it to onMissing with the locale', async () => {
    const missing = vi.fn()
    const mine: ChartDictionary = { ...baselineDictionary(), 'legend.hideIndicator': "Masquer l'indicateur" }
    const locale: ChartCustomLocale = { code: 'fr-CA', endonym: 'Français (Canada)', tag: 'fr-CA', dir: 'ltr', dictionary: () => Promise.resolve({ default: mine }) }
    const i18n = createChartI18n('en', { locales: [locale], onMissing: missing })
    await i18n.setLocale('fr-CA')
    expect(i18n.t('legend.hideIndicator')).toBe("Masquer l'indicateur")
    expect(missing).not.toHaveBeenCalled()
    for (const key of KEYS_ADDED_IN_MAJOR) {
      expect(i18n.t(key)).toBe(en[key])
      expect(missing).toHaveBeenLastCalledWith(key, 'fr-CA')
    }
    expect(missing).toHaveBeenCalledTimes(KEYS_ADDED_IN_MAJOR.length)
  })
})

describe('a built-in language', () => {
  it('fails to type-check without a key of the English source', () => {
    // @ts-expect-error: a built-in language carries every key of the English source
    const lacking: typeof import('../src/i18n/de').default = without(en, 'legend.hideIndicator')
    expect('legend.hideIndicator' in lacking).toBe(false)
  })

  it('is typed against every key of the English source, the keys the catalog gained within the major among them', () => {
    const carried: {
      ar: CarriesEveryKey<typeof import('../src/i18n/ar').default>
      ca_ES: CarriesEveryKey<typeof import('../src/i18n/ca_ES').default>
      de: CarriesEveryKey<typeof import('../src/i18n/de').default>
      es: CarriesEveryKey<typeof import('../src/i18n/es').default>
      fr: CarriesEveryKey<typeof import('../src/i18n/fr').default>
      he_IL: CarriesEveryKey<typeof import('../src/i18n/he_IL').default>
      id_ID: CarriesEveryKey<typeof import('../src/i18n/id_ID').default>
      it: CarriesEveryKey<typeof import('../src/i18n/it').default>
      ja: CarriesEveryKey<typeof import('../src/i18n/ja').default>
      ko: CarriesEveryKey<typeof import('../src/i18n/ko').default>
      ms_MY: CarriesEveryKey<typeof import('../src/i18n/ms_MY').default>
      pl: CarriesEveryKey<typeof import('../src/i18n/pl').default>
      pt: CarriesEveryKey<typeof import('../src/i18n/pt').default>
      ru: CarriesEveryKey<typeof import('../src/i18n/ru').default>
      sv: CarriesEveryKey<typeof import('../src/i18n/sv').default>
      th: CarriesEveryKey<typeof import('../src/i18n/th').default>
      tr: CarriesEveryKey<typeof import('../src/i18n/tr').default>
      vi: CarriesEveryKey<typeof import('../src/i18n/vi').default>
      zh: CarriesEveryKey<typeof import('../src/i18n/zh').default>
      zh_TW: CarriesEveryKey<typeof import('../src/i18n/zh_TW').default>
    } = { ar: true, ca_ES: true, de: true, es: true, fr: true, he_IL: true, id_ID: true, it: true, ja: true, ko: true, ms_MY: true, pl: true, pt: true, ru: true, sv: true, th: true, tr: true, vi: true, zh: true, zh_TW: true }
    expect(Object.keys(carried).sort()).toEqual(BUILT_IN_LOCALES.map((l) => l.code).filter((code) => code !== 'en').sort())
  })
})

describe("the major's baseline", () => {
  it("records the first release of the package's own major", () => {
    expect(baseline.release).toMatch(/^\d+\.0\.0$/)
    expect(baseline.release.split('.')[0]).toBe(manifest.version.split('.')[0])
  })

  it('holds only keys the English catalog holds, each once and in order', () => {
    expect(baseline.keys.filter((key) => !(key in en))).toEqual([])
    expect([...new Set(baseline.keys)].sort()).toEqual(baseline.keys)
  })

  it('lists as added within the major exactly the catalog keys the baseline does not hold', () => {
    expect([...KEYS_ADDED_IN_MAJOR]).toEqual(Object.keys(en).filter((key) => !baseline.keys.includes(key)).sort())
  })
})

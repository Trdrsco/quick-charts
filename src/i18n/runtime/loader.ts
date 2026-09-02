import type { Catalog, Translation } from './dictionary'
import { DEFAULT_LOCALE, type ChartLocaleCode } from './locales'

/** One dynamic import per locale a catalog ships a translation for. Each becomes its own chunk,
 *  fetched the first time that locale is chosen. The source locale needs no entry. A catalog may
 *  ship fewer locales than the registry lists; a locale it does not ship reads the source. */
export type DictionaryLoaders<Source extends Catalog, Code extends string = ChartLocaleCode> = Partial<
  Record<Code, () => Promise<{ default: Translation<Source> }>>
>

export interface DictionaryLoader<Source extends Catalog, Code extends string = ChartLocaleCode> {
  /** The translation if it is already in memory: synchronous, for a first render that must not flash. */
  ifLoaded(code: Code): Translation<Source> | null
  /** Load (once) and return a locale's translation. Concurrent callers share one fetch; a locale
   *  the catalog does not ship resolves to the source. */
  load(code: Code): Promise<Translation<Source>>
  /** Whether the catalog ships this locale (the source locale always does). */
  has(code: Code): boolean
}

export function createDictionaryLoader<Source extends Catalog>(source: Source, loaders: DictionaryLoaders<Source, ChartLocaleCode>): DictionaryLoader<Source, ChartLocaleCode>
export function createDictionaryLoader<Source extends Catalog, Code extends string>(
  source: Source,
  loaders: DictionaryLoaders<Source, Code>,
  sourceCode: Code,
): DictionaryLoader<Source, Code>
export function createDictionaryLoader<Source extends Catalog, Code extends string>(
  source: Source,
  loaders: DictionaryLoaders<Source, Code>,
  sourceCode: Code = DEFAULT_LOCALE as Code,
): DictionaryLoader<Source, Code> {
  // The source catalog ships in the main bundle. It is the fallback every translation falls through
  // to, so it must never be a network round-trip away.
  const sourceTranslation = source as unknown as Translation<Source>
  const loaded = new Map<Code, Translation<Source>>([[sourceCode, sourceTranslation]])
  const pending = new Map<Code, Promise<Translation<Source>>>()
  const loaderFor = (code: Code) => (code === sourceCode ? undefined : loaders[code])
  return {
    ifLoaded: (code) => loaded.get(code) ?? null,
    has: (code) => code === sourceCode || loaderFor(code) !== undefined,
    load(code) {
      const have = loaded.get(code)
      if (have) return Promise.resolve(have)
      const inFlight = pending.get(code)
      if (inFlight) return inFlight
      const loader = loaderFor(code)
      if (!loader) return Promise.resolve(sourceTranslation)
      const p = loader()
        .then((m) => {
          loaded.set(code, m.default)
          pending.delete(code)
          return m.default
        })
        .catch((e: unknown) => {
          pending.delete(code)
          throw e
        })
      pending.set(code, p)
      return p
    },
  }
}

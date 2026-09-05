// The chrome's own viewer preferences: the saved timeframe chips, the custom timeframe tokens, and
// the layout autosave switch. Each rides the widget's `ChartStorage` port under a key of its own,
// seeded from `ChartPreferences` on a first run, so where they live is the host's decision and
// the chrome assumes no browser store.
import type { ChartStorage } from '../../storage'
import { parseTimeframe, TIMEFRAME_PRESET_TOKENS, timeframeOrder } from '../../timeframe'
import type { ChartPreferences } from '../../widget/options'

const SAVED_KEY = 'quickcharts.savedTf.v1'
const CUSTOM_KEY = 'quickcharts.customTf.v1'
const AUTOSAVE_KEY = 'quickcharts.layoutAutosave.v1'

/** The chips a first-run chart offers. */
export const DEFAULT_SAVED_TIMEFRAMES: readonly string[] = ['1m', '5m', '1h', '4h', '1d']

const readList = (storage: ChartStorage, key: string, seed: readonly string[] | undefined, fallback: readonly string[]): string[] => {
  const stored = storage.get(key)
  let list: unknown = null
  if (stored) {
    try {
      list = JSON.parse(stored)
    } catch {
      list = null
    }
  }
  const source = Array.isArray(list) ? list : (seed ?? fallback)
  return [...new Set(source.filter((v): v is string => typeof v === 'string' && parseTimeframe(v) !== null))]
}

export interface TimeframeStore {
  saved(): readonly string[]
  custom(): readonly string[]
  toggleSaved(token: string): void
  /** Add a custom token. A preset, an unparseable token, or one already held is refused. */
  addCustom(token: string): boolean
  removeCustom(token: string): void
}

export function createTimeframeStore(storage: ChartStorage, preferences: Partial<ChartPreferences>): TimeframeStore {
  let saved = readList(storage, SAVED_KEY, preferences.savedTimeframes, DEFAULT_SAVED_TIMEFRAMES)
  let custom = readList(storage, CUSTOM_KEY, preferences.customTimeframes, []).filter((c) => !TIMEFRAME_PRESET_TOKENS.has(c))
  const write = (): void => {
    storage.set(SAVED_KEY, JSON.stringify(saved))
    storage.set(CUSTOM_KEY, JSON.stringify(custom))
  }
  return {
    saved: () => saved,
    custom: () => custom,
    toggleSaved(token) {
      saved = saved.includes(token) ? saved.filter((s) => s !== token) : [...saved, token]
      write()
    },
    addCustom(token) {
      if (parseTimeframe(token) === null || TIMEFRAME_PRESET_TOKENS.has(token) || custom.includes(token)) return false
      custom = [...custom, token].sort((a, b) => timeframeOrder(a) - timeframeOrder(b))
      write()
      return true
    },
    removeCustom(token) {
      custom = custom.filter((c) => c !== token)
      // A removed token must not linger as a chip.
      saved = saved.filter((s) => s !== token)
      write()
    },
  }
}

export interface AutosaveStore {
  get(): boolean
  set(on: boolean): void
}

export function createAutosaveStore(storage: ChartStorage, preferences: Partial<ChartPreferences>): AutosaveStore {
  const stored = storage.get(AUTOSAVE_KEY)
  let on = stored === null || stored === undefined ? preferences.layoutAutosave === true : stored === 'true'
  return {
    get: () => on,
    set(next) {
      on = next
      storage.set(AUTOSAVE_KEY, String(next))
    },
  }
}

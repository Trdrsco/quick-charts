// The chrome's own viewer preferences: the saved timeframe chips, the custom timeframe tokens, the
// layout autosave switch, and the saved layouts a viewer starred and the order they list them in. Each rides the widget's `ChartStorage` port under a key of its own,
// seeded from `ChartPreferences` on a first run, so where they live is the host's decision and
// the chrome assumes no browser store.
import type { ChartStorage } from '../../storage'
import { parseTimeframe, TIMEFRAME_PRESET_TOKENS, timeframeOrder } from '../../timeframe'
import type { ChartPreferences } from '../../widget/options'
import { ALL_TIMEFRAMES_OFFERED, offersTimeframe, type OfferedTimeframes } from '../../widget/timeframes'

const SAVED_KEY = 'quickcharts.savedTf.v1'
const CUSTOM_KEY = 'quickcharts.customTf.v1'
const AUTOSAVE_KEY = 'quickcharts.layoutAutosave.v1'
const LAYOUT_FAVORITES_KEY = 'quickcharts.layoutFavorites.v1'
const LAYOUT_SORT_KEY = 'quickcharts.layoutSort.v1'

/** The chips a first-run chart offers. */
export const DEFAULT_SAVED_TIMEFRAMES: readonly string[] = ['1m', '5m', '1h', '4h', '1d']

/** How many chips a chart shows when the host's timeframes leave none of the viewer's saved ones:
 *  that many of the smallest offered timeframes, as many as a first-run chart shows. */
export const SEEDED_CHIP_COUNT = DEFAULT_SAVED_TIMEFRAMES.length

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

/** The viewer's timeframe choices as the widget's offered timeframes show them. What is stored
 *  outlives the filter: a saved or custom token the widget does not offer is hidden, never dropped,
 *  so a chart that offers it again shows it again. */
export interface TimeframeStore {
  /** The saved chips the widget offers. When the offered timeframes leave none of a non-empty saved
   *  list, the first {@link SEEDED_CHIP_COUNT} offered ones stand in, or the first-run chips when
   *  the offered set is the presets. */
  saved(): readonly string[]
  /** The viewer's custom tokens, or none when the widget offers no custom timeframes. */
  custom(): readonly string[]
  /** Save or unsave a chip the widget offers. The shown chips become the saved ones, and the stored
   *  tokens the widget does not offer are kept. */
  toggleSaved(token: string): void
  /** Add a custom token. A preset, an unparseable token, one already held, or any token while the
   *  widget offers no custom timeframes is refused. */
  addCustom(token: string): boolean
  removeCustom(token: string): void
}

export function createTimeframeStore(storage: ChartStorage, preferences: Partial<ChartPreferences>, offered: OfferedTimeframes = ALL_TIMEFRAMES_OFFERED): TimeframeStore {
  let saved = readList(storage, SAVED_KEY, preferences.savedTimeframes, DEFAULT_SAVED_TIMEFRAMES)
  let custom = readList(storage, CUSTOM_KEY, preferences.customTimeframes, []).filter((c) => !TIMEFRAME_PRESET_TOKENS.has(c))
  const write = (): void => {
    storage.set(SAVED_KEY, JSON.stringify(saved))
    storage.set(CUSTOM_KEY, JSON.stringify(custom))
  }
  const offers = (token: string): boolean => offersTimeframe(offered, token)
  const restricted = offered.list !== null || !offered.custom
  const composable = offered.list === null && offered.custom
  const shownSaved = (): readonly string[] => {
    if (!restricted) return saved
    const shown = saved.filter(offers)
    if (shown.length > 0 || saved.length === 0) return shown
    return offered.list ? offered.list.slice(0, SEEDED_CHIP_COUNT) : DEFAULT_SAVED_TIMEFRAMES
  }
  return {
    saved: shownSaved,
    custom: () => (composable ? custom : []),
    toggleSaved(token) {
      if (!offers(token)) return
      const shown = shownSaved()
      const next = shown.includes(token) ? shown.filter((s) => s !== token) : [...shown, token]
      saved = [...saved.filter((s) => !offers(s)), ...next]
      write()
    },
    addCustom(token) {
      if (!composable || parseTimeframe(token) === null || TIMEFRAME_PRESET_TOKENS.has(token) || custom.includes(token)) return false
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

/** How the Layouts dialog orders the saved layouts: by name or by when each was last saved. */
export type LayoutSort = 'name-asc' | 'name-desc' | 'modified-asc' | 'modified-desc'

/** Every order, in the order the sort menu offers them. */
export const LAYOUT_SORTS: readonly LayoutSort[] = ['name-asc', 'name-desc', 'modified-asc', 'modified-desc']

export interface LayoutListStore {
  isFavorite(id: string): boolean
  toggleFavorite(id: string): void
  /** A deleted layout leaves the favorites with it. */
  forget(id: string): void
  sort(): LayoutSort
  setSort(next: LayoutSort): void
}

/** The saved layouts a viewer starred, which list first, and the order the rest follow, newest
 *  saved first until the viewer picks another. */
export function createLayoutListStore(storage: ChartStorage): LayoutListStore {
  let favorites = new Set<string>()
  const stored = storage.get(LAYOUT_FAVORITES_KEY)
  if (stored) {
    try {
      const list: unknown = JSON.parse(stored)
      if (Array.isArray(list)) favorites = new Set(list.filter((id): id is string => typeof id === 'string'))
    } catch {
      // An unreadable list starts empty rather than refusing the dialog.
    }
  }
  const storedSort = storage.get(LAYOUT_SORT_KEY)
  let order: LayoutSort = (LAYOUT_SORTS as readonly string[]).includes(storedSort ?? '') ? (storedSort as LayoutSort) : 'modified-desc'
  const write = (): void => storage.set(LAYOUT_FAVORITES_KEY, JSON.stringify([...favorites]))
  return {
    isFavorite: (id) => favorites.has(id),
    toggleFavorite(id) {
      if (!favorites.delete(id)) favorites.add(id)
      write()
    },
    forget(id) {
      if (favorites.delete(id)) write()
    },
    sort: () => order,
    setSort(next) {
      order = next
      storage.set(LAYOUT_SORT_KEY, next)
    },
  }
}

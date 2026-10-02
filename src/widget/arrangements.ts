// The arrangements and sync switches a widget offers: every arrangement in the catalog and every
// switch when the host names no list, or exactly the host's lists. An arrangement outside the
// offered set is not an arrangement of this widget: no menu tile shows it, the setter ignores it,
// and a saved layout that names one opens on an offered arrangement instead. A switch outside the
// offered set holds the value the host's `layout.sync` gives it, and nothing the viewer does or a
// saved layout says moves it.
import { ARRANGEMENTS, arrangementOf } from '../layoutGrid'
import type { LayoutSyncFlags } from './layout'

/** Every sync switch, in the order the layout setup menu lists them. */
export const LAYOUT_SYNC_KEYS: readonly (keyof LayoutSyncFlags)[] = ['symbol', 'interval', 'crosshair', 'time', 'dateRange']

/** The arrangements and sync switches a widget offers. `arrangements` is the host's list in its own
 *  order, or every code in catalog order; `named` says which. `sync` is the switches the viewer may
 *  change, in the menu's order. */
export interface OfferedLayouts {
  readonly arrangements: readonly string[]
  readonly named: boolean
  readonly sync: readonly (keyof LayoutSyncFlags)[]
}

/** Every arrangement and every switch: what a widget offers when the host restricts nothing. */
export const ALL_LAYOUTS_OFFERED: OfferedLayouts = { arrangements: ARRANGEMENTS.map((a) => a.code), named: false, sync: LAYOUT_SYNC_KEYS }

const SYNC_PHRASE = `it takes ${LAYOUT_SYNC_KEYS.join(', ')}`

/** Validate the host's `layouts` and `layoutSync` options and the opening arrangement. An empty
 *  `layouts`, an unknown code, a repeated code, and an opening arrangement outside the list are setup
 *  errors, as are an unknown or repeated sync switch. An empty `layoutSync` is valid: every switch
 *  then holds the host's value. Nothing a host passes is substituted. */
export function resolveOfferedLayouts(layouts: readonly unknown[] | undefined, layoutSync: readonly unknown[] | undefined, arrangement: unknown): OfferedLayouts {
  let arrangements = ALL_LAYOUTS_OFFERED.arrangements
  let named = false
  if (layouts !== undefined) {
    if (!Array.isArray(layouts)) throw new TypeError('layouts must be a list of arrangement codes, such as s, 2h or 4')
    if (layouts.length === 0) throw new TypeError('layouts must name at least one arrangement code')
    const seen = new Set<string>()
    for (const code of layouts) {
      if (typeof code !== 'string' || !arrangementOf(code)) throw new TypeError(`layouts names ${JSON.stringify(code)}, which is not an arrangement code`)
      if (seen.has(code)) throw new TypeError(`layouts names "${code}" more than once`)
      seen.add(code)
    }
    arrangements = [...seen]
    named = true
    if (arrangement !== undefined && !arrangements.includes(arrangement as string)) {
      throw new TypeError(`layout.arrangement ${JSON.stringify(arrangement)} is not one of the offered layouts: ${arrangements.join(', ')}`)
    }
  }
  let sync = LAYOUT_SYNC_KEYS
  if (layoutSync !== undefined) {
    if (!Array.isArray(layoutSync)) throw new TypeError(`layoutSync must be a list of sync switches; ${SYNC_PHRASE}`)
    const seen = new Set<keyof LayoutSyncFlags>()
    for (const key of layoutSync) {
      if (!(LAYOUT_SYNC_KEYS as readonly unknown[]).includes(key)) throw new TypeError(`layoutSync names ${JSON.stringify(key)}, which is not a sync switch; ${SYNC_PHRASE}`)
      if (seen.has(key as keyof LayoutSyncFlags)) throw new TypeError(`layoutSync names "${String(key)}" more than once`)
      seen.add(key as keyof LayoutSyncFlags)
    }
    sync = LAYOUT_SYNC_KEYS.filter((key) => seen.has(key))
  }
  return { arrangements, named, sync }
}

/** The arrangement a widget opens on: the host's `layout.arrangement`, else the first offered one
 *  when the host named a list, else the single chart. */
export function openingArrangement(offered: OfferedLayouts, arrangement: string | undefined): string {
  return arrangement ?? (offered.named ? offered.arrangements[0]! : 's')
}

/** The offered arrangement a layout of `count` charts opens on: the one with the most charts not
 *  above `count`, else the one with the fewest charts. Ties go to the one listed first. */
export function fallbackArrangement(count: number, offered: readonly string[]): string {
  let under: { code: string; count: number } | null = null
  let fewest: { code: string; count: number } | null = null
  for (const code of offered) {
    const n = arrangementOf(code)?.count
    if (n === undefined) continue
    if (n <= count && (!under || n > under.count)) under = { code, count: n }
    if (!fewest || n < fewest.count) fewest = { code, count: n }
  }
  return (under ?? fewest)!.code
}

/** Whether the layout setup menu has anything to choose: more than one arrangement, or one
 *  arrangement of several charts with a sync switch the viewer may change. */
export function layoutChoices(offered: OfferedLayouts): boolean {
  if (offered.arrangements.length > 1) return true
  return (arrangementOf(offered.arrangements[0]!)?.count ?? 1) > 1 && offered.sync.length > 0
}

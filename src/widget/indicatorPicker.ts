import type { ChartExtensionIcon } from '../extension'

/** Localized metadata for one optional collection in the chart-owned indicator picker. */
export interface IndicatorPickerCollection {
  /** Stable opaque id. `builtin` and `favorites` belong to the chart. */
  id: string
  label: string
  icon?: ChartExtensionIcon
  group?: string
  /** Catalog columns by default; a personal list can omit author and favorite columns. */
  layout?: 'table' | 'list'
  /** What the list shows while the collection lists no row and no search is typed. Omitted, it
   *  reads the chart's own no-matches line. */
  empty?: IndicatorPickerEmpty
}

/** A collection's empty state, centred where its list stands: a mark, a title, a line of text and
 *  one action, which the source's `act` runs with a `collection` target. */
export interface IndicatorPickerEmpty {
  title: string
  text?: string
  /** Drawn 120px square from the same 28-unit grid as every contributed glyph. */
  icon?: ChartExtensionIcon
  /** The empty state's one button. `add` and `favorite` belong to the chart. */
  action?: IndicatorPickerAction
}

/** A kind of row a host lists beside the chart's indicators. The picker offers each declared kind as
 *  a filter under its search field, after All and the chart's own Indicators. */
export interface IndicatorPickerKind {
  /** Stable opaque id. `indicator` belongs to the chart: every built-in is one, and so is an item
   *  that names no kind. */
  id: string
  /** The filter's localized label, a plural noun. */
  label: string
}

/** A host action is an opaque verb: the source's `act` runs it, and the chart only names it. */
export interface IndicatorPickerAction {
  /** Unique within its row. `add` and `favorite` belong to the chart. */
  id: string
  label: string
  icon?: ChartExtensionIcon
  disabled?: boolean
}

export interface IndicatorPickerItem {
  id: string
  title: string
  description?: string
  author?: string
  /** One of the source's declared `kinds`. Omitted, the item is an indicator. */
  kind?: string
  /** Omitted means this item offers no favorite action. */
  favorite?: boolean
  /** Omitted counts remain blank. */
  favoriteCount?: number
  primaryAction: string
  /** Up to two row actions; the primary must name one of them. */
  actions: readonly IndicatorPickerAction[]
}

/** Optional host annotations for shipped definitions. Names, math and Add remain chart-owned. */
export interface IndicatorPickerBuiltInState {
  id: string
  favorite?: boolean
  favoriteCount?: number
  /** At most one additional action beside the chart-owned Add control. */
  actions?: readonly IndicatorPickerAction[]
}

export interface IndicatorPickerSource {
  collections: readonly IndicatorPickerCollection[]
  /** The kinds the source's items come in beside indicators. With at least one, the picker shows a
   *  row of filters (All, Indicators, then these in order) under its search field. */
  kinds?: readonly IndicatorPickerKind[]
  /** The host supplies localized text. A new query or collection aborts the previous read.
   *  `builtInIds` are the built-ins the picker lists: every one, or those `builtInIndicators`
   *  offers. Items answered for `builtin` list after the shipped definitions, and items answered
   *  for `favorites` list there when starred. */
  list(request: { collection: string; query: string; builtInIds: readonly string[] }, signal: AbortSignal): Promise<
    | { kind: 'ok'; items: readonly IndicatorPickerItem[]; builtIns?: readonly IndicatorPickerBuiltInState[] }
    | { kind: 'unavailable'; message: string }
  >
  /** `favorite` carries the requested next value. A `collection` target is the empty state's action
   *  in the collection of that id. Closing aborts pending work; hosts must also check the signal
   *  before performing late UI effects. Add is never routed here. */
  act(request: { target: { kind: 'builtin' | 'item' | 'collection'; id: string }; action: string; favorite?: boolean }, signal: AbortSignal): Promise<
    | { kind: 'ok'; close?: boolean }
    | { kind: 'refused'; message: string }
  >
}

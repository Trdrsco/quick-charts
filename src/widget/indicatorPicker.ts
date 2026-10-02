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
  /** The host supplies localized text. A new query or collection aborts the previous read.
   *  `builtInIds` are the built-ins the picker lists: every one, or those `builtInIndicators`
   *  offers. */
  list(request: { collection: string; query: string; builtInIds: readonly string[] }, signal: AbortSignal): Promise<
    | { kind: 'ok'; items: readonly IndicatorPickerItem[]; builtIns?: readonly IndicatorPickerBuiltInState[] }
    | { kind: 'unavailable'; message: string }
  >
  /** `favorite` carries the requested next value. Closing aborts pending work; hosts must also
   *  check the signal before performing late UI effects. Add is never routed here. */
  act(request: { target: { kind: 'builtin' | 'item'; id: string }; action: string; favorite?: boolean }, signal: AbortSignal): Promise<
    | { kind: 'ok'; close?: boolean }
    | { kind: 'refused'; message: string }
  >
}

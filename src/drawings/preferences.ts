// Every standing choice the drawing workflow remembers, as ONE record.
//
// These were seven separate browser keys, each read and written where it happened to be needed,
// which is why a host had no way to move them anywhere else. They are one preference record now,
// persisted through the chart's `ChartStorage` port by the widget, so a host that keeps viewer
// state on a server keeps these there too and a second device opens the chart set up the same way.
//
// This is flat viewer state, not an entity: no identity, no revision, no conflict. That is exactly
// the line `ChartStorage` draws against the revisioned resource contract next door, where saved
// charts, layouts, drawings and templates live.
import type { CursorMode } from './cursorModel'
import { CURSOR_MODES } from './cursorModel'
import type { MagnetMode } from './magnetModel'
import type { FavoritesPosition, FavoritesState } from './favoritesModel'
import { DEFAULT_FAVORITES, MAX_FAVORITE_TOOLS } from './favoritesModel'

/** The most recent glyph picks the record keeps. */
const RECENT_GLYPHS_MAX = 12

export interface DrawingPreferences {
  /** The pointer's glyph over the chart. */
  cursor: CursorMode
  /** Off, or the strength the magnet pulls with. */
  magnet: MagnetMode
  /** The last strength chosen, so switching the magnet back on restores it rather than falling
   *  back to weak. */
  magnetStrength: Exclude<MagnetMode, 'off'>
  /** A placed tool stays armed for the next drawing. */
  stayInDrawingMode: boolean
  /** A sweep takes locked drawings too. */
  removeLocked: boolean
  /** A NEW drawing is replicated to every pane charting the same symbol. */
  syncAcrossPanes: boolean
  /** Each toolbar group's last-picked tool, so the button keeps that face. Keyed by group id. */
  railTools: Readonly<Record<string, string>>
  favorites: FavoritesState
  /** Where the selected drawing's settings bar was dragged to; null takes its default place. */
  settingsBarPosition: FavoritesPosition | null
  /** The glyph picker's most recent picks, newest first. */
  recentGlyphs: readonly string[]
}

export const DEFAULT_DRAWING_PREFERENCES: DrawingPreferences = {
  cursor: 'cross',
  magnet: 'off',
  magnetStrength: 'weak',
  stayInDrawingMode: false,
  removeLocked: false,
  syncAcrossPanes: true,
  railTools: {},
  favorites: DEFAULT_FAVORITES,
  settingsBarPosition: null,
  recentGlyphs: [],
}

const positionOf = (value: unknown): FavoritesPosition | null => {
  const p = value as { x?: unknown; y?: unknown } | null | undefined
  return p && typeof p.x === 'number' && typeof p.y === 'number' ? { x: p.x, y: p.y } : null
}

const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback

const bool = (value: unknown, fallback: boolean): boolean => (typeof value === 'boolean' ? value : fallback)

const stringRecord = (value: unknown): Record<string, string> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const out: Record<string, string> = {}
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) if (typeof entry === 'string') out[key] = entry
  return out
}

const favoritesOf = (value: unknown): FavoritesState => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return DEFAULT_FAVORITES
  const raw = value as { tools?: unknown; visible?: unknown; position?: unknown }
  const tools = Array.isArray(raw.tools) ? raw.tools.filter((t): t is string => typeof t === 'string').slice(0, MAX_FAVORITE_TOOLS) : []
  const p = raw.position as { x?: unknown; y?: unknown } | null | undefined
  const position = p && typeof p.x === 'number' && typeof p.y === 'number' ? { x: p.x, y: p.y } : null
  return { tools, visible: bool(raw.visible, DEFAULT_FAVORITES.visible), position }
}

/** Read a stored record. TOTAL: anything unreadable, and any field that is missing or not what it
 *  claims, falls back to its default rather than throwing. A preference document is the one piece
 *  of state a chart must never fail to open on. */
export function parseDrawingPreferences(raw: string | null | undefined): DrawingPreferences {
  let parsed: unknown = null
  try {
    parsed = JSON.parse(raw ?? 'null')
  } catch {
    parsed = null
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return DEFAULT_DRAWING_PREFERENCES
  const value = parsed as Record<string, unknown>
  return {
    cursor: oneOf(value.cursor, CURSOR_MODES, DEFAULT_DRAWING_PREFERENCES.cursor),
    magnet: oneOf(value.magnet, ['off', 'weak', 'strong'] as const, DEFAULT_DRAWING_PREFERENCES.magnet),
    magnetStrength: oneOf(value.magnetStrength, ['weak', 'strong'] as const, DEFAULT_DRAWING_PREFERENCES.magnetStrength),
    stayInDrawingMode: bool(value.stayInDrawingMode, DEFAULT_DRAWING_PREFERENCES.stayInDrawingMode),
    removeLocked: bool(value.removeLocked, DEFAULT_DRAWING_PREFERENCES.removeLocked),
    syncAcrossPanes: bool(value.syncAcrossPanes, DEFAULT_DRAWING_PREFERENCES.syncAcrossPanes),
    railTools: stringRecord(value.railTools),
    favorites: favoritesOf(value.favorites),
    settingsBarPosition: positionOf(value.settingsBarPosition),
    recentGlyphs: Array.isArray(value.recentGlyphs) ? value.recentGlyphs.filter((g): g is string => typeof g === 'string').slice(0, RECENT_GLYPHS_MAX) : [],
  }
}

/** Write a preference document. */
export function serializeDrawingPreferences(preferences: DrawingPreferences): string {
  return JSON.stringify(preferences)
}

/** The `ChartStorage` key the widget persists the record under, in the widget's own namespace
 *  beside its symbol, timeframe and scale keys. */
export const DRAWING_PREFERENCES_KEY = 'quickcharts.drawingPrefs.v1'

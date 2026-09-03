// Favorite drawing tools: the starred list, and the floating bar it fills.
//
// The list is ORDERED and the order is the trader's: a tool joins at the end and keeps its place,
// because a bar that re-sorts itself is a bar whose buttons move under the pointer. The bar's own
// visibility and dragged position travel with the list, since all three are the same preference
// from a trader's point of view: where my favorites are.
//
// The cap exists so the bar cannot grow past the chart it floats over. Starring past the cap is
// refused rather than silently dropping the oldest: a star that appears to do nothing is a bug
// report, and a star that quietly evicts another is worse.

/** The most tools the bar holds. */
export const MAX_FAVORITE_TOOLS = 24

/** Where the bar sits inside the chart, in CSS pixels from the chart's top left. Null means the
 *  bar has never been dragged and takes its default corner. */
export interface FavoritesPosition {
  x: number
  y: number
}

/** The whole favorites preference: what is starred, whether the bar shows, and where it sits. */
export interface FavoritesState {
  tools: readonly string[]
  visible: boolean
  position: FavoritesPosition | null
}

export const DEFAULT_FAVORITES: FavoritesState = { tools: [], visible: true, position: null }

/** Where favorites live. The chart holds no storage of its own, so a host implements this over
 *  whatever it already uses for viewer state, and every surface that stars a tool goes through it.
 *  `subscribe` is what keeps the toolbar's stars and the floating bar showing the same list without
 *  either one owning the other. */
export interface FavoritesPort {
  read(): FavoritesState
  write(state: FavoritesState): void
  /** Hear every change, including one made by another surface. Returns its own unsubscribe. */
  subscribe(listener: () => void): () => void
}

export const isFavorite = (state: FavoritesState, type: string): boolean => state.tools.includes(type)

/** Star or unstar a tool. Returns a NEW state; unstarring always succeeds, and starring past the
 *  cap returns the state unchanged so the caller can say why nothing happened. */
export function toggleFavorite(state: FavoritesState, type: string): FavoritesState {
  if (isFavorite(state, type)) return { ...state, tools: state.tools.filter((t) => t !== type) }
  if (state.tools.length >= MAX_FAVORITE_TOOLS) return state
  return { ...state, tools: [...state.tools, type] }
}

/** Whether the bar has anything to show. An empty list hides the bar even when it is switched on,
 *  because an empty floating strip over a chart is a smudge, not a control. */
export const favoritesBarShown = (state: FavoritesState): boolean => state.visible && state.tools.length > 0

/** Drop starred tools the catalog no longer registers, so a list saved against an older
 *  configuration does not leave dead buttons on the bar. */
export function pruneFavorites(state: FavoritesState, known: (type: string) => boolean): FavoritesState {
  const tools = state.tools.filter(known)
  return tools.length === state.tools.length ? state : { ...state, tools }
}

/** Keep a dragged bar inside the chart. A chart that shrinks below the bar's last position would
 *  otherwise strand it off the edge with no way to drag it back. */
export function clampFavoritesPosition(
  position: FavoritesPosition,
  bar: { width: number; height: number },
  chart: { width: number; height: number },
): FavoritesPosition {
  return {
    x: Math.min(Math.max(0, position.x), Math.max(0, chart.width - bar.width)),
    y: Math.min(Math.max(0, position.y), Math.max(0, chart.height - bar.height)),
  }
}

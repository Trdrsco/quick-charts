// The toolbar's eye: ONE switch with a chosen subject, not a row of toggles.
//
// The menu picks which layer the eye blanks, the eye blanks it, and the eye keeps wearing that
// layer's mark until the subject changes. Exactly one subject is ever blanked, so choosing a new
// one restores the last, and `all` is a subject like the others rather than an extra switch.
//
// The eye reaches CHART-OWNED layers only: drawings and indicators. Positions, working orders,
// executions and any other trading overlay are not the chart's to blank, and `all` therefore
// carries no trading meaning. A product that sells trading marks owns their visibility on its own
// surface.
import type { ChartMessageKey } from '../i18n/en'

/** The layers the eye can blank. `all` is drawings plus indicators, and nothing else. */
export type HideMode = 'drawings' | 'indicators' | 'all'

/** Menu order. */
export const HIDE_ORDER: readonly HideMode[] = ['drawings', 'indicators', 'all']

/** What the eye is pointed at, and whether it is blanking. */
export interface HideState {
  mode: HideMode
  on: boolean
}

/** The eye's resting state: pointed at drawings, blanking nothing. */
export const DEFAULT_HIDE_STATE: HideState = { mode: 'drawings', on: false }

/** Each subject's wording in both states. The eye keeps its subject's mark whether or not the
 *  layer is blanked, so the toolbar never stops naming what the button acts on. */
export const HIDE_LABELS: Readonly<Record<HideMode, { hide: ChartMessageKey; show: ChartMessageKey }>> = {
  drawings: { hide: 'drawing.hideDrawings', show: 'drawing.showDrawings' },
  indicators: { hide: 'drawing.hideIndicators', show: 'drawing.showIndicators' },
  all: { hide: 'drawing.hideAll', show: 'drawing.showAll' },
}

/** Whether a state blanks one concrete layer. `all` covers both concrete layers; asking whether
 *  `all` itself is blanked is asking about the subject, which is `state.mode`. */
export function blanks(state: HideState, layer: 'drawings' | 'indicators'): boolean {
  return state.on && (state.mode === layer || state.mode === 'all')
}

/** The eye itself: blank or restore the current subject. */
export function toggleHide(state: HideState): HideState {
  return { mode: state.mode, on: !state.on }
}

/** The menu picking a subject. Picking the subject that is currently blanked releases it; picking
 *  any other subject points the eye there AND blanks it, which is what makes the pick a single
 *  gesture rather than a pick followed by a click on the eye. */
export function chooseHideMode(state: HideState, mode: HideMode): HideState {
  const active = state.on && state.mode === mode
  return { mode, on: !active }
}

/** Whether the menu marks a row: only when it is BOTH the chosen subject and currently blanked, so
 *  the menu reads as "this is what the eye is doing" rather than three separate states. */
export function hideRowActive(state: HideState, mode: HideMode): boolean {
  return state.on && state.mode === mode
}

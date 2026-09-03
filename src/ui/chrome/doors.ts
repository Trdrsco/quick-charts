// The doors a chart plane knocks on when it needs a chrome surface it does not own: the symbol
// search dialog (the compare plane's door, and the compare rows' change-symbol) and the indicator
// settings dialog (the legend gear's door).
//
// The chrome is widget-scoped and mounts after every chart exists, so a chart holds ONE doors
// object from construction and the chrome fills it in once it is up. A door with no chrome behind
// it (the feature is off, or the chrome has not mounted) answers honestly: the search door does
// nothing, and the settings door reports that nothing took the request, so the caller can fall
// back to the inputs-only editor.
import type { ChartHandle } from '../../widget/chart'

/** Which dialog the search family opens. */
export type SearchMode = 'search' | 'compare' | 'change-symbol'

export interface SearchRequest {
  mode: SearchMode
  /** The chart the dialog acts on. */
  chart: ChartHandle
  /** `change-symbol`: the symbol being replaced, prefilled and selected. */
  changeFrom?: string
  /** `change-symbol`: who receives the pick. Absent, the pick is the chart's own symbol. */
  onPick?(symbol: string): void
}

export interface ChromeDoors {
  openSearch(request: SearchRequest): void
  /** Open the settings dialog for one indicator instance. False when no surface took it. */
  openIndicatorSettings(chart: ChartHandle, instanceId: string): boolean
}

/** The doors before any chrome fills them: each answers that nothing is behind it. */
export function emptyDoors(): ChromeDoors {
  return {
    openSearch: () => undefined,
    openIndicatorSettings: () => false,
  }
}

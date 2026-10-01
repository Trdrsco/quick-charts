// The doors a chart plane knocks on when it needs a chrome surface it does not own: the widget's
// replay row, the symbol search dialog (the compare plane's door, and the compare rows'
// change-symbol), and the indicator settings dialog (the legend gear's door).
//
// The chrome is widget-scoped and mounts after every chart exists, so a chart holds ONE doors
// object from construction and the chrome fills it in once it is up. A door with no chrome behind
// it (the feature is off, or the chrome has not mounted) answers honestly: the search door does
// nothing, and the settings door reports that nothing took the request, so the caller can fall
// back to the inputs-only editor.
import type { ChartHandle } from '../../widget/chart'
import type { CommandExecutor } from '../../widget/commands'
import type { FeedBar } from '../../datafeed'
import type { LayoutModelState } from '../../widget/layout'

/** Which dialog the search family opens. `pick` is the one a page opens beside the chart, or with
 *  no chart at all: it searches the same feed and hands the pick back. */
export type SearchMode = 'search' | 'compare' | 'change-symbol' | 'pick'

export interface SearchRequest {
  mode: SearchMode
  /** The chart the dialog acts on, and the one `pick` does not have. */
  chart?: ChartHandle
  /** `change-symbol`: the symbol being replaced, and `pick`: the query to open holding. Prefilled
   *  and selected, so typing replaces it. */
  changeFrom?: string
  /** `change-symbol` and `pick`: who receives the pick. Absent, the pick is the chart's own symbol. */
  onPick?(symbol: string): void
}

/** The chart-local state the widget-owned replay row needs. This is private chrome plumbing: the
 *  public replay API remains on each ChartHandle, and a host supplies no transport owner. */
export interface ReplayTransportTarget {
  chart: ChartHandle
  commands: CommandExecutor
  bars(): readonly FeedBar[]
  intraday(): boolean
}

export interface ChromeDoors {
  showIndicatorPicker(collection?: string): void
  openSearch(request: SearchRequest): void
  /** Open the settings dialog for one indicator instance. False when no surface took it. */
  openIndicatorSettings(chart: ChartHandle, instanceId: string): boolean
  /** Show a chart-owned informational or error notice when the default chrome provides toasts. */
  notify(kind: 'info' | 'error', text: string): void
  /** Ask the viewer to name a never-saved layout, through the saved-layout menu's own name prompt.
   *  False when no surface took it, which is how the save command knows the ask went nowhere. */
  nameLayout(): boolean
  /** Raise the saved-layout menu's Open-layout dialog. False when no surface took it. */
  openLayouts(): boolean
  /** Publish one chart's replay transition to the single widget-owned presentation row. The row
   *  reads the chart's own phase, so a transition carries the chart rather than a state copy. */
  replayChanged(target: ReplayTransportTarget): void
  /** A complete committed layout projection for package chrome. Private until a host needs it. */
  layoutChanged(state: LayoutModelState): void
}

/** The doors before any chrome fills them: each answers that nothing is behind it. */
export function emptyDoors(): ChromeDoors {
  return {
    showIndicatorPicker: () => undefined,
    openSearch: () => undefined,
    openIndicatorSettings: () => false,
    notify: () => undefined,
    nameLayout: () => false,
    openLayouts: () => false,
    replayChanged: () => undefined,
    layoutChanged: () => undefined,
  }
}

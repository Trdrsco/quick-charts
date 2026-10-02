// The legend strip over the chart: the header's reading of the bar, and the per-chip controls'
// accessible names.
export const legend = {
  /** The four marks the bar's prices wear, in reading order. Single letters by market convention,
   *  catalogued because the convention is written in the reader's own language. */
  'legend.open': 'O',
  'legend.high': 'H',
  'legend.low': 'L',
  'legend.close': 'C',
  /** The move against the previous bar's close: the change on the symbol's own price grid, then
   *  its percentage. Both arrive already written, sign included. */
  'legend.change': '{change} ({percent}%)',
  'legend.indicatorSettings': 'Indicator settings',
  'legend.showRows': 'Show indicator rows',
  'legend.hideRows': 'Hide indicator rows',
  'legend.restorePane': 'Restore pane',
  'legend.collapsePane': 'Collapse pane',
  'legend.maximizePane': 'Maximize pane',
  'legend.showIndicator': 'Show indicator',
  'legend.hideIndicator': 'Hide indicator',
  /** The scale-mode labels, in SCALE_MODE_OPTIONS order. The percentage and indexed labels are
   *  the marks a price scale wears everywhere ('%' and the 100 it indexes to). */
  'legend.scaleNormal': 'Reg',
  'legend.scaleLog': 'Log',
  'legend.scalePercent': '%',
  'legend.scaleIndexed': '100',
  // The compare surface's legend side: the header door and the compare chips' verbs. The dialog
  // both open belongs to the search family (search.ts).
  'legend.changeSymbol': 'Change symbol',
  'legend.removeCompare': 'Remove comparison',
  'legend.removeIndicator': 'Remove indicator',
} as const

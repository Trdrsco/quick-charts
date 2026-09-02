// The legend strip over the chart: the per-chip controls' accessible names.
export const legend = {
  'legend.indicatorSettings': 'Indicator settings',
  'legend.restorePane': 'Restore pane',
  'legend.collapsePane': 'Collapse pane',
  'legend.maximizePane': 'Maximize pane',
  'legend.showIndicator': 'Show indicator',
  'legend.hideIndicator': 'Hide indicator',
  /** The scale-mode chips' tooltip; `{mode}` is the mode's id (normal, log, percent, indexed). */
  'legend.priceScale': 'Price scale: {mode}',
  /** The scale-mode chips themselves, in SCALE_MODE_OPTIONS order — abbreviated to fit a 5px-padded
   *  chip, which is why the tooltip carries the full sentence. The percentage and indexed chips are
   *  the marks a price scale wears everywhere ('%' and the 100 it indexes to). */
  'legend.scaleNormal': 'Reg',
  'legend.scaleLog': 'Log',
  'legend.scalePercent': '%',
  'legend.scaleIndexed': '100',
  // The compare surface's legend side: the header door and the compare chips' verbs. The dialog
  // both open belongs to the search family (search.ts).
  'legend.compare': 'Compare or add symbol',
  'legend.changeSymbol': 'Change symbol',
  'legend.removeCompare': 'Remove compare',
} as const

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
  // The compare surface: the header door, the dialog (both modes), and the compare chips' verbs.
  'legend.compare': 'Compare or add symbol',
  'legend.compareTitle': 'Compare symbols',
  'legend.changeSymbol': 'Change symbol',
  'legend.samePercent': 'Same % scale',
  'legend.newScale': 'New price scale',
  'legend.newPane': 'New pane',
  'legend.added': 'Added symbols',
  'legend.removeCompare': 'Remove compare',
  'legend.searchPlaceholder': 'Symbol',
} as const

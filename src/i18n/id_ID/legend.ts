import type { Translation } from '@trdrs/i18n'
import type { legend as source } from '../en/legend'

export const legend: Translation<typeof source> = {
  'legend.indicatorSettings': 'Indicator settings',
  'legend.restorePane': 'Restore pane',
  'legend.collapsePane': 'Collapse pane',
  'legend.maximizePane': 'Maximize pane',
  'legend.showIndicator': 'Show indicator',
  'legend.hideIndicator': 'Hide indicator',
  'legend.priceScale': 'Price scale: {mode}',
  'legend.scaleNormal': 'Reg',
  'legend.scaleLog': 'Log',
  'legend.scalePercent': '%',
  'legend.scaleIndexed': '100',
}

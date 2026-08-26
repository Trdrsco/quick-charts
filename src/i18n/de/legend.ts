import type { Translation } from '@trdrs/i18n'
import type { legend as source } from '../en/legend'

export const legend: Translation<typeof source> = {
  'legend.indicatorSettings': 'Indikator-Einstellungen',
  'legend.restorePane': 'Bereich wiederherstellen',
  'legend.collapsePane': 'Bereich einklappen',
  'legend.maximizePane': 'Bereich maximieren',
  'legend.showIndicator': 'Indikator anzeigen',
  'legend.hideIndicator': 'Indikator ausblenden',
  'legend.priceScale': 'Preisskala: {mode}',
  'legend.scaleNormal': 'Norm',
  'legend.scaleLog': 'Log',
  'legend.scalePercent': '%',
  'legend.scaleIndexed': '100',
}

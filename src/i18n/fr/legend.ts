import type { Translation } from '@trdrs/i18n'
import type { legend as source } from '../en/legend'

export const legend: Translation<typeof source> = {
  'legend.indicatorSettings': 'Paramètres de l\'indicateur',
  'legend.restorePane': 'Restaurer le volet',
  'legend.collapsePane': 'Réduire le volet',
  'legend.maximizePane': 'Agrandir le volet',
  'legend.showIndicator': 'Afficher l\'indicateur',
  'legend.hideIndicator': 'Masquer l\'indicateur',
  'legend.priceScale': 'Échelle des prix : {mode}',
  'legend.scaleNormal': 'Nor',
  'legend.scaleLog': 'Log',
  'legend.scalePercent': '%',
  'legend.scaleIndexed': '100',
}

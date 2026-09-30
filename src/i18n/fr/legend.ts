import type { Translation } from '../runtime'
import type { legend as source } from '../en/legend'

export const legend: Translation<typeof source> = {
  'legend.open': 'O',
  'legend.high': 'H',
  'legend.low': 'L',
  'legend.close': 'C',
  'legend.change': '{change} ({percent}%)',
  'legend.indicatorSettings': 'Paramètres de l\'indicateur',
  'legend.showRows': 'Show study rows',
  'legend.hideRows': 'Hide study rows',
  'legend.restorePane': 'Restaurer le volet',
  'legend.collapsePane': 'Réduire le volet',
  'legend.maximizePane': 'Agrandir le volet',
  'legend.showIndicator': 'Afficher l\'indicateur',
  'legend.hideIndicator': 'Masquer l\'indicateur',
  'legend.scaleNormal': 'Nor',
  'legend.scaleLog': 'Log',
  'legend.scalePercent': '%',
  'legend.scaleIndexed': '100',
  'legend.changeSymbol': 'Changer de symbole',
  'legend.removeCompare': 'Supprimer la comparaison',
  'legend.removeIndicator': 'Remove indicator',
}

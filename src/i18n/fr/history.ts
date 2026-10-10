import type { Translation } from '../runtime'
import type { history as source } from '../en/history'

export const history: Translation<typeof source> = {
  'history.undoNamed': 'Annuler : {change}',
  'history.redoNamed': 'Rétablir : {change}',
  'history.changeSymbol': 'changement de symbole',
  'history.changeTimeframe': 'changement d\'intervalle',
  'history.changeChartStyle': 'changement de style du graphique',
  'history.changePriceScale': 'changement d\'échelle de prix',
  'history.changeSettings': 'changement de paramètres',
  'history.changeAddCompare': 'ajout d\'une comparaison',
  'history.changeRemoveCompare': 'suppression d\'une comparaison',
  'history.changeCompare': 'modification d\'une comparaison',
  'history.changeAddIndicator': 'ajout d\'un indicateur',
  'history.changeRemoveIndicator': 'suppression d\'un indicateur',
  'history.changeIndicator': 'modification d\'un indicateur',
  'history.changeMovePane': 'déplacement d\'un volet',
  'history.changeAddDrawing': 'ajout d\'un dessin',
  'history.changeRemoveDrawing': 'suppression d\'un dessin',
  'history.changeDrawing': 'modification d\'un dessin',
}

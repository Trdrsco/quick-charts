import type { Translation } from '../runtime'
import type { history as source } from '../en/history'

export const history: Translation<typeof source> = {
  'history.undoNamed': 'Desfés: {change}',
  'history.redoNamed': 'Refés: {change}',
  'history.changeSymbol': 'canvi de símbol',
  'history.changeTimeframe': 'canvi d’interval',
  'history.changeChartStyle': 'canvi d’estil del gràfic',
  'history.changePriceScale': 'canvi d’escala de preus',
  'history.changeSettings': 'canvi de configuració',
  'history.changeAddCompare': 'addició d’una comparació',
  'history.changeRemoveCompare': 'eliminació d’una comparació',
  'history.changeCompare': 'canvi d’una comparació',
  'history.changeAddIndicator': 'addició d’un indicador',
  'history.changeRemoveIndicator': 'eliminació d’un indicador',
  'history.changeIndicator': 'canvi d’un indicador',
  'history.changeAddDrawing': 'addició d’un dibuix',
  'history.changeRemoveDrawing': 'eliminació d’un dibuix',
  'history.changeDrawing': 'canvi d’un dibuix',
}

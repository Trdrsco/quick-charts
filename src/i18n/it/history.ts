import type { Translation } from '../runtime'
import type { history as source } from '../en/history'

export const history: Translation<typeof source> = {
  'history.undoNamed': 'Annulla: {change}',
  'history.redoNamed': 'Ripeti: {change}',
  'history.changeSymbol': 'cambio di simbolo',
  'history.changeTimeframe': 'cambio di intervallo',
  'history.changeChartStyle': 'cambio di stile del grafico',
  'history.changePriceScale': 'cambio di scala dei prezzi',
  'history.changeSettings': 'modifica delle impostazioni',
  'history.changeAddCompare': 'aggiunta di un confronto',
  'history.changeRemoveCompare': 'rimozione di un confronto',
  'history.changeCompare': 'modifica di un confronto',
  'history.changeAddIndicator': 'aggiunta di un indicatore',
  'history.changeRemoveIndicator': 'rimozione di un indicatore',
  'history.changeIndicator': 'modifica di un indicatore',
  'history.changeAddDrawing': 'aggiunta di un disegno',
  'history.changeRemoveDrawing': 'rimozione di un disegno',
  'history.changeDrawing': 'modifica di un disegno',
}

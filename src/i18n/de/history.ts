import type { Translation } from '../runtime'
import type { history as source } from '../en/history'

export const history: Translation<typeof source> = {
  'history.undoNamed': 'Rückgängig: {change}',
  'history.redoNamed': 'Wiederholen: {change}',
  'history.changeSymbol': 'Symbolwechsel',
  'history.changeTimeframe': 'Wechsel der Zeiteinheit',
  'history.changeChartStyle': 'Wechsel des Chartstils',
  'history.changePriceScale': 'Änderung der Preisskala',
  'history.changeSettings': 'Änderung der Einstellungen',
  'history.changeAddCompare': 'Vergleich hinzufügen',
  'history.changeRemoveCompare': 'Vergleich entfernen',
  'history.changeCompare': 'Änderung des Vergleichs',
  'history.changeAddIndicator': 'Indikator hinzufügen',
  'history.changeRemoveIndicator': 'Indikator entfernen',
  'history.changeIndicator': 'Änderung des Indikators',
  'history.changeMovePane': 'move pane',
  'history.changeAddDrawing': 'Zeichnung hinzufügen',
  'history.changeRemoveDrawing': 'Zeichnung entfernen',
  'history.changeDrawing': 'Änderung der Zeichnung',
}

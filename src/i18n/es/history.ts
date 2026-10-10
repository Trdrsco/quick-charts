import type { Translation } from '../runtime'
import type { history as source } from '../en/history'

export const history: Translation<typeof source> = {
  'history.undoNamed': 'Deshacer: {change}',
  'history.redoNamed': 'Rehacer: {change}',
  'history.changeSymbol': 'cambio de símbolo',
  'history.changeTimeframe': 'cambio de intervalo',
  'history.changeChartStyle': 'cambio de estilo del gráfico',
  'history.changePriceScale': 'cambio de escala de precios',
  'history.changeSettings': 'cambio de ajustes',
  'history.changeAddCompare': 'añadir comparación',
  'history.changeRemoveCompare': 'quitar comparación',
  'history.changeCompare': 'cambio de comparación',
  'history.changeAddIndicator': 'añadir indicador',
  'history.changeRemoveIndicator': 'quitar indicador',
  'history.changeIndicator': 'cambio de indicador',
  'history.changeAddDrawing': 'añadir dibujo',
  'history.changeRemoveDrawing': 'quitar dibujo',
  'history.changeDrawing': 'cambio de dibujo',
}

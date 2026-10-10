import type { Translation } from '../runtime'
import type { history as source } from '../en/history'

export const history: Translation<typeof source> = {
  'history.undoNamed': 'Desfazer: {change}',
  'history.redoNamed': 'Refazer: {change}',
  'history.changeSymbol': 'troca de símbolo',
  'history.changeTimeframe': 'troca de tempo gráfico',
  'history.changeChartStyle': 'troca de estilo do gráfico',
  'history.changePriceScale': 'alteração da escala de preços',
  'history.changeSettings': 'alteração das configurações',
  'history.changeAddCompare': 'inclusão de comparação',
  'history.changeRemoveCompare': 'remoção de comparação',
  'history.changeCompare': 'alteração de comparação',
  'history.changeAddIndicator': 'inclusão de indicador',
  'history.changeRemoveIndicator': 'remoção de indicador',
  'history.changeIndicator': 'alteração de indicador',
  'history.changeMovePane': 'move pane',
  'history.changeAddDrawing': 'inclusão de desenho',
  'history.changeRemoveDrawing': 'remoção de desenho',
  'history.changeDrawing': 'alteração de desenho',
}

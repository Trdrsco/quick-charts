import type { Translation } from '../runtime'
import type { history as source } from '../en/history'

export const history: Translation<typeof source> = {
  'history.undoNamed': 'Отменить: {change}',
  'history.redoNamed': 'Повторить: {change}',
  'history.changeSymbol': 'смена инструмента',
  'history.changeTimeframe': 'смена таймфрейма',
  'history.changeChartStyle': 'смена стиля графика',
  'history.changePriceScale': 'изменение шкалы цен',
  'history.changeSettings': 'изменение настроек',
  'history.changeAddCompare': 'добавление сравнения',
  'history.changeRemoveCompare': 'удаление сравнения',
  'history.changeCompare': 'изменение сравнения',
  'history.changeAddIndicator': 'добавление индикатора',
  'history.changeRemoveIndicator': 'удаление индикатора',
  'history.changeIndicator': 'изменение индикатора',
  'history.changeAddDrawing': 'добавление рисунка',
  'history.changeRemoveDrawing': 'удаление рисунка',
  'history.changeDrawing': 'изменение рисунка',
}

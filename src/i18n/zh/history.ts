import type { Translation } from '../runtime'
import type { history as source } from '../en/history'

export const history: Translation<typeof source> = {
  'history.undoNamed': 'Undo {change}',
  'history.redoNamed': 'Redo {change}',
  'history.changeSymbol': 'symbol change',
  'history.changeTimeframe': 'timeframe change',
  'history.changeChartStyle': 'chart style change',
  'history.changePriceScale': 'price scale change',
  'history.changeSettings': 'settings change',
  'history.changeAddCompare': 'add comparison',
  'history.changeRemoveCompare': 'remove comparison',
  'history.changeCompare': 'comparison change',
  'history.changeAddIndicator': 'add indicator',
  'history.changeRemoveIndicator': 'remove indicator',
  'history.changeIndicator': 'indicator change',
  'history.changeAddDrawing': 'add drawing',
  'history.changeRemoveDrawing': 'remove drawing',
  'history.changeDrawing': 'drawing change',
}

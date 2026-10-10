import type { Translation } from '../runtime'
import type { history as source } from '../en/history'

export const history: Translation<typeof source> = {
  'history.undoNamed': 'Cofnij: {change}',
  'history.redoNamed': 'Ponów: {change}',
  'history.changeSymbol': 'zmiana symbolu',
  'history.changeTimeframe': 'zmiana interwału',
  'history.changeChartStyle': 'zmiana stylu wykresu',
  'history.changePriceScale': 'zmiana skali cen',
  'history.changeSettings': 'zmiana ustawień',
  'history.changeAddCompare': 'dodanie porównania',
  'history.changeRemoveCompare': 'usunięcie porównania',
  'history.changeCompare': 'zmiana porównania',
  'history.changeAddIndicator': 'dodanie wskaźnika',
  'history.changeRemoveIndicator': 'usunięcie wskaźnika',
  'history.changeIndicator': 'zmiana wskaźnika',
  'history.changeMovePane': 'przeniesienie panelu',
  'history.changeAddDrawing': 'dodanie rysunku',
  'history.changeRemoveDrawing': 'usunięcie rysunku',
  'history.changeDrawing': 'zmiana rysunku',
}

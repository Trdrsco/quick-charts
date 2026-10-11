import type { Translation } from '../runtime'
import type { history as source } from '../en/history'

export const history: Translation<typeof source> = {
  'history.undoNamed': 'ביטול: {change}',
  'history.redoNamed': 'ביצוע חוזר: {change}',
  'history.changeSymbol': 'שינוי סימבול',
  'history.changeTimeframe': 'שינוי טווח זמן',
  'history.changeChartStyle': 'שינוי סגנון הגרף',
  'history.changePriceScale': 'שינוי סולם המחיר',
  'history.changeSettings': 'שינוי הגדרות',
  'history.changeAddCompare': 'הוספת השוואה',
  'history.changeRemoveCompare': 'הסרת השוואה',
  'history.changeCompare': 'שינוי השוואה',
  'history.changeAddIndicator': 'הוספת אינדיקטור',
  'history.changeRemoveIndicator': 'הסרת אינדיקטור',
  'history.changeIndicator': 'שינוי אינדיקטור',
  'history.changeMovePane': 'הזזת חלונית',
  'history.changeAddDrawing': 'הוספת ציור',
  'history.changeRemoveDrawing': 'הסרת ציור',
  'history.changeDrawing': 'שינוי ציור',
}

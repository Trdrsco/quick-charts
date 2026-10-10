import type { Translation } from '../runtime'
import type { history as source } from '../en/history'

export const history: Translation<typeof source> = {
  'history.undoNamed': 'تراجع: {change}',
  'history.redoNamed': 'إعادة: {change}',
  'history.changeSymbol': 'تغيير الرمز',
  'history.changeTimeframe': 'تغيير الإطار الزمني',
  'history.changeChartStyle': 'تغيير نمط الرسم البياني',
  'history.changePriceScale': 'تغيير مقياس السعر',
  'history.changeSettings': 'تغيير الإعدادات',
  'history.changeAddCompare': 'إضافة مقارنة',
  'history.changeRemoveCompare': 'إزالة مقارنة',
  'history.changeCompare': 'تغيير المقارنة',
  'history.changeAddIndicator': 'إضافة مؤشر',
  'history.changeRemoveIndicator': 'حذف مؤشر',
  'history.changeIndicator': 'تغيير المؤشر',
  'history.changeMovePane': 'move pane',
  'history.changeAddDrawing': 'إضافة رسم',
  'history.changeRemoveDrawing': 'حذف رسم',
  'history.changeDrawing': 'تغيير الرسم',
}

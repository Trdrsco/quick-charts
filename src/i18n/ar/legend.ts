import type { Translation } from '../runtime'
import type { legend as source } from '../en/legend'

export const legend: Translation<typeof source> = {
  'legend.open': 'افتتاح',
  'legend.high': 'أعلى',
  'legend.low': 'أدنى',
  'legend.close': 'إغلاق',
  'legend.change': '{change} ({percent}%)',
  'legend.volume': 'الحجم',
  'legend.indicatorSettings': 'إعدادات المؤشر',
  'legend.showRows': 'إظهار صفوف المؤشرات',
  'legend.hideRows': 'إخفاء صفوف المؤشرات',
  'legend.restorePane': 'استعادة اللوحة',
  'legend.collapsePane': 'طي اللوحة',
  'legend.maximizePane': 'تكبير اللوحة',
  'legend.movePaneUp': 'Move pane up',
  'legend.movePaneDown': 'Move pane down',
  'legend.showIndicator': 'إظهار المؤشر',
  'legend.hideIndicator': 'إخفاء المؤشر',
  'legend.scaleNormal': 'عادي',
  'legend.scaleLog': 'لوغ',
  'legend.scalePercent': '%',
  'legend.scaleIndexed': '100',
  'legend.changeSymbol': 'تغيير الرمز',
  'legend.removeCompare': 'إزالة المقارنة',
  'legend.removeIndicator': 'حذف المؤشر',
}

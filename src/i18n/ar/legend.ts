import type { Translation } from '../runtime'
import type { legend as source } from '../en/legend'

export const legend: Translation<typeof source> = {
  'legend.indicatorSettings': 'إعدادات المؤشر',
  'legend.restorePane': 'استعادة اللوحة',
  'legend.collapsePane': 'طي اللوحة',
  'legend.maximizePane': 'تكبير اللوحة',
  'legend.showIndicator': 'إظهار المؤشر',
  'legend.hideIndicator': 'إخفاء المؤشر',
  'legend.priceScale': 'مقياس السعر: {mode}',
  'legend.scaleNormal': 'عادي',
  'legend.scaleLog': 'لوغ',
  'legend.scalePercent': '%',
  'legend.scaleIndexed': '100',
  'legend.compare': 'مقارنة أو إضافة رمز',
  'legend.changeSymbol': 'تغيير الرمز',
  'legend.removeCompare': 'إزالة المقارنة',
}

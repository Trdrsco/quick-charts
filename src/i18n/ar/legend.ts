import type { Translation } from '../runtime'
import type { legend as source } from '../en/legend'

export const legend: Translation<typeof source> = {
  'legend.open': 'O',
  'legend.high': 'H',
  'legend.low': 'L',
  'legend.close': 'C',
  'legend.change': '{change} ({percent}%)',
  'legend.indicatorSettings': 'إعدادات المؤشر',
  'legend.showRows': 'Show study rows',
  'legend.hideRows': 'Hide study rows',
  'legend.restorePane': 'استعادة اللوحة',
  'legend.collapsePane': 'طي اللوحة',
  'legend.maximizePane': 'تكبير اللوحة',
  'legend.showIndicator': 'إظهار المؤشر',
  'legend.hideIndicator': 'إخفاء المؤشر',
  'legend.scaleNormal': 'عادي',
  'legend.scaleLog': 'لوغ',
  'legend.scalePercent': '%',
  'legend.scaleIndexed': '100',
  'legend.changeSymbol': 'تغيير الرمز',
  'legend.removeCompare': 'إزالة المقارنة',
  'legend.removeIndicator': 'Remove indicator',
}

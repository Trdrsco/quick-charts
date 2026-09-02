import type { Translation } from '../runtime'
import type { range as source } from '../en/range'

export const range: Translation<typeof source> = {
  'range.oneDay': 'يوم واحد',
  'range.fiveDays': '5 أيام',
  'range.oneMonth': 'شهر واحد',
  'range.threeMonths': '3 أشهر',
  'range.sixMonths': '6 أشهر',
  'range.yearToDate': 'من بداية العام',
  'range.oneYear': 'سنة واحدة',
  'range.fiveYears': '5 سنوات',
  'range.all': 'كل البيانات',
  'range.tip': '{range} · أشرطة {interval}',
  'range.zoomIn': 'تكبير',
  'range.zoomOut': 'تصغير',
  'range.scrollLeft': 'التمرير يساراً',
  'range.scrollRight': 'التمرير يميناً',
  'range.reset': 'إعادة تعيين عرض الرسم البياني',
}

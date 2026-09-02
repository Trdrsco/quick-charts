import type { Translation } from '../runtime'
import type { range as source } from '../en/range'

export const range: Translation<typeof source> = {
  'range.oneDay': '1 יום',
  'range.fiveDays': '5 ימים',
  'range.oneMonth': '1 חודש',
  'range.threeMonths': '3 חודשים',
  'range.sixMonths': '6 חודשים',
  'range.yearToDate': 'מתחילת השנה',
  'range.oneYear': '1 שנה',
  'range.fiveYears': '5 שנים',
  'range.all': 'כל הנתונים',
  'range.tip': '{range} · נרות של {interval}',
  'range.zoomIn': 'זום פנימה',
  'range.zoomOut': 'זום החוצה',
  'range.scrollLeft': 'גלילה שמאלה',
  'range.scrollRight': 'גלילה ימינה',
  'range.reset': 'איפוס תצוגת הגרף',
}

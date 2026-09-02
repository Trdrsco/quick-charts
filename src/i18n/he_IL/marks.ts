import type { Translation } from '../runtime'
import type { marks as source } from '../en/marks'

export const marks: Translation<typeof source> = {
  'marks.buy': 'קנייה',
  'marks.sell': 'מכירה',
  'marks.avgPrice': '{qty} @ {price} מחיר ממוצע',
  'marks.trades': 'עסקאות',
}

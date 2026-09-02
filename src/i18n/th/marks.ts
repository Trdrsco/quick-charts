import type { Translation } from '../runtime'
import type { marks as source } from '../en/marks'

export const marks: Translation<typeof source> = {
  'marks.buy': 'ซื้อ',
  'marks.sell': 'ขาย',
  'marks.avgPrice': '{qty} @ {price} ราคาเฉลี่ย',
  'marks.trades': 'การเทรด',
}

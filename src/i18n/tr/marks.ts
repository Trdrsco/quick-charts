import type { Translation } from '../runtime'
import type { marks as source } from '../en/marks'

export const marks: Translation<typeof source> = {
  'marks.buy': 'Al',
  'marks.sell': 'Sat',
  'marks.avgPrice': '{qty} @ {price} ortalama fiyat',
  'marks.trades': 'İŞLEMLER',
}

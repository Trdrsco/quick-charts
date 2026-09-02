import type { Translation } from '../runtime'
import type { marks as source } from '../en/marks'

export const marks: Translation<typeof source> = {
  'marks.buy': 'شراء',
  'marks.sell': 'بيع',
  'marks.avgPrice': '{qty} بسعر متوسط {price}',
  'marks.trades': 'الصفقات',
}

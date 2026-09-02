import type { Translation } from '../runtime'
import type { marks as source } from '../en/marks'

export const marks: Translation<typeof source> = {
  'marks.buy': 'Покупка',
  'marks.sell': 'Продажа',
  'marks.avgPrice': '{qty} по средней цене {price}',
  'marks.trades': 'СДЕЛКИ',
}

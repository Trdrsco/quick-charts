import type { Translation } from '../runtime'
import type { marks as source } from '../en/marks'

export const marks: Translation<typeof source> = {
  'marks.buy': 'Acquisto',
  'marks.sell': 'Vendita',
  'marks.avgPrice': '{qty} @ {price} prezzo medio',
  'marks.trades': 'OPERAZIONI',
}

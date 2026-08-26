import type { Translation } from '@trdrs/i18n'
import type { marks as source } from '../en/marks'

export const marks: Translation<typeof source> = {
  'marks.buy': 'Buy',
  'marks.sell': 'Sell',
  'marks.avgPrice': '{qty} @ {price} avg price',
  'marks.trades': 'TRADES',
}

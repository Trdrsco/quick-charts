import type { Translation } from '@trdrs/i18n'
import type { marks as source } from '../en/marks'

export const marks: Translation<typeof source> = {
  'marks.buy': 'Köp',
  'marks.sell': 'Sälj',
  'marks.avgPrice': '{qty} @ {price} snittpris',
  'marks.trades': 'AFFÄRER',
}

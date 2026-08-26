import type { Translation } from '@trdrs/i18n'
import type { marks as source } from '../en/marks'

export const marks: Translation<typeof source> = {
  'marks.buy': 'Kup',
  'marks.sell': 'Sprzedaj',
  'marks.avgPrice': '{qty} @ {price} cena średnia',
  'marks.trades': 'TRANSAKCJE',
}

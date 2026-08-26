import type { Translation } from '@trdrs/i18n'
import type { marks as source } from '../en/marks'

export const marks: Translation<typeof source> = {
  'marks.buy': 'Kauf',
  'marks.sell': 'Verkauf',
  'marks.avgPrice': '{qty} @ {price} Durchschnittspreis',
  'marks.trades': 'TRADES',
}

import type { Translation } from '@trdrs/i18n'
import type { marks as source } from '../en/marks'

export const marks: Translation<typeof source> = {
  'marks.buy': 'Achat',
  'marks.sell': 'Vente',
  'marks.avgPrice': '{qty} à {price} en moyenne',
  'marks.trades': 'TRANSACTIONS',
}

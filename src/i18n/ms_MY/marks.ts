import type { Translation } from '@trdrs/i18n'
import type { marks as source } from '../en/marks'

export const marks: Translation<typeof source> = {
  'marks.buy': 'Beli',
  'marks.sell': 'Jual',
  'marks.avgPrice': '{qty} @ {price} harga purata',
  'marks.trades': 'DAGANGAN',
}

import type { Translation } from '../runtime'
import type { marks as source } from '../en/marks'

export const marks: Translation<typeof source> = {
  'marks.buy': 'Beli',
  'marks.sell': 'Jual',
  'marks.avgPrice': '{qty} @ {price} harga rata-rata',
  'marks.trades': 'TRANSAKSI',
}

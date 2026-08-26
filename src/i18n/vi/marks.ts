import type { Translation } from '@trdrs/i18n'
import type { marks as source } from '../en/marks'

export const marks: Translation<typeof source> = {
  'marks.buy': 'Mua',
  'marks.sell': 'Bán',
  'marks.avgPrice': '{qty} @ {price} giá trung bình',
  'marks.trades': 'GIAO DỊCH',
}

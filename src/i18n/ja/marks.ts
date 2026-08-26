import type { Translation } from '@trdrs/i18n'
import type { marks as source } from '../en/marks'

export const marks: Translation<typeof source> = {
  'marks.buy': '買い',
  'marks.sell': '売り',
  'marks.avgPrice': '{qty} @ {price} 平均約定価格',
  'marks.trades': '取引',
}

import type { Translation } from '@trdrs/i18n'
import type { marks as source } from '../en/marks'

export const marks: Translation<typeof source> = {
  'marks.buy': '買進',
  'marks.sell': '賣出',
  'marks.avgPrice': '{qty}口，均價{price}',
  'marks.trades': '成交',
}

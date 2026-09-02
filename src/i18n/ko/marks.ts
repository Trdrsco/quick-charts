import type { Translation } from '../runtime'
import type { marks as source } from '../en/marks'

export const marks: Translation<typeof source> = {
  'marks.buy': '매수',
  'marks.sell': '매도',
  'marks.avgPrice': '{qty} @ {price} 평균가',
  'marks.trades': '체결',
}

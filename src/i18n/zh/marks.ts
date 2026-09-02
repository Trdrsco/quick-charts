import type { Translation } from '../runtime'
import type { marks as source } from '../en/marks'

export const marks: Translation<typeof source> = {
  'marks.buy': '买入',
  'marks.sell': '卖出',
  'marks.avgPrice': '{qty}，均价{price}',
  'marks.trades': '成交',
}

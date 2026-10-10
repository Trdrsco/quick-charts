import type { Translation } from '../runtime'
import type { timezone as source } from '../en/timezone'

export const timezone: Translation<typeof source> = {
  'timezone.title': '图表时区',
  'timezone.exchange': '交易所',
  'timezone.quarter': '第{quarter}季度',
}

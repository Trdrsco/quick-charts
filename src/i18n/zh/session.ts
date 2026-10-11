import type { Translation } from '../runtime'
import type { session as source } from '../en/session'

export const session: Translation<typeof source> = {
  'session.pre': '盘前',
  'session.open': '盘中',
  'session.extended': '延长交易时段',
  'session.after': '盘后',
  'session.closed': '已收盘',
}

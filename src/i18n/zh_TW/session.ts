import type { Translation } from '../runtime'
import type { session as source } from '../en/session'

export const session: Translation<typeof source> = {
  'session.pre': '盤前',
  'session.open': '盤中',
  'session.extended': 'Extended hours',
  'session.after': '盤後',
  'session.closed': '休市',
}

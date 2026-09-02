import type { Translation } from '../runtime'
import type { session as source } from '../en/session'

export const session: Translation<typeof source> = {
  'session.pre': 'מסחר מקדים',
  'session.open': 'השוק פתוח',
  'session.extended': 'Extended hours',
  'session.after': 'מסחר מאוחר',
  'session.closed': 'השוק סגור',
}

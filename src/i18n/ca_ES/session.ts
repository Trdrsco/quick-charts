import type { Translation } from '../runtime'
import type { session as source } from '../en/session'

export const session: Translation<typeof source> = {
  'session.pre': 'Preobertura',
  'session.open': 'Mercat obert',
  'session.eth': 'Horari electrònic',
  'session.after': 'Postmercat',
  'session.closed': 'Mercat tancat',
}

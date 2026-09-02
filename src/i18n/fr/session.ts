import type { Translation } from '../runtime'
import type { session as source } from '../en/session'

export const session: Translation<typeof source> = {
  'session.pre': 'Préouverture',
  'session.open': 'Marché ouvert',
  'session.extended': 'Extended hours',
  'session.after': 'Après clôture',
  'session.closed': 'Marché fermé',
}

import type { Translation } from '../runtime'
import type { session as source } from '../en/session'

export const session: Translation<typeof source> = {
  'session.pre': 'Préouverture',
  'session.open': 'Marché ouvert',
  'session.extended': 'Heures étendues',
  'session.after': 'Après clôture',
  'session.closed': 'Marché fermé',
}

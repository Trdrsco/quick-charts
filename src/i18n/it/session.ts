import type { Translation } from '../runtime'
import type { session as source } from '../en/session'

export const session: Translation<typeof source> = {
  'session.pre': 'Pre-mercato',
  'session.open': 'Mercato aperto',
  'session.extended': 'Extended hours',
  'session.after': 'Dopo-borsa',
  'session.closed': 'Mercato chiuso',
}

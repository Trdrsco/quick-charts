import type { Translation } from '../runtime'
import type { session as source } from '../en/session'

export const session: Translation<typeof source> = {
  'session.pre': 'Vorbörse',
  'session.open': 'Markt geöffnet',
  'session.extended': 'Extended hours',
  'session.after': 'Nachbörse',
  'session.closed': 'Markt geschlossen',
}

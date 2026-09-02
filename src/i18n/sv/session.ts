import type { Translation } from '../runtime'
import type { session as source } from '../en/session'

export const session: Translation<typeof source> = {
  'session.pre': 'Före öppning',
  'session.open': 'Marknaden öppen',
  'session.extended': 'Extended hours',
  'session.after': 'Efter stängning',
  'session.closed': 'Marknaden stängd',
}

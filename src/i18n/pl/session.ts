import type { Translation } from '../runtime'
import type { session as source } from '../en/session'

export const session: Translation<typeof source> = {
  'session.pre': 'Przed otwarciem',
  'session.open': 'Rynek otwarty',
  'session.eth': 'Godziny elektroniczne',
  'session.after': 'Po zamknięciu',
  'session.closed': 'Rynek zamknięty',
}

import type { Translation } from '@trdrs/i18n'
import type { session as source } from '../en/session'

export const session: Translation<typeof source> = {
  'session.pre': 'Préouverture',
  'session.open': 'Marché ouvert',
  'session.eth': 'Séance électronique',
  'session.after': 'Après clôture',
  'session.closed': 'Marché fermé',
}

import type { Translation } from '@trdrs/i18n'
import type { session as source } from '../en/session'

export const session: Translation<typeof source> = {
  'session.pre': 'Vorbörse',
  'session.open': 'Markt geöffnet',
  'session.eth': 'Elektronischer Handel',
  'session.after': 'Nachbörse',
  'session.closed': 'Markt geschlossen',
}

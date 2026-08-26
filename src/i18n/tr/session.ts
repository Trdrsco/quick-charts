import type { Translation } from '@trdrs/i18n'
import type { session as source } from '../en/session'

export const session: Translation<typeof source> = {
  'session.pre': 'Açılış öncesi',
  'session.open': 'Piyasa açık',
  'session.eth': 'Elektronik seans',
  'session.after': 'Kapanış sonrası',
  'session.closed': 'Piyasa kapalı',
}

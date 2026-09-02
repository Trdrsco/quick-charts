import type { Translation } from '../runtime'
import type { session as source } from '../en/session'

export const session: Translation<typeof source> = {
  'session.pre': 'Açılış öncesi',
  'session.open': 'Piyasa açık',
  'session.extended': 'Extended hours',
  'session.after': 'Kapanış sonrası',
  'session.closed': 'Piyasa kapalı',
}

import type { Translation } from '../runtime'
import type { session as source } from '../en/session'

export const session: Translation<typeof source> = {
  'session.pre': 'Preapertura',
  'session.open': 'Mercado abierto',
  'session.eth': 'Horario electrónico',
  'session.after': 'After hours',
  'session.closed': 'Mercado cerrado',
}

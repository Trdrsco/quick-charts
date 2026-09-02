import type { Translation } from '../runtime'
import type { session as source } from '../en/session'

export const session: Translation<typeof source> = {
  'session.pre': 'Pré-mercado',
  'session.open': 'Mercado aberto',
  'session.extended': 'Extended hours',
  'session.after': 'Após o fechamento',
  'session.closed': 'Mercado fechado',
}

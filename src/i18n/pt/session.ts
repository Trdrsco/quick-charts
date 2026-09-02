import type { Translation } from '../runtime'
import type { session as source } from '../en/session'

export const session: Translation<typeof source> = {
  'session.pre': 'Pré-mercado',
  'session.open': 'Mercado aberto',
  'session.eth': 'Horário eletrônico',
  'session.after': 'Após o fechamento',
  'session.closed': 'Mercado fechado',
}

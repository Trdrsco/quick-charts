import type { Translation } from '../runtime'
import type { session as source } from '../en/session'

export const session: Translation<typeof source> = {
  'session.pre': 'Предторговая сессия',
  'session.open': 'Рынок открыт',
  'session.extended': 'Расширенная сессия',
  'session.after': 'Постторговая сессия',
  'session.closed': 'Рынок закрыт',
}

import type { Translation } from '@trdrs/i18n'
import type { session as source } from '../en/session'

export const session: Translation<typeof source> = {
  'session.pre': 'Предторговая сессия',
  'session.open': 'Рынок открыт',
  'session.eth': 'Электронная сессия',
  'session.after': 'Постторговая сессия',
  'session.closed': 'Рынок закрыт',
}

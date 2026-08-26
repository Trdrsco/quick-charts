import type { Translation } from '@trdrs/i18n'
import type { session as source } from '../en/session'

export const session: Translation<typeof source> = {
  'session.pre': '盤前',
  'session.open': '盤中',
  'session.eth': '電子盤時段',
  'session.after': '盤後',
  'session.closed': '休市',
}

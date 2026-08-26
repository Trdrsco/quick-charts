import type { Translation } from '@trdrs/i18n'
import type { session as source } from '../en/session'

export const session: Translation<typeof source> = {
  'session.pre': '盘前',
  'session.open': '盘中',
  'session.eth': '电子盘',
  'session.after': '盘后',
  'session.closed': '已收盘',
}

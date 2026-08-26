import type { Translation } from '@trdrs/i18n'
import type { session as source } from '../en/session'

export const session: Translation<typeof source> = {
  'session.pre': 'Pre-market',
  'session.open': 'Market open',
  'session.eth': 'Electronic hours',
  'session.after': 'After-hours',
  'session.closed': 'Market closed',
}

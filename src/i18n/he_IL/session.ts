import type { Translation } from '@trdrs/i18n'
import type { session as source } from '../en/session'

export const session: Translation<typeof source> = {
  'session.pre': 'מסחר מקדים',
  'session.open': 'השוק פתוח',
  'session.eth': 'שעות מסחר אלקטרוני',
  'session.after': 'מסחר מאוחר',
  'session.closed': 'השוק סגור',
}

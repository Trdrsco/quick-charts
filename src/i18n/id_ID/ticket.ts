import type { Translation } from '@trdrs/i18n'
import type { ticket as source } from '../en/ticket'

export const ticket: Translation<typeof source> = {
  'ticket.typeMarket': 'Market',
  'ticket.typeLimit': 'Limit',
  'ticket.typeStop': 'Stop',
  'ticket.typeStopLimit': 'Stop Limit',
  'ticket.noAccount': 'No account armed — connect an account to place orders.',
  'ticket.locked': 'Trading is locked for this account.',
  'ticket.needsPrice': 'The order needs a price.',
  'ticket.cannotPlace': 'This integration does not place orders.',
  'ticket.placedBuy': 'Buy {qty} {type} placed',
  'ticket.placedSell': 'Sell {qty} {type} placed',
}

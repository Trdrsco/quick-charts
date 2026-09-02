import type { Translation } from '../runtime'
import type { ticket as source } from '../en/ticket'

export const ticket: Translation<typeof source> = {
  'ticket.typeMarket': 'Markt',
  'ticket.typeLimit': 'Limit',
  'ticket.typeStop': 'Stop',
  'ticket.typeStopLimit': 'Stop-Limit',
  'ticket.noAccount': 'Kein Konto aktiviert — verbinde ein Konto, um Orders aufzugeben.',
  'ticket.locked': 'Der Handel ist für dieses Konto gesperrt.',
  'ticket.needsPrice': 'Die Order braucht einen Preis.',
  'ticket.cannotPlace': 'Diese Integration gibt keine Orders auf.',
  'ticket.placedBuy': 'Kauf {qty} {type} aufgegeben',
  'ticket.placedSell': 'Verkauf {qty} {type} aufgegeben',
}

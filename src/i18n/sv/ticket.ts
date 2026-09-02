import type { Translation } from '../runtime'
import type { ticket as source } from '../en/ticket'

export const ticket: Translation<typeof source> = {
  'ticket.typeMarket': 'Marknad',
  'ticket.typeLimit': 'Limit',
  'ticket.typeStop': 'Stopp',
  'ticket.typeStopLimit': 'Stopplimit',
  'ticket.noAccount': 'Inget konto aktiverat — anslut ett konto för att lägga order.',
  'ticket.locked': 'Handeln är låst för detta konto.',
  'ticket.needsPrice': 'Ordern behöver ett pris.',
  'ticket.cannotPlace': 'Den här integrationen lägger inte order.',
  'ticket.placedBuy': 'Köp {qty} {type} lagd',
  'ticket.placedSell': 'Sälj {qty} {type} lagd',
}

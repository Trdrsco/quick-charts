import type { Translation } from '@trdrs/i18n'
import type { ticket as source } from '../en/ticket'

export const ticket: Translation<typeof source> = {
  'ticket.typeMarket': 'Market',
  'ticket.typeLimit': 'Limit',
  'ticket.typeStop': 'Stop',
  'ticket.typeStopLimit': 'Stop limit',
  'ticket.noAccount': 'Nessun conto attivo — collega un conto per inviare ordini.',
  'ticket.locked': 'Il trading è bloccato per questo conto.',
  'ticket.needsPrice': 'L\'ordine richiede un prezzo.',
  'ticket.cannotPlace': 'Questa integrazione non invia ordini.',
  'ticket.placedBuy': 'Acquisto di {qty} {type} inviato',
  'ticket.placedSell': 'Vendita di {qty} {type} inviata',
}

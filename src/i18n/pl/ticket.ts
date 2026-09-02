import type { Translation } from '../runtime'
import type { ticket as source } from '../en/ticket'

export const ticket: Translation<typeof source> = {
  'ticket.typeMarket': 'Rynkowe',
  'ticket.typeLimit': 'Limit',
  'ticket.typeStop': 'Stop',
  'ticket.typeStopLimit': 'Stop limit',
  'ticket.noAccount': 'Brak uzbrojonego konta — połącz konto, aby składać zlecenia.',
  'ticket.locked': 'Handel na tym koncie jest zablokowany.',
  'ticket.needsPrice': 'Zlecenie wymaga ceny.',
  'ticket.cannotPlace': 'Ta integracja nie składa zleceń.',
  'ticket.placedBuy': 'Złożono kupno {qty} {type}',
  'ticket.placedSell': 'Złożono sprzedaż {qty} {type}',
}

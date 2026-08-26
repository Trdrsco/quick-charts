import type { Translation } from '@trdrs/i18n'
import type { ticket as source } from '../en/ticket'

export const ticket: Translation<typeof source> = {
  'ticket.typeMarket': 'Mercat',
  'ticket.typeLimit': 'Límit',
  'ticket.typeStop': 'Stop',
  'ticket.typeStopLimit': 'Stop límit',
  'ticket.noAccount': 'Cap compte armat — connecta un compte per enviar ordres.',
  'ticket.locked': 'El trading està blocat per a aquest compte.',
  'ticket.needsPrice': 'L’ordre necessita un preu.',
  'ticket.cannotPlace': 'Aquesta integració no envia ordres.',
  'ticket.placedBuy': 'Compra de {qty} {type} enviada',
  'ticket.placedSell': 'Venda de {qty} {type} enviada',
}

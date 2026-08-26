import type { Translation } from '@trdrs/i18n'
import type { ticket as source } from '../en/ticket'

export const ticket: Translation<typeof source> = {
  'ticket.typeMarket': 'Mercado',
  'ticket.typeLimit': 'Limite',
  'ticket.typeStop': 'Stop',
  'ticket.typeStopLimit': 'Stop limite',
  'ticket.noAccount': 'Nenhuma conta armada — conecte uma conta para enviar ordens.',
  'ticket.locked': 'A negociação está bloqueada para esta conta.',
  'ticket.needsPrice': 'A ordem precisa de um preço.',
  'ticket.cannotPlace': 'Esta integração não envia ordens.',
  'ticket.placedBuy': 'Compra de {qty} {type} enviada',
  'ticket.placedSell': 'Venda de {qty} {type} enviada',
}

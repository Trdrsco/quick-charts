import type { Translation } from '../runtime'
import type { ticket as source } from '../en/ticket'

export const ticket: Translation<typeof source> = {
  'ticket.typeMarket': 'Mercado',
  'ticket.typeLimit': 'Límite',
  'ticket.typeStop': 'Stop',
  'ticket.typeStopLimit': 'Stop límite',
  'ticket.noAccount': 'No hay ninguna cuenta armada: conecta una cuenta para enviar órdenes.',
  'ticket.locked': 'El trading está bloqueado para esta cuenta.',
  'ticket.needsPrice': 'La orden necesita un precio.',
  'ticket.cannotPlace': 'Esta integración no envía órdenes.',
  'ticket.placedBuy': 'Compra de {qty} {type} enviada',
  'ticket.placedSell': 'Venta de {qty} {type} enviada',
}

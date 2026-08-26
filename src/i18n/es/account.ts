import type { Translation } from '@trdrs/i18n'
import type { account as source } from '../en/account'

export const account: Translation<typeof source> = {
  'account.positions': 'Posiciones',
  'account.orders': 'Órdenes',
  'account.positionsCount': 'Posiciones ({count})',
  'account.ordersCount': 'Órdenes ({count})',
  'account.noPositions': 'No hay posiciones abiertas',
  'account.noOrders': 'No hay órdenes activas',
  'account.long': 'Largo {qty}',
  'account.short': 'Corto {qty}',
  'account.close': 'Cerrar',
  'account.closeTitle': 'Cerrar {instrument} a mercado',
  'account.reverse': 'Invertir',
  'account.reverseTitle': 'Invertir {instrument}',
  'account.reversed': { one: '{instrument} invertido ({count} orden cancelada)', many: '{instrument} invertido ({count} órdenes canceladas)', other: '{instrument} invertido ({count} órdenes canceladas)' },
  'account.buy': 'Comprar {qty} {type}',
  'account.sell': 'Vender {qty} {type}',
  'account.cancel': 'Cancelar',
  'account.cancelTitle': 'Cancelar {id}',
}

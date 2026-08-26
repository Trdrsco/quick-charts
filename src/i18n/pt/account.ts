import type { Translation } from '@trdrs/i18n'
import type { account as source } from '../en/account'

export const account: Translation<typeof source> = {
  'account.positions': 'Posições',
  'account.orders': 'Ordens',
  'account.positionsCount': 'Posições ({count})',
  'account.ordersCount': 'Ordens ({count})',
  'account.noPositions': 'Nenhuma posição aberta',
  'account.noOrders': 'Nenhuma ordem ativa',
  'account.long': 'Comprado {qty}',
  'account.short': 'Vendido {qty}',
  'account.close': 'Fechar',
  'account.closeTitle': 'Fechar {instrument} a mercado',
  'account.reverse': 'Inverter',
  'account.reverseTitle': 'Inverter {instrument}',
  'account.reversed': { one: '{instrument} invertido ({count} ordem cancelada)', many: '{instrument} invertido ({count} ordens canceladas)', other: '{instrument} invertido ({count} ordens canceladas)' },
  'account.buy': 'Comprar {qty} {type}',
  'account.sell': 'Vender {qty} {type}',
  'account.cancel': 'Cancelar',
  'account.cancelTitle': 'Cancelar {id}',
}

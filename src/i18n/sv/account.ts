import type { Translation } from '@trdrs/i18n'
import type { account as source } from '../en/account'

export const account: Translation<typeof source> = {
  'account.positions': 'Positioner',
  'account.orders': 'Ordrar',
  'account.positionsCount': 'Positioner ({count})',
  'account.ordersCount': 'Ordrar ({count})',
  'account.noPositions': 'Inga öppna positioner',
  'account.noOrders': 'Inga aktiva ordrar',
  'account.long': 'Lång {qty}',
  'account.short': 'Kort {qty}',
  'account.close': 'Stäng',
  'account.closeTitle': 'Stäng {instrument} till marknadspris',
  'account.reverse': 'Vänd',
  'account.reverseTitle': 'Vänd {instrument}',
  'account.reversed': {
    one: 'Vände {instrument} ({count} order avbruten)',
    other: 'Vände {instrument} ({count} ordrar avbrutna)',
  },
  'account.buy': 'Köp {qty} {type}',
  'account.sell': 'Sälj {qty} {type}',
  'account.cancel': 'Avbryt',
  'account.cancelTitle': 'Avbryt {id}',
}

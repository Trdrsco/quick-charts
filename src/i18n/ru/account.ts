import type { Translation } from '@trdrs/i18n'
import type { account as source } from '../en/account'

export const account: Translation<typeof source> = {
  'account.positions': 'Позиции',
  'account.orders': 'Ордера',
  'account.positionsCount': 'Позиции ({count})',
  'account.ordersCount': 'Ордера ({count})',
  'account.noPositions': 'Открытых позиций нет',
  'account.noOrders': 'Активных ордеров нет',
  'account.long': 'Лонг {qty}',
  'account.short': 'Шорт {qty}',
  'account.close': 'Закрыть',
  'account.closeTitle': 'Закрыть {instrument} по рынку',
  'account.reverse': 'Перевернуть',
  'account.reverseTitle': 'Перевернуть {instrument}',
  'account.reversed': { one: '{instrument} перевернут ({count} ордер отменен)', few: '{instrument} перевернут ({count} ордера отменено)', many: '{instrument} перевернут ({count} ордеров отменено)', other: '{instrument} перевернут ({count} ордера отменено)' },
  'account.buy': 'Купить {qty} {type}',
  'account.sell': 'Продать {qty} {type}',
  'account.cancel': 'Отменить',
  'account.cancelTitle': 'Отменить {id}',
}

import type { Translation } from '@trdrs/i18n'
import type { account as source } from '../en/account'

export const account: Translation<typeof source> = {
  'account.positions': '持仓',
  'account.orders': '订单',
  'account.positionsCount': '持仓（{count}）',
  'account.ordersCount': '订单（{count}）',
  'account.noPositions': '无持仓',
  'account.noOrders': '无挂单',
  'account.long': '多头{qty}',
  'account.short': '空头{qty}',
  'account.close': '平仓',
  'account.closeTitle': '以市价平掉{instrument}',
  'account.reverse': '反手',
  'account.reverseTitle': '反手{instrument}',
  'account.reversed': { other: '已反手{instrument}（撤销{count}笔订单）' },
  'account.buy': '{type}买入{qty}',
  'account.sell': '{type}卖出{qty}',
  'account.cancel': '撤单',
  'account.cancelTitle': '撤销{id}',
}

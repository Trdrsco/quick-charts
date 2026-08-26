import type { Translation } from '@trdrs/i18n'
import type { account as source } from '../en/account'

export const account: Translation<typeof source> = {
  'account.positions': '部位',
  'account.orders': '訂單',
  'account.positionsCount': '部位（{count}）',
  'account.ordersCount': '訂單（{count}）',
  'account.noPositions': '沒有未平倉部位',
  'account.noOrders': '沒有掛單中的訂單',
  'account.long': '多{qty}',
  'account.short': '空{qty}',
  'account.close': '平倉',
  'account.closeTitle': '以市價平倉{instrument}',
  'account.reverse': '反手',
  'account.reverseTitle': '反手{instrument}',
  'account.reversed': { other: '已反手{instrument}（取消{count}筆訂單）' },
  'account.buy': '買進{qty}{type}',
  'account.sell': '賣出{qty}{type}',
  'account.cancel': '取消',
  'account.cancelTitle': '取消{id}',
}

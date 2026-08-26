import type { Translation } from '@trdrs/i18n'
import type { account as source } from '../en/account'

export const account: Translation<typeof source> = {
  'account.positions': 'ポジション',
  'account.orders': '注文',
  'account.positionsCount': 'ポジション（{count}）',
  'account.ordersCount': '注文（{count}）',
  'account.noPositions': '保有ポジションなし',
  'account.noOrders': '有効な注文なし',
  'account.long': 'ロング{qty}',
  'account.short': 'ショート{qty}',
  'account.close': '決済',
  'account.closeTitle': '{instrument}を成行で決済',
  'account.reverse': '反転',
  'account.reverseTitle': '{instrument}を反転',
  'account.reversed': { other: '{instrument}を反転しました（注文{count}件をキャンセル）' },
  'account.buy': '{qty}を{type}で買い',
  'account.sell': '{qty}を{type}で売り',
  'account.cancel': 'キャンセル',
  'account.cancelTitle': '{id}をキャンセル',
}

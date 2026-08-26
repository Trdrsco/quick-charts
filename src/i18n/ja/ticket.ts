import type { Translation } from '@trdrs/i18n'
import type { ticket as source } from '../en/ticket'

export const ticket: Translation<typeof source> = {
  'ticket.typeMarket': '成行',
  'ticket.typeLimit': '指値',
  'ticket.typeStop': '逆指値',
  'ticket.typeStopLimit': '逆指値付き指値',
  'ticket.noAccount': '有効なアカウントがありません。注文するにはアカウントを接続してください。',
  'ticket.locked': 'このアカウントの取引はロックされています。',
  'ticket.needsPrice': 'この注文には価格が必要です。',
  'ticket.cannotPlace': 'この連携では注文できません。',
  'ticket.placedBuy': '{qty}を{type}で買い注文しました',
  'ticket.placedSell': '{qty}を{type}で売り注文しました',
}

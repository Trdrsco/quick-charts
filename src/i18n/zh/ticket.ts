import type { Translation } from '@trdrs/i18n'
import type { ticket as source } from '../en/ticket'

export const ticket: Translation<typeof source> = {
  'ticket.typeMarket': '市价',
  'ticket.typeLimit': '限价',
  'ticket.typeStop': '止损',
  'ticket.typeStopLimit': '止损限价',
  'ticket.noAccount': '未选定账户 — 请先连接账户再下单。',
  'ticket.locked': '该账户的交易已锁定。',
  'ticket.needsPrice': '该订单需要填写价格。',
  'ticket.cannotPlace': '此集成不支持下单。',
  'ticket.placedBuy': '{type}买入{qty}已提交',
  'ticket.placedSell': '{type}卖出{qty}已提交',
}

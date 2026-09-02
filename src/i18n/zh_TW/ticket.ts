import type { Translation } from '../runtime'
import type { ticket as source } from '../en/ticket'

export const ticket: Translation<typeof source> = {
  'ticket.typeMarket': '市價',
  'ticket.typeLimit': '限價',
  'ticket.typeStop': '停損',
  'ticket.typeStopLimit': '停損限價',
  'ticket.noAccount': '尚未選定帳戶——請連接帳戶後再下單。',
  'ticket.locked': '此帳戶的交易已鎖定。',
  'ticket.needsPrice': '此訂單需要價格。',
  'ticket.cannotPlace': '此整合不支援下單。',
  'ticket.placedBuy': '{type}買進{qty}已送出',
  'ticket.placedSell': '{type}賣出{qty}已送出',
}

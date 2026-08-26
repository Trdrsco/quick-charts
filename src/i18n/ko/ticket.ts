import type { Translation } from '@trdrs/i18n'
import type { ticket as source } from '../en/ticket'

export const ticket: Translation<typeof source> = {
  'ticket.typeMarket': '시장가',
  'ticket.typeLimit': '지정가',
  'ticket.typeStop': '스톱',
  'ticket.typeStopLimit': '스톱 지정가',
  'ticket.noAccount': '활성화된 계정이 없습니다 — 주문하려면 계정을 연결하세요.',
  'ticket.locked': '이 계정은 거래가 잠겨 있습니다.',
  'ticket.needsPrice': '주문에 가격이 필요합니다.',
  'ticket.cannotPlace': '이 연동은 주문을 지원하지 않습니다.',
  'ticket.placedBuy': '매수 {qty} {type} 주문 완료',
  'ticket.placedSell': '매도 {qty} {type} 주문 완료',
}

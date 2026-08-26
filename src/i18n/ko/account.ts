import type { Translation } from '@trdrs/i18n'
import type { account as source } from '../en/account'

export const account: Translation<typeof source> = {
  'account.positions': '포지션',
  'account.orders': '주문',
  'account.positionsCount': '포지션 ({count})',
  'account.ordersCount': '주문 ({count})',
  'account.noPositions': '보유 포지션 없음',
  'account.noOrders': '미체결 주문 없음',
  'account.long': '롱 {qty}',
  'account.short': '숏 {qty}',
  'account.close': '청산',
  'account.closeTitle': '{instrument} 시장가 청산',
  'account.reverse': '반전',
  'account.reverseTitle': '{instrument} 포지션 반전',
  'account.reversed': { other: '{instrument} 포지션 반전 (주문 {count}개 취소됨)' },
  'account.buy': '매수 {qty} {type}',
  'account.sell': '매도 {qty} {type}',
  'account.cancel': '취소',
  'account.cancelTitle': '{id} 취소',
}

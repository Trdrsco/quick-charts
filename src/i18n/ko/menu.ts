import type { Translation } from '@trdrs/i18n'
import type { menu as source } from '../en/menu'

export const menu: Translation<typeof source> = {
  'menu.resetView': '차트 보기 초기화',
  'menu.copyPrice': '가격 {price} 복사',
  'menu.paste': '붙여넣기',
  'menu.addAlert': '{symbol} {price}에 알림 추가…',
  'menu.addOrder': '{symbol} {price}에 주문 추가…',
  'menu.sellLimit': '{at} 지정가 매도',
  'menu.buyStop': '{at} 스톱 매수',
  'menu.buyLimit': '{at} 지정가 매수',
  'menu.sellStop': '{at} 스톱 매도',
  'menu.removeIndicators': { other: '지표 {count}개 제거' },
  'menu.removeDrawings': { other: '그리기 {count}개 제거' },
  'menu.hideMarks': '바에 표시 숨기기',
  'menu.settings': '설정…',
}

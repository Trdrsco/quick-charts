import type { Translation } from '../runtime'
import type { menu as source } from '../en/menu'

export const menu: Translation<typeof source> = {
  'menu.resetView': '차트 보기 초기화',
  'menu.copyPrice': '가격 {price} 복사',
  'menu.paste': '붙여넣기',
  'menu.addAlert': '{symbol} {price}에 알림 추가…',
  'menu.removeIndicators': { other: '지표 {count}개 제거' },
  'menu.removeDrawings': { other: '그리기 {count}개 제거' },
  'menu.settings': '설정…',
}

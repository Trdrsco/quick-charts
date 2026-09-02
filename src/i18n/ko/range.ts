import type { Translation } from '../runtime'
import type { range as source } from '../en/range'

export const range: Translation<typeof source> = {
  'range.oneDay': '1일',
  'range.fiveDays': '5일',
  'range.oneMonth': '1개월',
  'range.threeMonths': '3개월',
  'range.sixMonths': '6개월',
  'range.yearToDate': '연초 이후',
  'range.oneYear': '1년',
  'range.fiveYears': '5년',
  'range.all': '전체 데이터',
  'range.tip': '{range} · {interval} 바',
  'range.zoomIn': '확대',
  'range.zoomOut': '축소',
  'range.scrollLeft': '왼쪽으로 이동',
  'range.scrollRight': '오른쪽으로 이동',
  'range.reset': '차트 보기 초기화',
}

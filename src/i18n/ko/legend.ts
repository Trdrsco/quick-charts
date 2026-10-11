import type { Translation } from '../runtime'
import type { legend as source } from '../en/legend'

export const legend: Translation<typeof source> = {
  'legend.open': '시',
  'legend.high': '고',
  'legend.low': '저',
  'legend.close': '종',
  'legend.change': '{change} ({percent}%)',
  'legend.volume': '거래량',
  'legend.indicatorSettings': '지표 설정',
  'legend.showRows': '지표 행 표시',
  'legend.hideRows': '지표 행 숨기기',
  'legend.restorePane': '패널 복원',
  'legend.collapsePane': '패널 접기',
  'legend.maximizePane': '패널 최대화',
  'legend.movePaneUp': '패널 위로 이동',
  'legend.movePaneDown': '패널 아래로 이동',
  'legend.showIndicator': '지표 표시',
  'legend.hideIndicator': '지표 숨기기',
  'legend.scaleNormal': '기본',
  'legend.scaleLog': '로그',
  'legend.scalePercent': '%',
  'legend.scaleIndexed': '100',
  'legend.changeSymbol': '심볼 변경',
  'legend.removeCompare': '비교 제거',
  'legend.removeIndicator': '지표 제거',
}

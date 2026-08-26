import type { Translation } from '@trdrs/i18n'
import type { legend as source } from '../en/legend'

export const legend: Translation<typeof source> = {
  'legend.indicatorSettings': '지표 설정',
  'legend.restorePane': '패널 복원',
  'legend.collapsePane': '패널 접기',
  'legend.maximizePane': '패널 최대화',
  'legend.showIndicator': '지표 표시',
  'legend.hideIndicator': '지표 숨기기',
  'legend.priceScale': '가격 스케일: {mode}',
  'legend.scaleNormal': '기본',
  'legend.scaleLog': '로그',
  'legend.scalePercent': '%',
  'legend.scaleIndexed': '100',
}

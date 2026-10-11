import type { Translation } from '../runtime'
import type { history as source } from '../en/history'

export const history: Translation<typeof source> = {
  'history.undoNamed': '실행 취소: {change}',
  'history.redoNamed': '다시 실행: {change}',
  'history.changeSymbol': '심볼 변경',
  'history.changeTimeframe': '타임프레임 변경',
  'history.changeChartStyle': '차트 스타일 변경',
  'history.changePriceScale': '가격 스케일 변경',
  'history.changeSettings': '설정 변경',
  'history.changeAddCompare': '비교 추가',
  'history.changeRemoveCompare': '비교 제거',
  'history.changeCompare': '비교 변경',
  'history.changeAddIndicator': '지표 추가',
  'history.changeRemoveIndicator': '지표 제거',
  'history.changeIndicator': '지표 변경',
  'history.changeMovePane': '패널 이동',
  'history.changeAddDrawing': '그리기 추가',
  'history.changeRemoveDrawing': '그리기 제거',
  'history.changeDrawing': '그리기 변경',
}

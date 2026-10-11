import type { Translation } from '../runtime'
import type { history as source } from '../en/history'

export const history: Translation<typeof source> = {
  'history.undoNamed': '復原：{change}',
  'history.redoNamed': '重做：{change}',
  'history.changeSymbol': '變更商品',
  'history.changeTimeframe': '變更時間週期',
  'history.changeChartStyle': '變更圖表樣式',
  'history.changePriceScale': '變更價格刻度',
  'history.changeSettings': '變更設定',
  'history.changeAddCompare': '新增比較',
  'history.changeRemoveCompare': '移除比較',
  'history.changeCompare': '變更比較',
  'history.changeAddIndicator': '新增指標',
  'history.changeRemoveIndicator': '移除指標',
  'history.changeIndicator': '變更指標',
  'history.changeMovePane': '移動窗格',
  'history.changeAddDrawing': '新增繪圖',
  'history.changeRemoveDrawing': '移除繪圖',
  'history.changeDrawing': '變更繪圖',
}

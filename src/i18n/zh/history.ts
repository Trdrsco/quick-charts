import type { Translation } from '../runtime'
import type { history as source } from '../en/history'

export const history: Translation<typeof source> = {
  'history.undoNamed': '撤销：{change}',
  'history.redoNamed': '重做：{change}',
  'history.changeSymbol': '更改代码',
  'history.changeTimeframe': '更改时间周期',
  'history.changeChartStyle': '更改图表样式',
  'history.changePriceScale': '更改价格刻度',
  'history.changeSettings': '更改设置',
  'history.changeAddCompare': '添加比较',
  'history.changeRemoveCompare': '移除比较',
  'history.changeCompare': '更改比较',
  'history.changeAddIndicator': '添加指标',
  'history.changeRemoveIndicator': '移除指标',
  'history.changeIndicator': '更改指标',
  'history.changeMovePane': 'move pane',
  'history.changeAddDrawing': '添加绘图',
  'history.changeRemoveDrawing': '移除绘图',
  'history.changeDrawing': '更改绘图',
}

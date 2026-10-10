import type { Translation } from '../runtime'
import type { legend as source } from '../en/legend'

export const legend: Translation<typeof source> = {
  'legend.open': '開',
  'legend.high': '高',
  'legend.low': '低',
  'legend.close': '收',
  'legend.change': '{change} ({percent}%)',
  'legend.volume': '成交量',
  'legend.indicatorSettings': '指標設定',
  'legend.showRows': '顯示指標列',
  'legend.hideRows': '隱藏指標列',
  'legend.restorePane': '還原窗格',
  'legend.collapsePane': '收合窗格',
  'legend.maximizePane': '最大化窗格',
  'legend.movePaneUp': '上移窗格',
  'legend.movePaneDown': '下移窗格',
  'legend.showIndicator': '顯示指標',
  'legend.hideIndicator': '隱藏指標',
  'legend.scaleNormal': '一般',
  'legend.scaleLog': '對數',
  'legend.scalePercent': '%',
  'legend.scaleIndexed': '100',
  'legend.changeSymbol': '變更商品',
  'legend.removeCompare': '移除比較',
  'legend.removeIndicator': '移除指標',
}

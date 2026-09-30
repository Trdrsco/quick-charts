import type { Translation } from '../runtime'
import type { legend as source } from '../en/legend'

export const legend: Translation<typeof source> = {
  'legend.open': 'O',
  'legend.high': 'H',
  'legend.low': 'L',
  'legend.close': 'C',
  'legend.change': '{change} ({percent}%)',
  'legend.indicatorSettings': '指标设置',
  'legend.showRows': 'Show study rows',
  'legend.hideRows': 'Hide study rows',
  'legend.restorePane': '还原窗格',
  'legend.collapsePane': '折叠窗格',
  'legend.maximizePane': '最大化窗格',
  'legend.showIndicator': '显示指标',
  'legend.hideIndicator': '隐藏指标',
  'legend.scaleNormal': '常规',
  'legend.scaleLog': '对数',
  'legend.scalePercent': '%',
  'legend.scaleIndexed': '100',
  'legend.changeSymbol': '更改代码',
  'legend.removeCompare': '移除比较',
  'legend.removeIndicator': 'Remove indicator',
}

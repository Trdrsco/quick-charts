import type { Translation } from '@trdrs/i18n'
import type { legend as source } from '../en/legend'

export const legend: Translation<typeof source> = {
  'legend.indicatorSettings': '指标设置',
  'legend.restorePane': '还原窗格',
  'legend.collapsePane': '折叠窗格',
  'legend.maximizePane': '最大化窗格',
  'legend.showIndicator': '显示指标',
  'legend.hideIndicator': '隐藏指标',
  'legend.priceScale': '价格轴：{mode}',
  'legend.scaleNormal': '常规',
  'legend.scaleLog': '对数',
  'legend.scalePercent': '%',
  'legend.scaleIndexed': '100',
}

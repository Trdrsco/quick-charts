import type { Translation } from '@trdrs/i18n'
import type { legend as source } from '../en/legend'

export const legend: Translation<typeof source> = {
  'legend.indicatorSettings': '指標設定',
  'legend.restorePane': '還原窗格',
  'legend.collapsePane': '收合窗格',
  'legend.maximizePane': '最大化窗格',
  'legend.showIndicator': '顯示指標',
  'legend.hideIndicator': '隱藏指標',
  'legend.priceScale': '價格座標：{mode}',
  'legend.scaleNormal': '一般',
  'legend.scaleLog': '對數',
  'legend.scalePercent': '%',
  'legend.scaleIndexed': '100',
  'legend.compare': '比較或加入商品',
  'legend.compareTitle': '比較商品',
  'legend.changeSymbol': '變更商品',
  'legend.samePercent': '相同%刻度',
  'legend.newScale': '新價格刻度',
  'legend.newPane': '新窗格',
  'legend.added': '已加入商品',
  'legend.removeCompare': '移除比較',
  'legend.searchPlaceholder': '商品',
}

import type { Translation } from '../runtime'
import type { legend as source } from '../en/legend'

export const legend: Translation<typeof source> = {
  'legend.indicatorSettings': 'インジケーター設定',
  'legend.restorePane': 'ペインを元に戻す',
  'legend.collapsePane': 'ペインを折りたたむ',
  'legend.maximizePane': 'ペインを最大化',
  'legend.showIndicator': 'インジケーターを表示',
  'legend.hideIndicator': 'インジケーターを非表示',
  'legend.priceScale': '価格スケール：{mode}',
  'legend.scaleNormal': '通常',
  'legend.scaleLog': '対数',
  'legend.scalePercent': '%',
  'legend.scaleIndexed': '100',
  'legend.compare': '銘柄の比較または追加',
  'legend.changeSymbol': '銘柄の変更',
  'legend.removeCompare': '比較を削除',
}

import type { Translation } from '../runtime'
import type { legend as source } from '../en/legend'

export const legend: Translation<typeof source> = {
  'legend.open': 'O',
  'legend.high': 'H',
  'legend.low': 'L',
  'legend.close': 'C',
  'legend.change': '{change} ({percent}%)',
  'legend.volume': 'Vol',
  'legend.indicatorSettings': 'インジケーター設定',
  'legend.showRows': 'インジケーターの行を表示',
  'legend.hideRows': 'インジケーターの行を非表示',
  'legend.restorePane': 'ペインを元に戻す',
  'legend.collapsePane': 'ペインを折りたたむ',
  'legend.maximizePane': 'ペインを最大化',
  'legend.showIndicator': 'インジケーターを表示',
  'legend.hideIndicator': 'インジケーターを非表示',
  'legend.scaleNormal': '通常',
  'legend.scaleLog': '対数',
  'legend.scalePercent': '%',
  'legend.scaleIndexed': '100',
  'legend.changeSymbol': '銘柄の変更',
  'legend.removeCompare': '比較を削除',
  'legend.removeIndicator': 'Remove indicator',
}

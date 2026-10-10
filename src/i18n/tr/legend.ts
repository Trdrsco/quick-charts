import type { Translation } from '../runtime'
import type { legend as source } from '../en/legend'

export const legend: Translation<typeof source> = {
  'legend.open': 'A',
  'legend.high': 'Y',
  'legend.low': 'D',
  'legend.close': 'K',
  'legend.change': '{change} ({percent}%)',
  'legend.volume': 'Hacim',
  'legend.indicatorSettings': 'Gösterge ayarları',
  'legend.showRows': 'Gösterge satırlarını göster',
  'legend.hideRows': 'Gösterge satırlarını gizle',
  'legend.restorePane': 'Bölmeyi geri yükle',
  'legend.collapsePane': 'Bölmeyi daralt',
  'legend.maximizePane': 'Bölmeyi büyüt',
  'legend.movePaneUp': 'Bölmeyi yukarı taşı',
  'legend.movePaneDown': 'Bölmeyi aşağı taşı',
  'legend.showIndicator': 'Göstergeyi göster',
  'legend.hideIndicator': 'Göstergeyi gizle',
  'legend.scaleNormal': 'Nor',
  'legend.scaleLog': 'Log',
  'legend.scalePercent': '%',
  'legend.scaleIndexed': '100',
  'legend.changeSymbol': 'Sembolü değiştir',
  'legend.removeCompare': 'Karşılaştırmayı kaldır',
  'legend.removeIndicator': 'Göstergeyi kaldır',
}

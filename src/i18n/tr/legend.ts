import type { Translation } from '../runtime'
import type { legend as source } from '../en/legend'

export const legend: Translation<typeof source> = {
  'legend.open': 'O',
  'legend.high': 'H',
  'legend.low': 'L',
  'legend.close': 'C',
  'legend.change': '{change} ({percent}%)',
  'legend.indicatorSettings': 'Gösterge ayarları',
  'legend.showRows': 'Gösterge satırlarını göster',
  'legend.hideRows': 'Gösterge satırlarını gizle',
  'legend.restorePane': 'Bölmeyi geri yükle',
  'legend.collapsePane': 'Bölmeyi daralt',
  'legend.maximizePane': 'Bölmeyi büyüt',
  'legend.showIndicator': 'Göstergeyi göster',
  'legend.hideIndicator': 'Göstergeyi gizle',
  'legend.scaleNormal': 'Nor',
  'legend.scaleLog': 'Log',
  'legend.scalePercent': '%',
  'legend.scaleIndexed': '100',
  'legend.changeSymbol': 'Sembolü değiştir',
  'legend.removeCompare': 'Karşılaştırmayı kaldır',
  'legend.removeIndicator': 'Remove indicator',
}

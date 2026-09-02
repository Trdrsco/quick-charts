import type { Translation } from '../runtime'
import type { legend as source } from '../en/legend'

export const legend: Translation<typeof source> = {
  'legend.indicatorSettings': 'Gösterge ayarları',
  'legend.restorePane': 'Bölmeyi geri yükle',
  'legend.collapsePane': 'Bölmeyi daralt',
  'legend.maximizePane': 'Bölmeyi büyüt',
  'legend.showIndicator': 'Göstergeyi göster',
  'legend.hideIndicator': 'Göstergeyi gizle',
  'legend.priceScale': 'Fiyat ölçeği: {mode}',
  'legend.scaleNormal': 'Nor',
  'legend.scaleLog': 'Log',
  'legend.scalePercent': '%',
  'legend.scaleIndexed': '100',
  'legend.compare': 'Sembol karşılaştır veya ekle',
  'legend.changeSymbol': 'Sembolü değiştir',
  'legend.removeCompare': 'Karşılaştırmayı kaldır',
}

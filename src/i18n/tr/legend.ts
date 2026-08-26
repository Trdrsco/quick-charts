import type { Translation } from '@trdrs/i18n'
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
}

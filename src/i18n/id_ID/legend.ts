import type { Translation } from '@trdrs/i18n'
import type { legend as source } from '../en/legend'

export const legend: Translation<typeof source> = {
  'legend.indicatorSettings': 'Pengaturan indikator',
  'legend.restorePane': 'Pulihkan panel',
  'legend.collapsePane': 'Ciutkan panel',
  'legend.maximizePane': 'Maksimalkan panel',
  'legend.showIndicator': 'Tampilkan indikator',
  'legend.hideIndicator': 'Sembunyikan indikator',
  'legend.priceScale': 'Skala harga: {mode}',
  'legend.scaleNormal': 'Reg',
  'legend.scaleLog': 'Log',
  'legend.scalePercent': '%',
  'legend.scaleIndexed': '100',
}

import type { Translation } from '@trdrs/i18n'
import type { legend as source } from '../en/legend'

export const legend: Translation<typeof source> = {
  'legend.indicatorSettings': 'Tetapan penunjuk',
  'legend.restorePane': 'Pulihkan anak tetingkap',
  'legend.collapsePane': 'Kuncupkan anak tetingkap',
  'legend.maximizePane': 'Besarkan anak tetingkap',
  'legend.showIndicator': 'Tunjukkan penunjuk',
  'legend.hideIndicator': 'Sembunyikan penunjuk',
  'legend.priceScale': 'Skala harga: {mode}',
  'legend.scaleNormal': 'Biasa',
  'legend.scaleLog': 'Log',
  'legend.scalePercent': '%',
  'legend.scaleIndexed': '100',
}

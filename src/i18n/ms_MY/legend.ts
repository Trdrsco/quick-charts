import type { Translation } from '../runtime'
import type { legend as source } from '../en/legend'

export const legend: Translation<typeof source> = {
  'legend.open': 'O',
  'legend.high': 'H',
  'legend.low': 'L',
  'legend.close': 'C',
  'legend.change': '{change} ({percent}%)',
  'legend.volume': 'Vol',
  'legend.indicatorSettings': 'Tetapan penunjuk',
  'legend.showRows': 'Tunjukkan baris penunjuk',
  'legend.hideRows': 'Sembunyikan baris penunjuk',
  'legend.restorePane': 'Pulihkan anak tetingkap',
  'legend.collapsePane': 'Kuncupkan anak tetingkap',
  'legend.maximizePane': 'Besarkan anak tetingkap',
  'legend.movePaneUp': 'Move pane up',
  'legend.movePaneDown': 'Move pane down',
  'legend.showIndicator': 'Tunjukkan penunjuk',
  'legend.hideIndicator': 'Sembunyikan penunjuk',
  'legend.scaleNormal': 'Biasa',
  'legend.scaleLog': 'Log',
  'legend.scalePercent': '%',
  'legend.scaleIndexed': '100',
  'legend.changeSymbol': 'Tukar simbol',
  'legend.removeCompare': 'Buang perbandingan',
  'legend.removeIndicator': 'Buang penunjuk',
}

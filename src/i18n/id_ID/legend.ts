import type { Translation } from '../runtime'
import type { legend as source } from '../en/legend'

export const legend: Translation<typeof source> = {
  'legend.open': 'O',
  'legend.high': 'H',
  'legend.low': 'L',
  'legend.close': 'C',
  'legend.change': '{change} ({percent}%)',
  'legend.volume': 'Vol',
  'legend.indicatorSettings': 'Pengaturan indikator',
  'legend.showRows': 'Tampilkan baris indikator',
  'legend.hideRows': 'Sembunyikan baris indikator',
  'legend.restorePane': 'Pulihkan panel',
  'legend.collapsePane': 'Ciutkan panel',
  'legend.maximizePane': 'Maksimalkan panel',
  'legend.showIndicator': 'Tampilkan indikator',
  'legend.hideIndicator': 'Sembunyikan indikator',
  'legend.scaleNormal': 'Reg',
  'legend.scaleLog': 'Log',
  'legend.scalePercent': '%',
  'legend.scaleIndexed': '100',
  'legend.changeSymbol': 'Ganti simbol',
  'legend.removeCompare': 'Hapus perbandingan',
  'legend.removeIndicator': 'Hapus indikator',
}

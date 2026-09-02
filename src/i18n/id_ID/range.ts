import type { Translation } from '../runtime'
import type { range as source } from '../en/range'

export const range: Translation<typeof source> = {
  'range.oneDay': '1 hari',
  'range.fiveDays': '5 hari',
  'range.oneMonth': '1 bulan',
  'range.threeMonths': '3 bulan',
  'range.sixMonths': '6 bulan',
  'range.yearToDate': 'Sejak awal tahun',
  'range.oneYear': '1 tahun',
  'range.fiveYears': '5 tahun',
  'range.all': 'Semua data',
  'range.tip': '{range} · bar {interval}',
  'range.zoomIn': 'Perbesar',
  'range.zoomOut': 'Perkecil',
  'range.scrollLeft': 'Geser ke kiri',
  'range.scrollRight': 'Geser ke kanan',
  'range.reset': 'Reset tampilan chart',
}

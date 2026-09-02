import type { Translation } from '../runtime'
import type { range as source } from '../en/range'

export const range: Translation<typeof source> = {
  'range.oneDay': '1 Hari',
  'range.fiveDays': '5 Hari',
  'range.oneMonth': '1 Bulan',
  'range.threeMonths': '3 Bulan',
  'range.sixMonths': '6 Bulan',
  'range.yearToDate': 'Tahun hingga kini',
  'range.oneYear': '1 Tahun',
  'range.fiveYears': '5 Tahun',
  'range.all': 'Semua data',
  'range.tip': '{range} · bar {interval}',
  'range.zoomIn': 'Zum masuk',
  'range.zoomOut': 'Zum keluar',
  'range.scrollLeft': 'Tatal ke kiri',
  'range.scrollRight': 'Tatal ke kanan',
  'range.reset': 'Tetapkan semula paparan carta',
}

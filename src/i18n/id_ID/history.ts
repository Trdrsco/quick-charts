import type { Translation } from '../runtime'
import type { history as source } from '../en/history'

export const history: Translation<typeof source> = {
  'history.undoNamed': 'Urungkan: {change}',
  'history.redoNamed': 'Ulangi: {change}',
  'history.changeSymbol': 'perubahan simbol',
  'history.changeTimeframe': 'perubahan kerangka waktu',
  'history.changeChartStyle': 'perubahan gaya chart',
  'history.changePriceScale': 'perubahan skala harga',
  'history.changeSettings': 'perubahan pengaturan',
  'history.changeAddCompare': 'penambahan perbandingan',
  'history.changeRemoveCompare': 'penghapusan perbandingan',
  'history.changeCompare': 'perubahan perbandingan',
  'history.changeAddIndicator': 'penambahan indikator',
  'history.changeRemoveIndicator': 'penghapusan indikator',
  'history.changeIndicator': 'perubahan indikator',
  'history.changeAddDrawing': 'penambahan gambar',
  'history.changeRemoveDrawing': 'penghapusan gambar',
  'history.changeDrawing': 'perubahan gambar',
}

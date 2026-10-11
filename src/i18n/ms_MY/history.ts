import type { Translation } from '../runtime'
import type { history as source } from '../en/history'

export const history: Translation<typeof source> = {
  'history.undoNamed': 'Buat asal: {change}',
  'history.redoNamed': 'Buat semula: {change}',
  'history.changeSymbol': 'pertukaran simbol',
  'history.changeTimeframe': 'pertukaran selang masa',
  'history.changeChartStyle': 'pertukaran gaya carta',
  'history.changePriceScale': 'perubahan skala harga',
  'history.changeSettings': 'perubahan tetapan',
  'history.changeAddCompare': 'penambahan perbandingan',
  'history.changeRemoveCompare': 'pembuangan perbandingan',
  'history.changeCompare': 'perubahan perbandingan',
  'history.changeAddIndicator': 'penambahan penunjuk',
  'history.changeRemoveIndicator': 'pembuangan penunjuk',
  'history.changeIndicator': 'perubahan penunjuk',
  'history.changeMovePane': 'pengalihan anak tetingkap',
  'history.changeAddDrawing': 'penambahan lukisan',
  'history.changeRemoveDrawing': 'pembuangan lukisan',
  'history.changeDrawing': 'perubahan lukisan',
}

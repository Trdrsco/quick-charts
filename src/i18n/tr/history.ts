import type { Translation } from '../runtime'
import type { history as source } from '../en/history'

export const history: Translation<typeof source> = {
  'history.undoNamed': 'Geri al: {change}',
  'history.redoNamed': 'Yinele: {change}',
  'history.changeSymbol': 'sembol değişikliği',
  'history.changeTimeframe': 'zaman aralığı değişikliği',
  'history.changeChartStyle': 'grafik stili değişikliği',
  'history.changePriceScale': 'fiyat ölçeği değişikliği',
  'history.changeSettings': 'ayar değişikliği',
  'history.changeAddCompare': 'karşılaştırma ekleme',
  'history.changeRemoveCompare': 'karşılaştırma kaldırma',
  'history.changeCompare': 'karşılaştırma değişikliği',
  'history.changeAddIndicator': 'gösterge ekleme',
  'history.changeRemoveIndicator': 'gösterge kaldırma',
  'history.changeIndicator': 'gösterge değişikliği',
  'history.changeAddDrawing': 'çizim ekleme',
  'history.changeRemoveDrawing': 'çizim kaldırma',
  'history.changeDrawing': 'çizim değişikliği',
}

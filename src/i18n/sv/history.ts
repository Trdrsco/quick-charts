import type { Translation } from '../runtime'
import type { history as source } from '../en/history'

export const history: Translation<typeof source> = {
  'history.undoNamed': 'Ångra: {change}',
  'history.redoNamed': 'Gör om: {change}',
  'history.changeSymbol': 'byte av symbol',
  'history.changeTimeframe': 'byte av intervall',
  'history.changeChartStyle': 'byte av diagramstil',
  'history.changePriceScale': 'ändring av prisskala',
  'history.changeSettings': 'ändring av inställningar',
  'history.changeAddCompare': 'tillägg av jämförelse',
  'history.changeRemoveCompare': 'borttagning av jämförelse',
  'history.changeCompare': 'ändring av jämförelse',
  'history.changeAddIndicator': 'tillägg av indikator',
  'history.changeRemoveIndicator': 'borttagning av indikator',
  'history.changeIndicator': 'ändring av indikator',
  'history.changeAddDrawing': 'tillägg av ritning',
  'history.changeRemoveDrawing': 'borttagning av ritning',
  'history.changeDrawing': 'ändring av ritning',
}

import type { Translation } from '../runtime'
import type { legend as source } from '../en/legend'

export const legend: Translation<typeof source> = {
  'legend.indicatorSettings': 'Indikatorinställningar',
  'legend.restorePane': 'Återställ ruta',
  'legend.collapsePane': 'Fäll in ruta',
  'legend.maximizePane': 'Maximera ruta',
  'legend.showIndicator': 'Visa indikator',
  'legend.hideIndicator': 'Dölj indikator',
  'legend.priceScale': 'Prisskala: {mode}',
  'legend.scaleNormal': 'Norm',
  'legend.scaleLog': 'Log',
  'legend.scalePercent': '%',
  'legend.scaleIndexed': '100',
  'legend.compare': 'Jämför eller lägg till symbol',
  'legend.changeSymbol': 'Byt symbol',
  'legend.removeCompare': 'Ta bort jämförelse',
}

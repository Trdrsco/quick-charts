import type { Translation } from '../runtime'
import type { legend as source } from '../en/legend'

export const legend: Translation<typeof source> = {
  'legend.open': 'O',
  'legend.high': 'H',
  'legend.low': 'L',
  'legend.close': 'C',
  'legend.change': '{change} ({percent}%)',
  'legend.volume': 'Vol',
  'legend.indicatorSettings': 'Indikatorinställningar',
  'legend.showRows': 'Visa indikatorrader',
  'legend.hideRows': 'Dölj indikatorrader',
  'legend.restorePane': 'Återställ ruta',
  'legend.collapsePane': 'Fäll in ruta',
  'legend.maximizePane': 'Maximera ruta',
  'legend.showIndicator': 'Visa indikator',
  'legend.hideIndicator': 'Dölj indikator',
  'legend.scaleNormal': 'Norm',
  'legend.scaleLog': 'Log',
  'legend.scalePercent': '%',
  'legend.scaleIndexed': '100',
  'legend.changeSymbol': 'Byt symbol',
  'legend.removeCompare': 'Ta bort jämförelse',
  'legend.removeIndicator': 'Remove indicator',
}

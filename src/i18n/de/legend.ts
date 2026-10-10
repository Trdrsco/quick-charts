import type { Translation } from '../runtime'
import type { legend as source } from '../en/legend'

export const legend: Translation<typeof source> = {
  'legend.open': 'O',
  'legend.high': 'H',
  'legend.low': 'L',
  'legend.close': 'C',
  'legend.change': '{change} ({percent}%)',
  'legend.volume': 'Vol',
  'legend.indicatorSettings': 'Indikator-Einstellungen',
  'legend.showRows': 'Indikatorzeilen anzeigen',
  'legend.hideRows': 'Indikatorzeilen ausblenden',
  'legend.restorePane': 'Bereich wiederherstellen',
  'legend.collapsePane': 'Bereich einklappen',
  'legend.maximizePane': 'Bereich maximieren',
  'legend.showIndicator': 'Indikator anzeigen',
  'legend.hideIndicator': 'Indikator ausblenden',
  'legend.scaleNormal': 'Norm',
  'legend.scaleLog': 'Log',
  'legend.scalePercent': '%',
  'legend.scaleIndexed': '100',
  'legend.changeSymbol': 'Symbol wechseln',
  'legend.removeCompare': 'Vergleich entfernen',
  'legend.removeIndicator': 'Remove indicator',
}

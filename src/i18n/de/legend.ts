import type { Translation } from '../runtime'
import type { legend as source } from '../en/legend'

export const legend: Translation<typeof source> = {
  'legend.open': 'E',
  'legend.high': 'H',
  'legend.low': 'T',
  'legend.close': 'S',
  'legend.change': '{change} ({percent}%)',
  'legend.volume': 'Vol',
  'legend.indicatorSettings': 'Indikator-Einstellungen',
  'legend.showRows': 'Indikatorzeilen anzeigen',
  'legend.hideRows': 'Indikatorzeilen ausblenden',
  'legend.restorePane': 'Bereich wiederherstellen',
  'legend.collapsePane': 'Bereich einklappen',
  'legend.maximizePane': 'Bereich maximieren',
  'legend.movePaneUp': 'Move pane up',
  'legend.movePaneDown': 'Move pane down',
  'legend.showIndicator': 'Indikator anzeigen',
  'legend.hideIndicator': 'Indikator ausblenden',
  'legend.scaleNormal': 'Norm',
  'legend.scaleLog': 'Log',
  'legend.scalePercent': '%',
  'legend.scaleIndexed': '100',
  'legend.changeSymbol': 'Symbol wechseln',
  'legend.removeCompare': 'Vergleich entfernen',
  'legend.removeIndicator': 'Indikator entfernen',
}

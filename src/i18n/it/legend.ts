import type { Translation } from '../runtime'
import type { legend as source } from '../en/legend'

export const legend: Translation<typeof source> = {
  'legend.open': 'A',
  'legend.high': 'Max',
  'legend.low': 'Min',
  'legend.close': 'C',
  'legend.change': '{change} ({percent}%)',
  'legend.volume': 'Vol',
  'legend.indicatorSettings': 'Impostazioni dell\'indicatore',
  'legend.showRows': 'Mostra le righe degli indicatori',
  'legend.hideRows': 'Nascondi le righe degli indicatori',
  'legend.restorePane': 'Ripristina il riquadro',
  'legend.collapsePane': 'Comprimi il riquadro',
  'legend.maximizePane': 'Ingrandisci il riquadro',
  'legend.showIndicator': 'Mostra l\'indicatore',
  'legend.hideIndicator': 'Nascondi l\'indicatore',
  'legend.scaleNormal': 'Norm',
  'legend.scaleLog': 'Log',
  'legend.scalePercent': '%',
  'legend.scaleIndexed': '100',
  'legend.changeSymbol': 'Cambia simbolo',
  'legend.removeCompare': 'Rimuovi confronto',
  'legend.removeIndicator': 'Rimuovi indicatore',
}

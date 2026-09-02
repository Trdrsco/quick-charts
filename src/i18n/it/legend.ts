import type { Translation } from '../runtime'
import type { legend as source } from '../en/legend'

export const legend: Translation<typeof source> = {
  'legend.indicatorSettings': 'Impostazioni dell\'indicatore',
  'legend.restorePane': 'Ripristina il riquadro',
  'legend.collapsePane': 'Comprimi il riquadro',
  'legend.maximizePane': 'Ingrandisci il riquadro',
  'legend.showIndicator': 'Mostra l\'indicatore',
  'legend.hideIndicator': 'Nascondi l\'indicatore',
  'legend.priceScale': 'Scala dei prezzi: {mode}',
  'legend.scaleNormal': 'Norm',
  'legend.scaleLog': 'Log',
  'legend.scalePercent': '%',
  'legend.scaleIndexed': '100',
  'legend.compare': 'Confronta o aggiungi simbolo',
  'legend.changeSymbol': 'Cambia simbolo',
  'legend.removeCompare': 'Rimuovi confronto',
}

import type { Translation } from '@trdrs/i18n'
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
  'legend.compareTitle': 'Confronta simboli',
  'legend.changeSymbol': 'Cambia simbolo',
  'legend.samePercent': 'Stessa scala %',
  'legend.newScale': 'Nuova scala dei prezzi',
  'legend.newPane': 'Nuovo riquadro',
  'legend.added': 'Simboli aggiunti',
  'legend.removeCompare': 'Rimuovi confronto',
  'legend.searchPlaceholder': 'Simbolo',
}

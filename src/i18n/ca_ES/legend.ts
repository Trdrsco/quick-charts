import type { Translation } from '../runtime'
import type { legend as source } from '../en/legend'

export const legend: Translation<typeof source> = {
  'legend.indicatorSettings': 'Configuració de l’indicador',
  'legend.restorePane': 'Restaura el panell',
  'legend.collapsePane': 'Redueix el panell',
  'legend.maximizePane': 'Maximitza el panell',
  'legend.showIndicator': 'Mostra l’indicador',
  'legend.hideIndicator': 'Amaga l’indicador',
  'legend.priceScale': 'Escala de preus: {mode}',
  'legend.scaleNormal': 'Reg',
  'legend.scaleLog': 'Log',
  'legend.scalePercent': '%',
  'legend.scaleIndexed': '100',
  'legend.compare': 'Compara o afegeix un símbol',
  'legend.changeSymbol': 'Canvia el símbol',
  'legend.removeCompare': 'Elimina la comparació',
}

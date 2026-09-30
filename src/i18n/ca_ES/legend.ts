import type { Translation } from '../runtime'
import type { legend as source } from '../en/legend'

export const legend: Translation<typeof source> = {
  'legend.open': 'O',
  'legend.high': 'H',
  'legend.low': 'L',
  'legend.close': 'C',
  'legend.change': '{change} ({percent}%)',
  'legend.indicatorSettings': 'Configuració de l’indicador',
  'legend.showRows': 'Show study rows',
  'legend.hideRows': 'Hide study rows',
  'legend.restorePane': 'Restaura el panell',
  'legend.collapsePane': 'Redueix el panell',
  'legend.maximizePane': 'Maximitza el panell',
  'legend.showIndicator': 'Mostra l’indicador',
  'legend.hideIndicator': 'Amaga l’indicador',
  'legend.scaleNormal': 'Reg',
  'legend.scaleLog': 'Log',
  'legend.scalePercent': '%',
  'legend.scaleIndexed': '100',
  'legend.changeSymbol': 'Canvia el símbol',
  'legend.removeCompare': 'Elimina la comparació',
  'legend.removeIndicator': 'Remove indicator',
}

import type { Translation } from '../runtime'
import type { legend as source } from '../en/legend'

export const legend: Translation<typeof source> = {
  'legend.open': 'O',
  'legend.high': 'Màx',
  'legend.low': 'Mín',
  'legend.close': 'T',
  'legend.change': '{change} ({percent}%)',
  'legend.volume': 'Vol',
  'legend.indicatorSettings': 'Configuració de l’indicador',
  'legend.showRows': 'Mostra les files d’indicadors',
  'legend.hideRows': 'Amaga les files d’indicadors',
  'legend.restorePane': 'Restaura el panell',
  'legend.collapsePane': 'Redueix el panell',
  'legend.maximizePane': 'Maximitza el panell',
  'legend.movePaneUp': 'Mou el panell amunt',
  'legend.movePaneDown': 'Mou el panell avall',
  'legend.showIndicator': 'Mostra l’indicador',
  'legend.hideIndicator': 'Amaga l’indicador',
  'legend.scaleNormal': 'Reg',
  'legend.scaleLog': 'Log',
  'legend.scalePercent': '%',
  'legend.scaleIndexed': '100',
  'legend.changeSymbol': 'Canvia el símbol',
  'legend.removeCompare': 'Elimina la comparació',
  'legend.removeIndicator': 'Elimina l’indicador',
}

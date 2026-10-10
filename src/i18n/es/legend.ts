import type { Translation } from '../runtime'
import type { legend as source } from '../en/legend'

export const legend: Translation<typeof source> = {
  'legend.open': 'A',
  'legend.high': 'Máx',
  'legend.low': 'Mín',
  'legend.close': 'C',
  'legend.change': '{change} ({percent}%)',
  'legend.volume': 'Vol',
  'legend.indicatorSettings': 'Ajustes del indicador',
  'legend.showRows': 'Mostrar las filas de indicadores',
  'legend.hideRows': 'Ocultar las filas de indicadores',
  'legend.restorePane': 'Restaurar el panel',
  'legend.collapsePane': 'Contraer el panel',
  'legend.maximizePane': 'Maximizar el panel',
  'legend.movePaneUp': 'Mover el panel arriba',
  'legend.movePaneDown': 'Mover el panel abajo',
  'legend.showIndicator': 'Mostrar el indicador',
  'legend.hideIndicator': 'Ocultar el indicador',
  'legend.scaleNormal': 'Reg',
  'legend.scaleLog': 'Log',
  'legend.scalePercent': '%',
  'legend.scaleIndexed': '100',
  'legend.changeSymbol': 'Cambiar símbolo',
  'legend.removeCompare': 'Quitar comparación',
  'legend.removeIndicator': 'Quitar indicador',
}

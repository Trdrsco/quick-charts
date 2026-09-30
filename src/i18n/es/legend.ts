import type { Translation } from '../runtime'
import type { legend as source } from '../en/legend'

export const legend: Translation<typeof source> = {
  'legend.open': 'O',
  'legend.high': 'H',
  'legend.low': 'L',
  'legend.close': 'C',
  'legend.change': '{change} ({percent}%)',
  'legend.indicatorSettings': 'Ajustes del indicador',
  'legend.showRows': 'Show study rows',
  'legend.hideRows': 'Hide study rows',
  'legend.restorePane': 'Restaurar el panel',
  'legend.collapsePane': 'Contraer el panel',
  'legend.maximizePane': 'Maximizar el panel',
  'legend.showIndicator': 'Mostrar el indicador',
  'legend.hideIndicator': 'Ocultar el indicador',
  'legend.scaleNormal': 'Reg',
  'legend.scaleLog': 'Log',
  'legend.scalePercent': '%',
  'legend.scaleIndexed': '100',
  'legend.changeSymbol': 'Cambiar símbolo',
  'legend.removeCompare': 'Quitar comparación',
  'legend.removeIndicator': 'Remove indicator',
}

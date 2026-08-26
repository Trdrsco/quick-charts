import type { Translation } from '@trdrs/i18n'
import type { legend as source } from '../en/legend'

export const legend: Translation<typeof source> = {
  'legend.indicatorSettings': 'Ajustes del indicador',
  'legend.restorePane': 'Restaurar el panel',
  'legend.collapsePane': 'Contraer el panel',
  'legend.maximizePane': 'Maximizar el panel',
  'legend.showIndicator': 'Mostrar el indicador',
  'legend.hideIndicator': 'Ocultar el indicador',
  'legend.priceScale': 'Escala de precios: {mode}',
  'legend.scaleNormal': 'Reg',
  'legend.scaleLog': 'Log',
  'legend.scalePercent': '%',
  'legend.scaleIndexed': '100',
}

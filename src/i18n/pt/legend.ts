import type { Translation } from '@trdrs/i18n'
import type { legend as source } from '../en/legend'

export const legend: Translation<typeof source> = {
  'legend.indicatorSettings': 'Configurações do indicador',
  'legend.restorePane': 'Restaurar painel',
  'legend.collapsePane': 'Recolher painel',
  'legend.maximizePane': 'Maximizar painel',
  'legend.showIndicator': 'Mostrar indicador',
  'legend.hideIndicator': 'Ocultar indicador',
  'legend.priceScale': 'Escala de preço: {mode}',
  'legend.scaleNormal': 'Reg',
  'legend.scaleLog': 'Log',
  'legend.scalePercent': '%',
  'legend.scaleIndexed': '100',
}

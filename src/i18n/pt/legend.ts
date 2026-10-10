import type { Translation } from '../runtime'
import type { legend as source } from '../en/legend'

export const legend: Translation<typeof source> = {
  'legend.open': 'A',
  'legend.high': 'Máx',
  'legend.low': 'Mín',
  'legend.close': 'F',
  'legend.change': '{change} ({percent}%)',
  'legend.volume': 'Vol',
  'legend.indicatorSettings': 'Configurações do indicador',
  'legend.showRows': 'Mostrar linhas de indicadores',
  'legend.hideRows': 'Ocultar linhas de indicadores',
  'legend.restorePane': 'Restaurar painel',
  'legend.collapsePane': 'Recolher painel',
  'legend.maximizePane': 'Maximizar painel',
  'legend.movePaneUp': 'Mover painel para cima',
  'legend.movePaneDown': 'Mover painel para baixo',
  'legend.showIndicator': 'Mostrar indicador',
  'legend.hideIndicator': 'Ocultar indicador',
  'legend.scaleNormal': 'Reg',
  'legend.scaleLog': 'Log',
  'legend.scalePercent': '%',
  'legend.scaleIndexed': '100',
  'legend.changeSymbol': 'Trocar símbolo',
  'legend.removeCompare': 'Remover comparação',
  'legend.removeIndicator': 'Remover indicador',
}

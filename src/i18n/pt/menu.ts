import type { Translation } from '../runtime'
import type { menu as source } from '../en/menu'

export const menu: Translation<typeof source> = {
  'menu.resetView': 'Redefinir visualização do gráfico',
  'menu.copyPrice': 'Copiar preço {price}',
  'menu.paste': 'Colar',
  'menu.removeIndicators': { one: 'Remover {count} indicador', many: 'Remover {count} indicadores', other: 'Remover {count} indicadores' },
  'menu.removeDrawings': { one: 'Remover {count} desenho', many: 'Remover {count} desenhos', other: 'Remover {count} desenhos' },
  'menu.settings': 'Configurações…',
}

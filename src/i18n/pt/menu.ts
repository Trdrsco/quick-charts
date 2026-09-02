import type { Translation } from '../runtime'
import type { menu as source } from '../en/menu'

export const menu: Translation<typeof source> = {
  'menu.resetView': 'Redefinir visualização do gráfico',
  'menu.copyPrice': 'Copiar preço {price}',
  'menu.paste': 'Colar',
  'menu.addAlert': 'Adicionar alerta em {symbol} a {price}…',
  'menu.addOrder': 'Adicionar ordem em {symbol} a {price}…',
  'menu.sellLimit': 'Vender {at} limite',
  'menu.buyStop': 'Comprar {at} stop',
  'menu.buyLimit': 'Comprar {at} limite',
  'menu.sellStop': 'Vender {at} stop',
  'menu.removeIndicators': { one: 'Remover {count} indicador', many: 'Remover {count} indicadores', other: 'Remover {count} indicadores' },
  'menu.removeDrawings': { one: 'Remover {count} desenho', many: 'Remover {count} desenhos', other: 'Remover {count} desenhos' },
  'menu.hideMarks': 'Ocultar marcas nos candles',
  'menu.settings': 'Configurações…',
}

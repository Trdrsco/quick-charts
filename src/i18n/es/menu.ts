import type { Translation } from '../runtime'
import type { menu as source } from '../en/menu'

export const menu: Translation<typeof source> = {
  'menu.resetView': 'Restablecer la vista del gráfico',
  'menu.copyPrice': 'Copiar el precio {price}',
  'menu.paste': 'Pegar',
  'menu.addAlert': 'Añadir una alerta en {symbol} a {price}…',
  'menu.addOrder': 'Añadir una orden en {symbol} a {price}…',
  'menu.sellLimit': 'Venta límite a {at}',
  'menu.buyStop': 'Compra stop a {at}',
  'menu.buyLimit': 'Compra límite a {at}',
  'menu.sellStop': 'Venta stop a {at}',
  'menu.removeIndicators': { one: 'Quitar {count} indicador', many: 'Quitar {count} indicadores', other: 'Quitar {count} indicadores' },
  'menu.removeDrawings': { one: 'Quitar {count} dibujo', many: 'Quitar {count} dibujos', other: 'Quitar {count} dibujos' },
  'menu.hideMarks': 'Ocultar las marcas en las velas',
  'menu.settings': 'Ajustes…',
}

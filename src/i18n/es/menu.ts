import type { Translation } from '../runtime'
import type { menu as source } from '../en/menu'

export const menu: Translation<typeof source> = {
  'menu.resetView': 'Restablecer la vista del gráfico',
  'menu.copyPrice': 'Copiar el precio {price}',
  'menu.paste': 'Pegar',
  'menu.addAlert': 'Añadir una alerta en {symbol} a {price}…',
  'menu.removeIndicators': { one: 'Quitar {count} indicador', many: 'Quitar {count} indicadores', other: 'Quitar {count} indicadores' },
  'menu.removeDrawings': { one: 'Quitar {count} dibujo', many: 'Quitar {count} dibujos', other: 'Quitar {count} dibujos' },
  'menu.settings': 'Ajustes…',
}

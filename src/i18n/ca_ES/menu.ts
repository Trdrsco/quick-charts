import type { Translation } from '@trdrs/i18n'
import type { menu as source } from '../en/menu'

export const menu: Translation<typeof source> = {
  'menu.resetView': 'Restableix la vista del gràfic',
  'menu.copyPrice': 'Copia el preu {price}',
  'menu.paste': 'Enganxa',
  'menu.addAlert': 'Afegeix una alerta sobre {symbol} a {price}…',
  'menu.addOrder': 'Afegeix una ordre sobre {symbol} a {price}…',
  'menu.sellLimit': 'Venda {at} límit',
  'menu.buyStop': 'Compra {at} stop',
  'menu.buyLimit': 'Compra {at} límit',
  'menu.sellStop': 'Venda {at} stop',
  'menu.removeIndicators': { one: 'Elimina {count} indicador', many: 'Elimina {count} indicadors', other: 'Elimina {count} indicadors' },
  'menu.removeDrawings': { one: 'Elimina {count} dibuix', many: 'Elimina {count} dibuixos', other: 'Elimina {count} dibuixos' },
  'menu.hideMarks': 'Amaga les marques a les barres',
  'menu.settings': 'Configuració…',
}

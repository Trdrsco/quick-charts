import type { Translation } from '@trdrs/i18n'
import type { menu as source } from '../en/menu'

export const menu: Translation<typeof source> = {
  'menu.resetView': 'Reset chart view',
  'menu.copyPrice': 'Copy price {price}',
  'menu.paste': 'Paste',
  'menu.addAlert': 'Add alert on {symbol} at {price}…',
  'menu.addOrder': 'Add order on {symbol} at {price}…',
  'menu.sellLimit': 'Sell {at} limit',
  'menu.buyStop': 'Buy {at} stop',
  'menu.buyLimit': 'Buy {at} limit',
  'menu.sellStop': 'Sell {at} stop',
  'menu.removeIndicators': { one: 'Remove {count} indicator', other: 'Remove {count} indicators' },
  'menu.removeDrawings': { one: 'Remove {count} drawing', other: 'Remove {count} drawings' },
  'menu.hideMarks': 'Hide marks on bars',
  'menu.settings': 'Settings…',
}

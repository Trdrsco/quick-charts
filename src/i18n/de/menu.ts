import type { Translation } from '../runtime'
import type { menu as source } from '../en/menu'

export const menu: Translation<typeof source> = {
  'menu.resetView': 'Chartansicht zurücksetzen',
  'menu.copyPrice': 'Preis {price} kopieren',
  'menu.paste': 'Einfügen',
  'menu.addAlert': 'Alarm für {symbol} bei {price} hinzufügen…',
  'menu.removeIndicators': { one: '{count} Indikator entfernen', other: '{count} Indikatoren entfernen' },
  'menu.removeDrawings': { one: '{count} Zeichnung entfernen', other: '{count} Zeichnungen entfernen' },
  'menu.settings': 'Einstellungen…',
}

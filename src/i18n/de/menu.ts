import type { Translation } from '../runtime'
import type { menu as source } from '../en/menu'

export const menu: Translation<typeof source> = {
  'menu.resetView': 'Chartansicht zurücksetzen',
  'menu.copyPrice': 'Preis {price} kopieren',
  'menu.paste': 'Einfügen',
  'menu.addAlert': 'Alarm für {symbol} bei {price} hinzufügen…',
  'menu.addOrder': 'Order für {symbol} bei {price} hinzufügen…',
  'menu.sellLimit': 'Verkauf {at} Limit',
  'menu.buyStop': 'Kauf {at} Stop',
  'menu.buyLimit': 'Kauf {at} Limit',
  'menu.sellStop': 'Verkauf {at} Stop',
  'menu.removeIndicators': { one: '{count} Indikator entfernen', other: '{count} Indikatoren entfernen' },
  'menu.removeDrawings': { one: '{count} Zeichnung entfernen', other: '{count} Zeichnungen entfernen' },
  'menu.hideMarks': 'Marken auf Balken ausblenden',
  'menu.settings': 'Einstellungen…',
}

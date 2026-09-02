import type { Translation } from '../runtime'
import type { menu as source } from '../en/menu'

export const menu: Translation<typeof source> = {
  'menu.resetView': 'Zresetuj widok wykresu',
  'menu.copyPrice': 'Kopiuj cenę {price}',
  'menu.paste': 'Wklej',
  'menu.addAlert': 'Dodaj alert na {symbol} przy {price}…',
  'menu.addOrder': 'Dodaj zlecenie na {symbol} przy {price}…',
  'menu.sellLimit': 'Sprzedaj {at} limit',
  'menu.buyStop': 'Kup {at} stop',
  'menu.buyLimit': 'Kup {at} limit',
  'menu.sellStop': 'Sprzedaj {at} stop',
  'menu.removeIndicators': { one: 'Usuń {count} wskaźnik', few: 'Usuń {count} wskaźniki', many: 'Usuń {count} wskaźników', other: 'Usuń {count} wskaźnika' },
  'menu.removeDrawings': { one: 'Usuń {count} rysunek', few: 'Usuń {count} rysunki', many: 'Usuń {count} rysunków', other: 'Usuń {count} rysunku' },
  'menu.hideMarks': 'Ukryj znaczniki na słupkach',
  'menu.settings': 'Ustawienia…',
}

import type { Translation } from '../runtime'
import type { menu as source } from '../en/menu'

export const menu: Translation<typeof source> = {
  'menu.resetView': 'Zresetuj widok wykresu',
  'menu.copyPrice': 'Kopiuj cenę {price}',
  'menu.paste': 'Wklej',
  'menu.removeIndicators': { one: 'Usuń {count} wskaźnik', few: 'Usuń {count} wskaźniki', many: 'Usuń {count} wskaźników', other: 'Usuń {count} wskaźnika' },
  'menu.removeDrawings': { one: 'Usuń {count} rysunek', few: 'Usuń {count} rysunki', many: 'Usuń {count} rysunków', other: 'Usuń {count} rysunku' },
  'menu.settings': 'Ustawienia…',
}

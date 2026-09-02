import type { Translation } from '../runtime'
import type { menu as source } from '../en/menu'

export const menu: Translation<typeof source> = {
  'menu.resetView': 'Återställ diagramvyn',
  'menu.copyPrice': 'Kopiera pris {price}',
  'menu.paste': 'Klistra in',
  'menu.removeIndicators': { one: 'Ta bort {count} indikator', other: 'Ta bort {count} indikatorer' },
  'menu.removeDrawings': { one: 'Ta bort {count} ritning', other: 'Ta bort {count} ritningar' },
  'menu.settings': 'Inställningar…',
}

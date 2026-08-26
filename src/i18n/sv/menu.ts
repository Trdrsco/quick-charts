import type { Translation } from '@trdrs/i18n'
import type { menu as source } from '../en/menu'

export const menu: Translation<typeof source> = {
  'menu.resetView': 'Återställ diagramvyn',
  'menu.copyPrice': 'Kopiera pris {price}',
  'menu.paste': 'Klistra in',
  'menu.addAlert': 'Lägg till varning på {symbol} vid {price}…',
  'menu.addOrder': 'Lägg till order på {symbol} vid {price}…',
  'menu.sellLimit': 'Sälj {at} limit',
  'menu.buyStop': 'Köp {at} stop',
  'menu.buyLimit': 'Köp {at} limit',
  'menu.sellStop': 'Sälj {at} stop',
  'menu.removeIndicators': { one: 'Ta bort {count} indikator', other: 'Ta bort {count} indikatorer' },
  'menu.removeDrawings': { one: 'Ta bort {count} ritning', other: 'Ta bort {count} ritningar' },
  'menu.hideMarks': 'Dölj markeringar på staplar',
  'menu.settings': 'Inställningar…',
}

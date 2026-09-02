import type { Translation } from '../runtime'
import type { menu as source } from '../en/menu'

export const menu: Translation<typeof source> = {
  'menu.resetView': 'Ripristina la vista del grafico',
  'menu.copyPrice': 'Copia il prezzo {price}',
  'menu.paste': 'Incolla',
  'menu.removeIndicators': { one: 'Rimuovi {count} indicatore', many: 'Rimuovi {count} indicatori', other: 'Rimuovi {count} indicatori' },
  'menu.removeDrawings': { one: 'Rimuovi {count} disegno', many: 'Rimuovi {count} disegni', other: 'Rimuovi {count} disegni' },
  'menu.settings': 'Impostazioni…',
}

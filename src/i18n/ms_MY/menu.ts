import type { Translation } from '../runtime'
import type { menu as source } from '../en/menu'

export const menu: Translation<typeof source> = {
  'menu.resetView': 'Tetapkan semula paparan carta',
  'menu.copyPrice': 'Salin harga {price}',
  'menu.paste': 'Tampal',
  'menu.removeIndicators': { other: 'Buang {count} penunjuk' },
  'menu.removeDrawings': { other: 'Buang {count} lukisan' },
  'menu.settings': 'Tetapan…',
}

import type { Translation } from '../runtime'
import type { menu as source } from '../en/menu'

export const menu: Translation<typeof source> = {
  'menu.resetView': 'Tetapkan semula paparan carta',
  'menu.copyPrice': 'Salin harga {price}',
  'menu.paste': 'Tampal',
  'menu.addAlert': 'Tambah makluman pada {symbol} di {price}…',
  'menu.addOrder': 'Tambah pesanan pada {symbol} di {price}…',
  'menu.sellLimit': 'Jual limit {at}',
  'menu.buyStop': 'Beli henti {at}',
  'menu.buyLimit': 'Beli limit {at}',
  'menu.sellStop': 'Jual henti {at}',
  'menu.removeIndicators': { other: 'Buang {count} penunjuk' },
  'menu.removeDrawings': { other: 'Buang {count} lukisan' },
  'menu.hideMarks': 'Sembunyikan tanda pada bar',
  'menu.settings': 'Tetapan…',
}

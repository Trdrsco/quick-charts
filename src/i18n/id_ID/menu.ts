import type { Translation } from '../runtime'
import type { menu as source } from '../en/menu'

export const menu: Translation<typeof source> = {
  'menu.resetView': 'Reset tampilan chart',
  'menu.copyPrice': 'Salin harga {price}',
  'menu.paste': 'Tempel',
  'menu.addAlert': 'Tambah peringatan pada {symbol} di {price}…',
  'menu.addOrder': 'Tambah order pada {symbol} di {price}…',
  'menu.sellLimit': 'Jual {at} limit',
  'menu.buyStop': 'Beli {at} stop',
  'menu.buyLimit': 'Beli {at} limit',
  'menu.sellStop': 'Jual {at} stop',
  'menu.removeIndicators': { other: 'Hapus {count} indikator' },
  'menu.removeDrawings': { other: 'Hapus {count} gambar' },
  'menu.hideMarks': 'Sembunyikan tanda pada bar',
  'menu.settings': 'Pengaturan…',
}

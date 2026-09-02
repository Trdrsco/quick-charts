import type { Translation } from '../runtime'
import type { menu as source } from '../en/menu'

export const menu: Translation<typeof source> = {
  'menu.resetView': 'Reset tampilan chart',
  'menu.copyPrice': 'Salin harga {price}',
  'menu.paste': 'Tempel',
  'menu.addAlert': 'Tambah peringatan pada {symbol} di {price}…',
  'menu.removeIndicators': { other: 'Hapus {count} indikator' },
  'menu.removeDrawings': { other: 'Hapus {count} gambar' },
  'menu.settings': 'Pengaturan…',
}

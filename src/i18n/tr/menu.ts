import type { Translation } from '../runtime'
import type { menu as source } from '../en/menu'

export const menu: Translation<typeof source> = {
  'menu.resetView': 'Grafik görünümünü sıfırla',
  'menu.copyPrice': '{price} fiyatını kopyala',
  'menu.paste': 'Yapıştır',
  'menu.removeIndicators': { one: '{count} göstergeyi kaldır', other: '{count} göstergeyi kaldır' },
  'menu.removeDrawings': { one: '{count} çizimi kaldır', other: '{count} çizimi kaldır' },
  'menu.settings': 'Ayarlar…',
}

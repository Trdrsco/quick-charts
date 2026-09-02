import type { Translation } from '../runtime'
import type { menu as source } from '../en/menu'

export const menu: Translation<typeof source> = {
  'menu.resetView': 'Grafik görünümünü sıfırla',
  'menu.copyPrice': '{price} fiyatını kopyala',
  'menu.paste': 'Yapıştır',
  'menu.addAlert': '{symbol} için {price} seviyesine uyarı ekle…',
  'menu.addOrder': '{symbol} için {price} seviyesine emir ekle…',
  'menu.sellLimit': '{at} limitten sat',
  'menu.buyStop': '{at} stoptan al',
  'menu.buyLimit': '{at} limitten al',
  'menu.sellStop': '{at} stoptan sat',
  'menu.removeIndicators': { one: '{count} göstergeyi kaldır', other: '{count} göstergeyi kaldır' },
  'menu.removeDrawings': { one: '{count} çizimi kaldır', other: '{count} çizimi kaldır' },
  'menu.hideMarks': 'Barlardaki işaretleri gizle',
  'menu.settings': 'Ayarlar…',
}

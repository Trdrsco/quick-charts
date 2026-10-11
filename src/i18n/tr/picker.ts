import type { Translation } from '../runtime'
import type { picker as source } from '../en/picker'

export const picker: Translation<typeof source> = {
  'picker.title': 'Göstergeler',
  'picker.search': 'Gösterge ara',
  'picker.noMatches': 'Eşleşen gösterge yok.',
  'picker.collections': 'Gösterge koleksiyonları',
  'picker.personal': 'Kişisel',
  'picker.builtin': 'Yerleşik',
  'picker.favorites': 'Favoriler',
  'picker.thousands': ' K',
  'picker.name': 'Ad',
  'picker.author': 'Yazar',
  'picker.favorite': 'Favorilere ekle: {name}',
  'picker.unfavorite': 'Favorilerden kaldır: {name}',
  'picker.loading': 'Göstergeler yükleniyor…',
  'picker.unavailable': 'Gösterge içeriği kullanılamıyor. Yeniden deneyin.',
  'picker.actionFailed': 'İşlem tamamlanamadı. Yeniden deneyin.',
  'picker.add': 'Ekle: {name}',
  'picker.notPermitted': '{name} burada kullanılamıyor',
}

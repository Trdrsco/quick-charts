import type { Translation } from '../runtime'
import type { picker as source } from '../en/picker'

export const picker: Translation<typeof source> = {
  'picker.title': 'Penunjuk',
  'picker.search': 'Cari penunjuk',
  'picker.noMatches': 'Tiada penunjuk yang sepadan.',
  'picker.collections': 'Koleksi penunjuk',
  'picker.personal': 'Peribadi',
  'picker.builtin': 'Terbina dalam',
  'picker.favorites': 'Kegemaran',
  'picker.thousands': ' K',
  'picker.name': 'Nama',
  'picker.author': 'Pengarang',
  'picker.favorite': 'Tambah {name} ke kegemaran',
  'picker.unfavorite': 'Buang {name} daripada kegemaran',
  'picker.loading': 'Memuatkan penunjuk…',
  'picker.unavailable': 'Kandungan penunjuk tidak tersedia. Cuba lagi.',
  'picker.actionFailed': 'Tindakan tidak dapat diselesaikan. Cuba lagi.',
  'picker.add': 'Tambah {name}',
  'picker.notPermitted': '{name} tidak tersedia di sini',
}

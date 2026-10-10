import type { Translation } from '../runtime'
import type { picker as source } from '../en/picker'

export const picker: Translation<typeof source> = {
  'picker.title': 'Indikator',
  'picker.search': 'Cari indikator',
  'picker.noMatches': 'Tidak ada indikator yang cocok.',
  'picker.collections': 'Koleksi indikator',
  'picker.personal': 'Pribadi',
  'picker.builtin': 'Bawaan',
  'picker.favorites': 'Favorit',
  'picker.thousands': ' K',
  'picker.name': 'Nama',
  'picker.author': 'Pembuat',
  'picker.favorite': 'Tambahkan {name} ke favorit',
  'picker.unfavorite': 'Hapus {name} dari favorit',
  'picker.loading': 'Memuat indikator…',
  'picker.unavailable': 'Konten indikator tidak tersedia. Coba lagi.',
  'picker.actionFailed': 'Tindakan tidak dapat diselesaikan. Coba lagi.',
  'picker.add': 'Tambah {name}',
  'picker.notPermitted': '{name} tidak tersedia di sini',
}

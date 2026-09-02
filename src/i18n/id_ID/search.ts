import type { Translation } from '../runtime'
import type { search as source } from '../en/search'

export const search: Translation<typeof source> = {
  'search.title': 'Pencarian simbol',
  'search.compareTitle': 'Bandingkan simbol',
  'search.changeSymbolTitle': 'Ganti simbol',
  'search.placeholder': 'Search symbol',
  'search.clear': 'Bersihkan',
  'search.noMatches': 'Tidak ada simbol yang cocok.',
  'search.loadingMore': 'Memuat lebih banyak…',
  'search.failed': 'Search failed.',
  'search.samePercent': 'Skala % sama',
  'search.newScale': 'Skala harga baru',
  'search.newPane': 'Panel baru',
  'search.added': 'Simbol yang ditambahkan',
  'search.recent': 'Simbol terbaru',
  'search.addedMark': '{symbol} ada di chart. Klik untuk menghapus.',
  'search.compareEmpty': 'No symbols here yet. Why not add some?',
  'search.opDivision': 'Pembagian',
  'search.opSubtraction': 'Pengurangan',
  'search.opAddition': 'Penjumlahan',
  'search.opMultiplication': 'Perkalian',
  'search.opExponentiation': 'Perpangkatan',
  'search.opReciprocal': 'Kebalikan',
  'search.opsHide': 'Sembunyikan operator spread',
  'search.opsShow': 'Tampilkan operator spread',
}

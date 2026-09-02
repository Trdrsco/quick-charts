import type { Translation } from '../runtime'
import type { search as source } from '../en/search'

export const search: Translation<typeof source> = {
  'search.title': 'Carian simbol',
  'search.compareTitle': 'Bandingkan simbol',
  'search.changeSymbolTitle': 'Tukar simbol',
  'search.placeholder': 'Search symbol',
  'search.clear': 'Kosongkan',
  'search.noMatches': 'Tiada simbol yang sepadan.',
  'search.loadingMore': 'Memuatkan lagi…',
  'search.failed': 'Search failed.',
  'search.samePercent': 'Skala % sama',
  'search.newScale': 'Skala harga baharu',
  'search.newPane': 'Anak tetingkap baharu',
  'search.added': 'Simbol ditambah',
  'search.recent': 'Simbol terkini',
  'search.addedMark': '{symbol} ada pada carta. Klik untuk membuang.',
  'search.compareEmpty': 'No symbols here yet. Why not add some?',
  'search.opDivision': 'Pembahagian',
  'search.opSubtraction': 'Penolakan',
  'search.opAddition': 'Penambahan',
  'search.opMultiplication': 'Pendaraban',
  'search.opExponentiation': 'Pengeksponenan',
  'search.opReciprocal': 'Salingan',
  'search.opsHide': 'Sembunyi operator spread',
  'search.opsShow': 'Tunjuk operator spread',
}

import type { Translation } from '../runtime'
import type { search as source } from '../en/search'

export const search: Translation<typeof source> = {
  'search.title': 'Sembol arama',
  'search.compareTitle': 'Sembolleri karşılaştır',
  'search.changeSymbolTitle': 'Sembolü değiştir',
  'search.placeholder': 'Search symbol',
  'search.clear': 'Temizle',
  'search.noMatches': 'Eşleşen sembol yok.',
  'search.loadingMore': 'Daha fazla yükleniyor…',
  'search.failed': 'Search failed.',
  'search.samePercent': 'Aynı % ölçeği',
  'search.newScale': 'Yeni fiyat ölçeği',
  'search.newPane': 'Yeni bölme',
  'search.added': 'Eklenen semboller',
  'search.recent': 'Son semboller',
  'search.addedMark': '{symbol} grafikte. Kaldırmak için tıklayın.',
  'search.compareEmpty': 'No symbols here yet. Why not add some?',
  'search.opDivision': 'Bölme',
  'search.opSubtraction': 'Çıkarma',
  'search.opAddition': 'Toplama',
  'search.opMultiplication': 'Çarpma',
  'search.opExponentiation': 'Üs alma',
  'search.opReciprocal': 'Ters çevirme',
  'search.opsHide': 'Spread operatörlerini gizle',
  'search.opsShow': 'Spread operatörlerini göster',
}

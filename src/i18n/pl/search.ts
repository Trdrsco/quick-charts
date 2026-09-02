import type { Translation } from '../runtime'
import type { search as source } from '../en/search'

export const search: Translation<typeof source> = {
  'search.title': 'Szukaj symbolu',
  'search.compareTitle': 'Porównaj symbole',
  'search.changeSymbolTitle': 'Zmień symbol',
  'search.placeholder': 'Search symbol',
  'search.clear': 'Wyczyść',
  'search.noMatches': 'Brak pasujących symboli.',
  'search.loadingMore': 'Wczytywanie kolejnych…',
  'search.failed': 'Search failed.',
  'search.samePercent': 'Ta sama skala %',
  'search.newScale': 'Nowa skala cen',
  'search.newPane': 'Nowy panel',
  'search.added': 'Dodane symbole',
  'search.recent': 'Ostatnie symbole',
  'search.addedMark': '{symbol} jest na wykresie. Kliknij, aby usunąć.',
  'search.compareEmpty': 'No symbols here yet. Why not add some?',
  'search.opDivision': 'Dzielenie',
  'search.opSubtraction': 'Odejmowanie',
  'search.opAddition': 'Dodawanie',
  'search.opMultiplication': 'Mnożenie',
  'search.opExponentiation': 'Potęgowanie',
  'search.opReciprocal': 'Odwrotność',
  'search.opsHide': 'Ukryj operatory spreadu',
  'search.opsShow': 'Pokaż operatory spreadu',
}

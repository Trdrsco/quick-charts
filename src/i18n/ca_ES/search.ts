import type { Translation } from '../runtime'
import type { search as source } from '../en/search'

export const search: Translation<typeof source> = {
  'search.title': 'Cerca de símbols',
  'search.compareTitle': 'Compara símbols',
  'search.changeSymbolTitle': 'Canvia el símbol',
  'search.placeholder': 'Search symbol',
  'search.clear': 'Esborra',
  'search.noMatches': 'Cap símbol coincident.',
  'search.loadingMore': 'S’estan carregant més…',
  'search.failed': 'Search failed.',
  'search.samePercent': 'Mateixa escala %',
  'search.newScale': 'Nova escala de preus',
  'search.newPane': 'Nou panell',
  'search.added': 'Símbols afegits',
  'search.recent': 'Símbols recents',
  'search.addedMark': '{symbol} és al gràfic. Fes clic per eliminar-lo.',
  'search.compareEmpty': 'No symbols here yet. Why not add some?',
  'search.opDivision': 'Divisió',
  'search.opSubtraction': 'Resta',
  'search.opAddition': 'Suma',
  'search.opMultiplication': 'Multiplicació',
  'search.opExponentiation': 'Exponenciació',
  'search.opReciprocal': 'Recíproc',
  'search.opsHide': 'Amaga els operadors de spread',
  'search.opsShow': 'Mostra els operadors de spread',
}

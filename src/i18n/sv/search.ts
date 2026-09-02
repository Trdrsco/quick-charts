import type { Translation } from '../runtime'
import type { search as source } from '../en/search'

export const search: Translation<typeof source> = {
  'search.title': 'Symbolsökning',
  'search.compareTitle': 'Jämför symboler',
  'search.changeSymbolTitle': 'Byt symbol',
  'search.placeholder': 'Search symbol',
  'search.clear': 'Rensa',
  'search.noMatches': 'Inga matchande symboler.',
  'search.loadingMore': 'Laddar mer…',
  'search.failed': 'Search failed.',
  'search.samePercent': 'Samma %-skala',
  'search.newScale': 'Ny prisskala',
  'search.newPane': 'Ny ruta',
  'search.added': 'Tillagda symboler',
  'search.recent': 'Senaste symboler',
  'search.addedMark': '{symbol} finns på diagrammet. Klicka för att ta bort.',
  'search.compareEmpty': 'No symbols here yet. Why not add some?',
  'search.opDivision': 'Division',
  'search.opSubtraction': 'Subtraktion',
  'search.opAddition': 'Addition',
  'search.opMultiplication': 'Multiplikation',
  'search.opExponentiation': 'Exponentiering',
  'search.opReciprocal': 'Reciprok',
  'search.opsHide': 'Dölj spreadoperatorer',
  'search.opsShow': 'Visa spreadoperatorer',
}

import type { Translation } from '../runtime'
import type { search as source } from '../en/search'

export const search: Translation<typeof source> = {
  'search.title': 'Symbolsuche',
  'search.compareTitle': 'Symbole vergleichen',
  'search.changeSymbolTitle': 'Symbol wechseln',
  'search.placeholder': 'Search symbol',
  'search.clear': 'Leeren',
  'search.noMatches': 'Keine passenden Symbole.',
  'search.loadingMore': 'Weitere werden geladen…',
  'search.failed': 'Search failed.',
  'search.samePercent': 'Gleiche %-Skala',
  'search.newScale': 'Neue Preisskala',
  'search.newPane': 'Neuer Bereich',
  'search.added': 'Hinzugefügte Symbole',
  'search.recent': 'Zuletzt verwendete Symbole',
  'search.addedMark': '{symbol} ist im Chart. Zum Entfernen klicken.',
  'search.compareEmpty': 'No symbols here yet. Why not add some?',
  'search.opDivision': 'Division',
  'search.opSubtraction': 'Subtraktion',
  'search.opAddition': 'Addition',
  'search.opMultiplication': 'Multiplikation',
  'search.opExponentiation': 'Potenzierung',
  'search.opReciprocal': 'Kehrwert',
  'search.opsHide': 'Spread-Operatoren ausblenden',
  'search.opsShow': 'Spread-Operatoren anzeigen',
}

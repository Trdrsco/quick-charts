import type { Translation } from '../runtime'
import type { search as source } from '../en/search'

export const search: Translation<typeof source> = {
  'search.title': 'Recherche de symbole',
  'search.compareTitle': 'Comparer des symboles',
  'search.changeSymbolTitle': 'Changer de symbole',
  'search.placeholder': 'Search symbol',
  'search.clear': 'Effacer',
  'search.noMatches': 'Aucun symbole correspondant.',
  'search.loadingMore': 'Chargement…',
  'search.failed': 'Search failed.',
  'search.samePercent': 'Même échelle %',
  'search.newScale': 'Nouvelle échelle de prix',
  'search.newPane': 'Nouveau volet',
  'search.added': 'Symboles ajoutés',
  'search.recent': 'Symboles récents',
  'search.addedMark': '{symbol} est sur le graphique. Cliquez pour le retirer.',
  'search.compareEmpty': 'No symbols here yet. Why not add some?',
  'search.opDivision': 'Division',
  'search.opSubtraction': 'Soustraction',
  'search.opAddition': 'Addition',
  'search.opMultiplication': 'Multiplication',
  'search.opExponentiation': 'Exponentiation',
  'search.opReciprocal': 'Inverse',
  'search.opsHide': 'Masquer les opérateurs de spread',
  'search.opsShow': 'Afficher les opérateurs de spread',
}

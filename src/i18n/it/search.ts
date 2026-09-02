import type { Translation } from '../runtime'
import type { search as source } from '../en/search'

export const search: Translation<typeof source> = {
  'search.title': 'Ricerca simboli',
  'search.compareTitle': 'Confronta simboli',
  'search.changeSymbolTitle': 'Cambia simbolo',
  'search.placeholder': 'Search symbol',
  'search.clear': 'Cancella',
  'search.noMatches': 'Nessun simbolo corrispondente.',
  'search.loadingMore': 'Caricamento…',
  'search.failed': 'Search failed.',
  'search.samePercent': 'Stessa scala %',
  'search.newScale': 'Nuova scala dei prezzi',
  'search.newPane': 'Nuovo riquadro',
  'search.added': 'Simboli aggiunti',
  'search.recent': 'Simboli recenti',
  'search.addedMark': '{symbol} è sul grafico. Clicca per rimuoverlo.',
  'search.compareEmpty': 'No symbols here yet. Why not add some?',
  'search.opDivision': 'Divisione',
  'search.opSubtraction': 'Sottrazione',
  'search.opAddition': 'Addizione',
  'search.opMultiplication': 'Moltiplicazione',
  'search.opExponentiation': 'Elevamento a potenza',
  'search.opReciprocal': 'Reciproco',
  'search.opsHide': 'Nascondi operatori spread',
  'search.opsShow': 'Mostra operatori spread',
}

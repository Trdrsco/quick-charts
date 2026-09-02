import type { Translation } from '../runtime'
import type { search as source } from '../en/search'

export const search: Translation<typeof source> = {
  'search.title': 'Búsqueda de símbolos',
  'search.compareTitle': 'Comparar símbolos',
  'search.changeSymbolTitle': 'Cambiar símbolo',
  'search.placeholder': 'Search symbol',
  'search.clear': 'Borrar',
  'search.noMatches': 'Ningún símbolo coincide.',
  'search.loadingMore': 'Cargando más…',
  'search.failed': 'Search failed.',
  'search.samePercent': 'Misma escala %',
  'search.newScale': 'Nueva escala de precios',
  'search.newPane': 'Nuevo panel',
  'search.added': 'Símbolos añadidos',
  'search.recent': 'Símbolos recientes',
  'search.addedMark': '{symbol} está en el gráfico. Haz clic para quitarlo.',
  'search.compareEmpty': 'No symbols here yet. Why not add some?',
  'search.opDivision': 'División',
  'search.opSubtraction': 'Resta',
  'search.opAddition': 'Suma',
  'search.opMultiplication': 'Multiplicación',
  'search.opExponentiation': 'Exponenciación',
  'search.opReciprocal': 'Recíproco',
  'search.opsHide': 'Ocultar operadores de spread',
  'search.opsShow': 'Mostrar operadores de spread',
}

import type { Translation } from '../runtime'
import type { search as source } from '../en/search'

export const search: Translation<typeof source> = {
  'search.title': 'חיפוש סימבול',
  'search.compareTitle': 'השוואת סימבולים',
  'search.changeSymbolTitle': 'שינוי סימבול',
  'search.placeholder': 'Search symbol',
  'search.clear': 'ניקוי',
  'search.noMatches': 'לא נמצאו סימבולים מתאימים.',
  'search.loadingMore': 'טוען עוד…',
  'search.failed': 'Search failed.',
  'search.samePercent': 'אותו סולם %',
  'search.newScale': 'סולם מחיר חדש',
  'search.newPane': 'חלונית חדשה',
  'search.added': 'סימבולים שנוספו',
  'search.recent': 'סימבולים אחרונים',
  'search.addedMark': '{symbol} נמצא בגרף. לחצו להסרה.',
  'search.compareEmpty': 'No symbols here yet. Why not add some?',
  'search.opDivision': 'חילוק',
  'search.opSubtraction': 'חיסור',
  'search.opAddition': 'חיבור',
  'search.opMultiplication': 'כפל',
  'search.opExponentiation': 'חזקה',
  'search.opReciprocal': 'הופכי',
  'search.opsHide': 'הסתרת אופרטורי ספרד',
  'search.opsShow': 'הצגת אופרטורי ספרד',
}

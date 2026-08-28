import type { Translation } from '@trdrs/i18n'
import type { legend as source } from '../en/legend'

export const legend: Translation<typeof source> = {
  'legend.indicatorSettings': 'הגדרות אינדיקטור',
  'legend.restorePane': 'שחזור חלונית',
  'legend.collapsePane': 'כיווץ חלונית',
  'legend.maximizePane': 'הגדלת חלונית',
  'legend.showIndicator': 'הצגת אינדיקטור',
  'legend.hideIndicator': 'הסתרת אינדיקטור',
  'legend.priceScale': 'סולם מחירים: {mode}',
  'legend.scaleNormal': 'רגיל',
  'legend.scaleLog': 'לוג',
  'legend.scalePercent': '%',
  'legend.scaleIndexed': '100',
  'legend.compare': 'השוואה או הוספה של סימבול',
  'legend.compareTitle': 'השוואת סימבולים',
  'legend.changeSymbol': 'שינוי סימבול',
  'legend.samePercent': 'אותו סולם %',
  'legend.newScale': 'סולם מחיר חדש',
  'legend.newPane': 'חלונית חדשה',
  'legend.added': 'סימבולים שנוספו',
  'legend.removeCompare': 'הסרת ההשוואה',
  'legend.searchPlaceholder': 'סימבול',
}

import type { Translation } from '../runtime'
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
  'legend.changeSymbol': 'שינוי סימבול',
  'legend.removeCompare': 'הסרת ההשוואה',
}

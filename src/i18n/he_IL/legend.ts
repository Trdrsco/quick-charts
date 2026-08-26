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
}

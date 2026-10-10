import type { Translation } from '../runtime'
import type { legend as source } from '../en/legend'

export const legend: Translation<typeof source> = {
  'legend.open': 'פתיחה',
  'legend.high': 'גבוה',
  'legend.low': 'נמוך',
  'legend.close': 'סגירה',
  'legend.change': '{change} ({percent}%)',
  'legend.volume': 'מחזור',
  'legend.indicatorSettings': 'הגדרות אינדיקטור',
  'legend.showRows': 'הצגת שורות האינדיקטורים',
  'legend.hideRows': 'הסתרת שורות האינדיקטורים',
  'legend.restorePane': 'שחזור חלונית',
  'legend.collapsePane': 'כיווץ חלונית',
  'legend.maximizePane': 'הגדלת חלונית',
  'legend.movePaneUp': 'Move pane up',
  'legend.movePaneDown': 'Move pane down',
  'legend.showIndicator': 'הצגת אינדיקטור',
  'legend.hideIndicator': 'הסתרת אינדיקטור',
  'legend.scaleNormal': 'רגיל',
  'legend.scaleLog': 'לוג',
  'legend.scalePercent': '%',
  'legend.scaleIndexed': '100',
  'legend.changeSymbol': 'שינוי סימבול',
  'legend.removeCompare': 'הסרת ההשוואה',
  'legend.removeIndicator': 'הסרת אינדיקטור',
}

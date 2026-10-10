import type { Translation } from '../runtime'
import type { legend as source } from '../en/legend'

export const legend: Translation<typeof source> = {
  'legend.open': 'O',
  'legend.high': 'H',
  'legend.low': 'L',
  'legend.close': 'C',
  'legend.change': '{change} ({percent}%)',
  'legend.volume': 'Vol',
  'legend.indicatorSettings': 'הגדרות אינדיקטור',
  'legend.showRows': 'הצגת שורות האינדיקטורים',
  'legend.hideRows': 'הסתרת שורות האינדיקטורים',
  'legend.restorePane': 'שחזור חלונית',
  'legend.collapsePane': 'כיווץ חלונית',
  'legend.maximizePane': 'הגדלת חלונית',
  'legend.showIndicator': 'הצגת אינדיקטור',
  'legend.hideIndicator': 'הסתרת אינדיקטור',
  'legend.scaleNormal': 'רגיל',
  'legend.scaleLog': 'לוג',
  'legend.scalePercent': '%',
  'legend.scaleIndexed': '100',
  'legend.changeSymbol': 'שינוי סימבול',
  'legend.removeCompare': 'הסרת ההשוואה',
  'legend.removeIndicator': 'Remove indicator',
}

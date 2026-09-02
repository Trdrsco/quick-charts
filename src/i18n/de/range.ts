import type { Translation } from '../runtime'
import type { range as source } from '../en/range'

export const range: Translation<typeof source> = {
  'range.oneDay': '1 Tag',
  'range.fiveDays': '5 Tage',
  'range.oneMonth': '1 Monat',
  'range.threeMonths': '3 Monate',
  'range.sixMonths': '6 Monate',
  'range.yearToDate': 'Seit Jahresbeginn',
  'range.oneYear': '1 Jahr',
  'range.fiveYears': '5 Jahre',
  'range.all': 'Alle Daten',
  'range.tip': '{range} · {interval}-Balken',
  'range.zoomIn': 'Vergrößern',
  'range.zoomOut': 'Verkleinern',
  'range.scrollLeft': 'Nach links scrollen',
  'range.scrollRight': 'Nach rechts scrollen',
  'range.reset': 'Chartansicht zurücksetzen',
}

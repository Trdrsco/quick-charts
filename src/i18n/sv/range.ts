import type { Translation } from '../runtime'
import type { range as source } from '../en/range'

export const range: Translation<typeof source> = {
  'range.oneDay': '1 dag',
  'range.fiveDays': '5 dagar',
  'range.oneMonth': '1 månad',
  'range.threeMonths': '3 månader',
  'range.sixMonths': '6 månader',
  'range.yearToDate': 'Hittills i år',
  'range.oneYear': '1 år',
  'range.fiveYears': '5 år',
  'range.all': 'Alla data',
  'range.tip': '{range} · {interval} staplar',
  'range.zoomIn': 'Zooma in',
  'range.zoomOut': 'Zooma ut',
  'range.scrollLeft': 'Rulla vänster',
  'range.scrollRight': 'Rulla höger',
  'range.reset': 'Återställ diagramvyn',
}

import type { Translation } from '../runtime'
import type { range as source } from '../en/range'

export const range: Translation<typeof source> = {
  'range.oneDay': '1 dia',
  'range.fiveDays': '5 dies',
  'range.oneMonth': '1 mes',
  'range.threeMonths': '3 mesos',
  'range.sixMonths': '6 mesos',
  'range.yearToDate': 'Any en curs',
  'range.oneYear': '1 any',
  'range.fiveYears': '5 anys',
  'range.all': 'Totes les dades',
  'range.tip': '{range} · barres de {interval}',
  'range.zoomIn': 'Amplia',
  'range.zoomOut': 'Redueix',
  'range.scrollLeft': 'Desplaça a l’esquerra',
  'range.scrollRight': 'Desplaça a la dreta',
  'range.reset': 'Restableix la vista del gràfic',
}

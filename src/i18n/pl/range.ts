import type { Translation } from '../runtime'
import type { range as source } from '../en/range'

export const range: Translation<typeof source> = {
  'range.oneDay': '1 dzień',
  'range.fiveDays': '5 dni',
  'range.oneMonth': '1 miesiąc',
  'range.threeMonths': '3 miesiące',
  'range.sixMonths': '6 miesięcy',
  'range.yearToDate': 'Od początku roku',
  'range.oneYear': '1 rok',
  'range.fiveYears': '5 lat',
  'range.all': 'Wszystkie dane',
  'range.tip': '{range} · słupki {interval}',
  'range.zoomIn': 'Przybliż',
  'range.zoomOut': 'Oddal',
  'range.scrollLeft': 'Przewiń w lewo',
  'range.scrollRight': 'Przewiń w prawo',
  'range.reset': 'Zresetuj widok wykresu',
}

import type { Translation } from '../runtime'
import type { range as source } from '../en/range'

export const range: Translation<typeof source> = {
  'range.oneDay': '1 gün',
  'range.fiveDays': '5 gün',
  'range.oneMonth': '1 ay',
  'range.threeMonths': '3 ay',
  'range.sixMonths': '6 ay',
  'range.yearToDate': 'Yıl başından bugüne',
  'range.oneYear': '1 yıl',
  'range.fiveYears': '5 yıl',
  'range.all': 'Tüm veriler',
  'range.tip': '{range} · {interval} bar',
  'range.zoomIn': 'Yakınlaştır',
  'range.zoomOut': 'Uzaklaştır',
  'range.scrollLeft': 'Sola kaydır',
  'range.scrollRight': 'Sağa kaydır',
  'range.reset': 'Grafik görünümünü sıfırla',
}

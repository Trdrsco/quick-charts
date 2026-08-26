import type { Translation } from '@trdrs/i18n'
import type { legend as source } from '../en/legend'

export const legend: Translation<typeof source> = {
  'legend.indicatorSettings': 'การตั้งค่าอินดิเคเตอร์',
  'legend.restorePane': 'คืนขนาดแผงกราฟ',
  'legend.collapsePane': 'ย่อแผงกราฟ',
  'legend.maximizePane': 'ขยายแผงกราฟเต็มพื้นที่',
  'legend.showIndicator': 'แสดงอินดิเคเตอร์',
  'legend.hideIndicator': 'ซ่อนอินดิเคเตอร์',
  'legend.priceScale': 'สเกลราคา: {mode}',
  'legend.scaleNormal': 'ปกติ',
  'legend.scaleLog': 'ล็อก',
  'legend.scalePercent': '%',
  'legend.scaleIndexed': '100',
}

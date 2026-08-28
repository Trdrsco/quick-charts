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
  'legend.compare': 'เปรียบเทียบหรือเพิ่มสัญลักษณ์',
  'legend.compareTitle': 'เปรียบเทียบสัญลักษณ์',
  'legend.changeSymbol': 'เปลี่ยนสัญลักษณ์',
  'legend.samePercent': 'สเกล % เดียวกัน',
  'legend.newScale': 'สเกลราคาใหม่',
  'legend.newPane': 'แผงใหม่',
  'legend.added': 'สัญลักษณ์ที่เพิ่ม',
  'legend.removeCompare': 'นำการเปรียบเทียบออก',
  'legend.searchPlaceholder': 'สัญลักษณ์',
}

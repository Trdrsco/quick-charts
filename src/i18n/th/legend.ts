import type { Translation } from '../runtime'
import type { legend as source } from '../en/legend'

export const legend: Translation<typeof source> = {
  'legend.open': 'เปิด',
  'legend.high': 'สูง',
  'legend.low': 'ต่ำ',
  'legend.close': 'ปิด',
  'legend.change': '{change} ({percent}%)',
  'legend.volume': 'ปริมาณ',
  'legend.indicatorSettings': 'การตั้งค่าอินดิเคเตอร์',
  'legend.showRows': 'แสดงแถวอินดิเคเตอร์',
  'legend.hideRows': 'ซ่อนแถวอินดิเคเตอร์',
  'legend.restorePane': 'คืนขนาดแผงกราฟ',
  'legend.collapsePane': 'ย่อแผงกราฟ',
  'legend.maximizePane': 'ขยายแผงกราฟเต็มพื้นที่',
  'legend.movePaneUp': 'ย้ายแผงขึ้น',
  'legend.movePaneDown': 'ย้ายแผงลง',
  'legend.showIndicator': 'แสดงอินดิเคเตอร์',
  'legend.hideIndicator': 'ซ่อนอินดิเคเตอร์',
  'legend.scaleNormal': 'ปกติ',
  'legend.scaleLog': 'ล็อก',
  'legend.scalePercent': '%',
  'legend.scaleIndexed': '100',
  'legend.changeSymbol': 'เปลี่ยนสัญลักษณ์',
  'legend.removeCompare': 'นำการเปรียบเทียบออก',
  'legend.removeIndicator': 'นำอินดิเคเตอร์ออก',
}

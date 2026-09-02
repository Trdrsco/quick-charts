import type { Translation } from '../runtime'
import type { range as source } from '../en/range'

export const range: Translation<typeof source> = {
  'range.oneDay': '1 วัน',
  'range.fiveDays': '5 วัน',
  'range.oneMonth': '1 เดือน',
  'range.threeMonths': '3 เดือน',
  'range.sixMonths': '6 เดือน',
  'range.yearToDate': 'ตั้งแต่ต้นปี',
  'range.oneYear': '1 ปี',
  'range.fiveYears': '5 ปี',
  'range.all': 'ข้อมูลทั้งหมด',
  'range.tip': '{range} · แท่ง {interval}',
  'range.zoomIn': 'ขยาย',
  'range.zoomOut': 'ย่อ',
  'range.scrollLeft': 'เลื่อนไปทางซ้าย',
  'range.scrollRight': 'เลื่อนไปทางขวา',
  'range.reset': 'รีเซ็ตมุมมองกราฟ',
}

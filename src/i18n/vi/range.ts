import type { Translation } from '../runtime'
import type { range as source } from '../en/range'

export const range: Translation<typeof source> = {
  'range.oneDay': '1 ngày',
  'range.fiveDays': '5 ngày',
  'range.oneMonth': '1 tháng',
  'range.threeMonths': '3 tháng',
  'range.sixMonths': '6 tháng',
  'range.yearToDate': 'Từ đầu năm',
  'range.oneYear': '1 năm',
  'range.fiveYears': '5 năm',
  'range.all': 'Toàn bộ dữ liệu',
  'range.tip': '{range} · nến {interval}',
  'range.zoomIn': 'Phóng to',
  'range.zoomOut': 'Thu nhỏ',
  'range.scrollLeft': 'Cuộn sang trái',
  'range.scrollRight': 'Cuộn sang phải',
  'range.reset': 'Đặt lại khung nhìn biểu đồ',
}

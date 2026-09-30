import type { Translation } from '../runtime'
import type { legend as source } from '../en/legend'

export const legend: Translation<typeof source> = {
  'legend.open': 'O',
  'legend.high': 'H',
  'legend.low': 'L',
  'legend.close': 'C',
  'legend.change': '{change} ({percent}%)',
  'legend.indicatorSettings': 'Cài đặt chỉ báo',
  'legend.showRows': 'Show study rows',
  'legend.hideRows': 'Hide study rows',
  'legend.restorePane': 'Khôi phục khung',
  'legend.collapsePane': 'Thu gọn khung',
  'legend.maximizePane': 'Mở rộng khung',
  'legend.showIndicator': 'Hiện chỉ báo',
  'legend.hideIndicator': 'Ẩn chỉ báo',
  'legend.scaleNormal': 'Thường',
  'legend.scaleLog': 'Log',
  'legend.scalePercent': '%',
  'legend.scaleIndexed': '100',
  'legend.changeSymbol': 'Thay đổi mã',
  'legend.removeCompare': 'Xóa so sánh',
  'legend.removeIndicator': 'Remove indicator',
}

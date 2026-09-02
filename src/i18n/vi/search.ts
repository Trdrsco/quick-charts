import type { Translation } from '../runtime'
import type { search as source } from '../en/search'

export const search: Translation<typeof source> = {
  'search.title': 'Tìm mã',
  'search.compareTitle': 'So sánh mã',
  'search.changeSymbolTitle': 'Thay đổi mã',
  'search.placeholder': 'Search symbol',
  'search.clear': 'Xóa',
  'search.noMatches': 'Không có mã nào khớp.',
  'search.loadingMore': 'Đang tải thêm…',
  'search.failed': 'Search failed.',
  'search.samePercent': 'Cùng thang %',
  'search.newScale': 'Thang giá mới',
  'search.newPane': 'Khung mới',
  'search.added': 'Mã đã thêm',
  'search.recent': 'Mã gần đây',
  'search.addedMark': '{symbol} đang trên biểu đồ. Nhấp để xóa.',
  'search.compareEmpty': 'No symbols here yet. Why not add some?',
  'search.opDivision': 'Phép chia',
  'search.opSubtraction': 'Phép trừ',
  'search.opAddition': 'Phép cộng',
  'search.opMultiplication': 'Phép nhân',
  'search.opExponentiation': 'Lũy thừa',
  'search.opReciprocal': 'Nghịch đảo',
  'search.opsHide': 'Ẩn toán tử spread',
  'search.opsShow': 'Hiện toán tử spread',
}

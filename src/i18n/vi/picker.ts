import type { Translation } from '../runtime'
import type { picker as source } from '../en/picker'

export const picker: Translation<typeof source> = {
  'picker.title': 'Chỉ báo',
  'picker.search': 'Tìm chỉ báo',
  'picker.noMatches': 'Không có chỉ báo phù hợp.',
  'picker.collections': 'Bộ sưu tập chỉ báo',
  'picker.personal': 'Cá nhân',
  'picker.builtin': 'Tích hợp sẵn',
  'picker.favorites': 'Yêu thích',
  'picker.thousands': ' K',
  'picker.name': 'Tên',
  'picker.author': 'Tác giả',
  'picker.favorite': 'Thêm {name} vào mục yêu thích',
  'picker.unfavorite': 'Xóa {name} khỏi mục yêu thích',
  'picker.loading': 'Đang tải chỉ báo…',
  'picker.unavailable': 'Nội dung chỉ báo không khả dụng. Hãy thử lại.',
  'picker.actionFailed': 'Không thể hoàn tất thao tác. Hãy thử lại.',
  'picker.add': 'Thêm {name}',
  'picker.notPermitted': '{name} không khả dụng ở đây',
}

import type { Translation } from '../runtime'
import type { toast as source } from '../en/toast'

export const toast: Translation<typeof source> = {
  'toast.dismiss': 'Đóng',
  'toast.feedUnavailable': 'Không có dữ liệu cho {symbol} từ nguồn này.',
  'toast.feedNoData': 'Chưa có dữ liệu cho {symbol}.',
  'toast.imageCopyFallback': 'Không thể sao chép hình ảnh. Đã lưu một tệp thay thế.',
  'toast.imageFailed': 'Không thể chụp hình ảnh biểu đồ.',
  'toast.indicatorsNotCarried': { other: '{count} chỉ báo trong biểu đồ đã lưu này không khả dụng ở đây và đã bị bỏ qua.' },
}

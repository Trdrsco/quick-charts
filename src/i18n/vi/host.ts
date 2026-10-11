import type { Translation } from '../runtime'
import type { host as source } from '../en/host'

export const host: Translation<typeof source> = {
  'host.noVolume': 'Nguồn dữ liệu này không có khối lượng',
  'host.saveConflict': 'Đã được lưu ở nơi khác kể từ khi bạn mở. Hãy tải phiên bản mới hơn trước khi lưu.',
  'host.saveNotFound': 'Mục này đã bị xóa ở nơi khác. Hãy lưu lại dưới dạng mục mới.',
  'host.loadInvalid': 'Không thể mở mục này. Không có gì trên màn hình thay đổi.',
  'host.loadUnavailable': 'Không thể truy cập công việc đã lưu của bạn. Không có gì trên màn hình thay đổi.',
  'host.loadNotRestored': 'Không thể mở mục này, và cũng không thể khôi phục nội dung trước đó trên màn hình. Biểu đồ sẽ không lưu cho đến khi bạn mở một biểu đồ hoặc bố cục đã lưu. Hãy lưu một bản sao trước để giữ nội dung trên màn hình.',
  'host.notSaving': 'Biểu đồ không lưu. Hãy mở một biểu đồ hoặc bố cục đã lưu để bắt đầu từ một trạng thái đã biết. Lưu một bản sao sẽ giữ nội dung trên màn hình, nhưng biểu đồ vẫn sẽ không lưu.',
}

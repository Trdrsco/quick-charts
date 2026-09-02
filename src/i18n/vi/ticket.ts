import type { Translation } from '../runtime'
import type { ticket as source } from '../en/ticket'

export const ticket: Translation<typeof source> = {
  'ticket.typeMarket': 'Thị trường',
  'ticket.typeLimit': 'Giới hạn',
  'ticket.typeStop': 'Dừng',
  'ticket.typeStopLimit': 'Dừng giới hạn',
  'ticket.noAccount': 'Chưa chọn tài khoản — kết nối một tài khoản để đặt lệnh.',
  'ticket.locked': 'Tài khoản này đang bị khóa giao dịch.',
  'ticket.needsPrice': 'Lệnh cần có giá.',
  'ticket.cannotPlace': 'Tích hợp này không đặt được lệnh.',
  'ticket.placedBuy': 'Đã đặt lệnh mua {qty} {type}',
  'ticket.placedSell': 'Đã đặt lệnh bán {qty} {type}',
}

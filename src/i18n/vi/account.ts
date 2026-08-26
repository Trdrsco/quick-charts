import type { Translation } from '@trdrs/i18n'
import type { account as source } from '../en/account'

export const account: Translation<typeof source> = {
  'account.positions': 'Vị thế',
  'account.orders': 'Lệnh',
  'account.positionsCount': 'Vị thế ({count})',
  'account.ordersCount': 'Lệnh ({count})',
  'account.noPositions': 'Không có vị thế đang mở',
  'account.noOrders': 'Không có lệnh đang chờ',
  'account.long': 'Mua {qty}',
  'account.short': 'Bán {qty}',
  'account.close': 'Đóng',
  'account.closeTitle': 'Đóng {instrument} theo giá thị trường',
  'account.reverse': 'Đảo chiều',
  'account.reverseTitle': 'Đảo chiều {instrument}',
  'account.reversed': { other: 'Đã đảo chiều {instrument} (đã hủy {count} lệnh)' },
  'account.buy': 'Mua {qty} {type}',
  'account.sell': 'Bán {qty} {type}',
  'account.cancel': 'Hủy',
  'account.cancelTitle': 'Hủy {id}',
}

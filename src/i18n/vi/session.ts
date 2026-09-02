import type { Translation } from '../runtime'
import type { session as source } from '../en/session'

export const session: Translation<typeof source> = {
  'session.pre': 'Trước giờ mở cửa',
  'session.open': 'Đang mở cửa',
  'session.extended': 'Extended hours',
  'session.after': 'Sau giờ đóng cửa',
  'session.closed': 'Đã đóng cửa',
}

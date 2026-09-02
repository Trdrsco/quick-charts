import type { Translation } from '../runtime'
import type { session as source } from '../en/session'

export const session: Translation<typeof source> = {
  'session.pre': 'ก่อนเปิดตลาด',
  'session.open': 'ตลาดเปิด',
  'session.eth': 'ซื้อขายทางอิเล็กทรอนิกส์',
  'session.after': 'หลังปิดตลาด',
  'session.closed': 'ตลาดปิด',
}

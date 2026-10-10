import type { Translation } from '../runtime'
import type { session as source } from '../en/session'

export const session: Translation<typeof source> = {
  'session.pre': 'ก่อนเปิดตลาด',
  'session.open': 'ตลาดเปิด',
  'session.extended': 'ชั่วโมงซื้อขายขยาย',
  'session.after': 'หลังปิดตลาด',
  'session.closed': 'ตลาดปิด',
}

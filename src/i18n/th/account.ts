import type { Translation } from '@trdrs/i18n'
import type { account as source } from '../en/account'

export const account: Translation<typeof source> = {
  'account.positions': 'โพซิชัน',
  'account.orders': 'คำสั่ง',
  'account.positionsCount': 'โพซิชัน ({count})',
  'account.ordersCount': 'คำสั่ง ({count})',
  'account.noPositions': 'ไม่มีโพซิชันที่เปิดอยู่',
  'account.noOrders': 'ไม่มีคำสั่งที่รอดำเนินการ',
  'account.long': 'ลอง {qty}',
  'account.short': 'ชอร์ต {qty}',
  'account.close': 'ปิด',
  'account.closeTitle': 'ปิด {instrument} ที่ราคาตลาด',
  'account.reverse': 'กลับฝั่ง',
  'account.reverseTitle': 'กลับฝั่ง {instrument}',
  'account.reversed': { other: 'กลับฝั่ง {instrument} แล้ว (ยกเลิก {count} คำสั่ง)' },
  'account.buy': 'ซื้อ {qty} {type}',
  'account.sell': 'ขาย {qty} {type}',
  'account.cancel': 'ยกเลิก',
  'account.cancelTitle': 'ยกเลิก {id}',
}

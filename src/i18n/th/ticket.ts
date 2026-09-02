import type { Translation } from '../runtime'
import type { ticket as source } from '../en/ticket'

export const ticket: Translation<typeof source> = {
  'ticket.typeMarket': 'มาร์เก็ต',
  'ticket.typeLimit': 'ลิมิต',
  'ticket.typeStop': 'สต็อป',
  'ticket.typeStopLimit': 'สต็อปลิมิต',
  'ticket.noAccount': 'ยังไม่ได้เลือกบัญชี — เชื่อมต่อบัญชีเพื่อส่งคำสั่ง',
  'ticket.locked': 'บัญชีนี้ถูกล็อกการเทรดอยู่',
  'ticket.needsPrice': 'คำสั่งนี้ต้องระบุราคา',
  'ticket.cannotPlace': 'การเชื่อมต่อนี้ไม่รองรับการส่งคำสั่ง',
  'ticket.placedBuy': 'ส่งคำสั่งซื้อ {qty} {type} แล้ว',
  'ticket.placedSell': 'ส่งคำสั่งขาย {qty} {type} แล้ว',
}

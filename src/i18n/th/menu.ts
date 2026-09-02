import type { Translation } from '../runtime'
import type { menu as source } from '../en/menu'

export const menu: Translation<typeof source> = {
  'menu.resetView': 'รีเซ็ตมุมมองกราฟ',
  'menu.copyPrice': 'คัดลอกราคา {price}',
  'menu.paste': 'วาง',
  'menu.addAlert': 'เพิ่มการแจ้งเตือน {symbol} ที่ {price}…',
  'menu.addOrder': 'เพิ่มคำสั่ง {symbol} ที่ {price}…',
  'menu.sellLimit': 'ขายลิมิตที่ {at}',
  'menu.buyStop': 'ซื้อสต็อปที่ {at}',
  'menu.buyLimit': 'ซื้อลิมิตที่ {at}',
  'menu.sellStop': 'ขายสต็อปที่ {at}',
  'menu.removeIndicators': { other: 'นำอินดิเคเตอร์ออก {count} รายการ' },
  'menu.removeDrawings': { other: 'นำการวาดออก {count} รายการ' },
  'menu.hideMarks': 'ซ่อนมาร์กบนแท่ง',
  'menu.settings': 'การตั้งค่า…',
}

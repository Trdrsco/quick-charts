import type { Translation } from '../runtime'
import type { menu as source } from '../en/menu'

export const menu: Translation<typeof source> = {
  'menu.resetView': 'รีเซ็ตมุมมองกราฟ',
  'menu.copyPrice': 'คัดลอกราคา {price}',
  'menu.paste': 'วาง',
  'menu.addAlert': 'เพิ่มการแจ้งเตือน {symbol} ที่ {price}…',
  'menu.removeIndicators': { other: 'นำอินดิเคเตอร์ออก {count} รายการ' },
  'menu.removeDrawings': { other: 'นำการวาดออก {count} รายการ' },
  'menu.settings': 'การตั้งค่า…',
}

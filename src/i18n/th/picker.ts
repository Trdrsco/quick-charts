import type { Translation } from '../runtime'
import type { picker as source } from '../en/picker'

export const picker: Translation<typeof source> = {
  'picker.title': 'อินดิเคเตอร์',
  'picker.search': 'ค้นหาอินดิเคเตอร์',
  'picker.noMatches': 'ไม่มีอินดิเคเตอร์ที่ตรงกัน',
  'picker.collections': 'คอลเลกชันอินดิเคเตอร์',
  'picker.personal': 'ส่วนตัว',
  'picker.builtin': 'ในตัว',
  'picker.favorites': 'รายการโปรด',
  'picker.thousands': ' K',
  'picker.name': 'ชื่อ',
  'picker.author': 'ผู้สร้าง',
  'picker.favorite': 'เพิ่ม {name} ในรายการโปรด',
  'picker.unfavorite': 'นำ {name} ออกจากรายการโปรด',
  'picker.loading': 'กำลังโหลดอินดิเคเตอร์…',
  'picker.unavailable': 'เนื้อหาอินดิเคเตอร์ไม่พร้อมใช้งาน โปรดลองอีกครั้ง',
  'picker.actionFailed': 'ดำเนินการไม่สำเร็จ โปรดลองอีกครั้ง',
  'picker.add': 'เพิ่ม {name}',
  'picker.notPermitted': '{name} ไม่พร้อมใช้งานที่นี่',
}

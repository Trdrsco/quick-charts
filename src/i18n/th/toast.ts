import type { Translation } from '../runtime'
import type { toast as source } from '../en/toast'

export const toast: Translation<typeof source> = {
  'toast.dismiss': 'ปิด',
  'toast.feedUnavailable': 'ไม่มีข้อมูลของ {symbol} จากฟีดนี้',
  'toast.feedNoData': 'ยังไม่มีข้อมูลของ {symbol}',
  'toast.imageCopyFallback': 'คัดลอกรูปภาพไม่ได้ จึงบันทึกเป็นไฟล์แทน',
  'toast.imageFailed': 'จับภาพกราฟไม่ได้',
  'toast.indicatorsNotCarried': { other: 'อินดิเคเตอร์ {count} รายการในกราฟที่บันทึกไว้นี้ไม่พร้อมใช้งานที่นี่และถูกละไว้' },
}

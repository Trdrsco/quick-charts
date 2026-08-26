import type { Translation } from '@trdrs/i18n'
import type { replay as source } from '../en/replay'

export const replay: Translation<typeof source> = {
  'replay.stepBack': 'ถอยหลังหนึ่งแท่ง',
  'replay.play': 'เล่น',
  'replay.pause': 'หยุดชั่วคราว',
  'replay.stepForward': 'ไปข้างหน้าหนึ่งแท่ง',
  'replay.speed': 'ความเร็วการเล่นซ้ำ (จำนวนอัปเดตต่อวินาที)',
  'replay.interval': 'ช่วงเวลาอัปเดต (แต่ละแท่งก่อตัวจากแท่งย่อยจริง)',
  'replay.auto': 'อัตโนมัติ',
  'replay.goLive': 'ไปที่ตลาดจริง',
  'replay.goLiveTitle': 'กระโดดไปที่ขอบข้อมูลล่าสุด',
  'replay.exit': 'ออกจากการเล่นซ้ำ',
}

import type { Translation } from '@trdrs/i18n'
import type { broker as source } from '../en/broker'

export const broker: Translation<typeof source> = {
  'broker.positionAlreadyClosed': 'โพซิชันถูกปิดไปแล้ว',
  'broker.orderNotWorking': 'คำสั่งไม่ได้รอดำเนินการอยู่แล้ว',
  'broker.tickUnknownReprice': 'ไม่ทราบขนาดทิก จึงเปลี่ยนราคาไม่ได้',
  'broker.pricesUnknownReprice': 'ไม่ทราบราคาของคำสั่ง จึงเปลี่ยนราคาไม่ได้',
  'broker.noLimitBand': 'ไม่มีราคาลิมิตปัจจุบันให้ใช้อ้างอิงกรอบราคา',
  'broker.noStopBand': 'ไม่มีราคาสต็อปปัจจุบันให้ใช้อ้างอิงกรอบราคา',
  'broker.noStopAnchor': 'ไม่มีราคาให้ใช้ยึดตำแหน่งสต็อป',
  'broker.tickUnknown': 'ไม่ทราบขนาดทิก',
  'broker.noAnchor': 'ไม่มีจุดยึด',
  'broker.takeProfitAbove': 'จุดทำกำไรต้องอยู่เหนือราคาเข้า',
  'broker.takeProfitBelow': 'จุดทำกำไรต้องอยู่ใต้ราคาเข้า',
  'broker.positionClosed': 'ปิดโพซิชันแล้ว',
  'broker.orderCancelled': 'ยกเลิกคำสั่งแล้ว',
  'broker.targetMoved': 'ย้ายเป้าหมายไปที่ {price}',
  'broker.orderMoved': 'ย้ายคำสั่งไปที่ {price}',
  'broker.triggerMoved': 'ย้ายจุดทริกเกอร์ไปที่ {price}',
  'broker.limitMoved': 'ย้ายลิมิตไปที่ {price}',
  'broker.stopMoved': 'ย้ายสต็อปไปที่ {price}',
  'broker.stopSideUnverified': 'ไม่มีราคาเรียลไทม์ จึงยังไม่ได้ตรวจสอบฝั่งของสต็อป',
}

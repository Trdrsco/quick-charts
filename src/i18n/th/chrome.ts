import type { Translation } from '../runtime'
import type { chrome as source } from '../en/chrome'

export const chrome: Translation<typeof source> = {
  'chrome.topBar': 'แถบเครื่องมือกราฟ',
  'chrome.bottomBar': 'ส่วนท้ายกราฟ',
  'chrome.symbolSearch': 'ค้นหาสัญลักษณ์',
  'chrome.compare': 'เปรียบเทียบหรือเพิ่มสัญลักษณ์',
  'chrome.chartStyle': 'รูปแบบกราฟ',
  'chrome.indicators': 'อินดิเคเตอร์',
  'chrome.replay': 'การเล่นซ้ำแท่ง',
  'chrome.replayChip': 'เล่นซ้ำ',
  'chrome.image': 'รูปภาพกราฟ',
  'chrome.session': 'ช่วงการซื้อขาย',
  'chrome.sessionsHeading': 'ช่วงการซื้อขาย',
  'chrome.navigation': 'การนำทางกราฟ',
  'chrome.activeChart': '{symbol}, {timeframe}',
  'chrome.scaleHigh': 'High',
  'chrome.scaleLow': 'Low',
  'chrome.scaleBid': 'Bid',
  'chrome.scaleAsk': 'Ask',
  'chrome.scaleModes': 'Scale modes',
  'chrome.autoScale': 'Auto scale',
  'chrome.autoScaleMark': 'A',
  'chrome.logScale': 'Logarithmic scale',
  'chrome.logScaleMark': 'L',
}

import type { Translation } from '../runtime'
import type { chrome as source } from '../en/chrome'

export const chrome: Translation<typeof source> = {
  'chrome.topBar': 'شريط أدوات الرسم البياني',
  'chrome.bottomBar': 'تذييل الرسم البياني',
  'chrome.symbolSearch': 'البحث عن رمز',
  'chrome.compare': 'مقارنة رمز أو إضافته',
  'chrome.chartStyle': 'نمط الرسم البياني',
  'chrome.indicators': 'المؤشرات',
  'chrome.replay': 'إعادة تشغيل الأشرطة',
  'chrome.replayChip': 'إعادة التشغيل',
  'chrome.image': 'صورة الرسم البياني',
  'chrome.session': 'جلسة التداول',
  'chrome.sessionsHeading': 'الجلسات',
  'chrome.navigation': 'التنقل في الرسم البياني',
  'chrome.activeChart': '{symbol}، {timeframe}',
  'chrome.scaleHigh': 'High',
  'chrome.scaleLow': 'Low',
  'chrome.scaleBid': 'Bid',
  'chrome.scaleAsk': 'Ask',
  'chrome.scaleModes': 'Scale modes',
  'chrome.autoScale': 'Auto scale',
  'chrome.autoScaleMark': 'A',
  'chrome.logScale': 'Logarithmic scale',
  'chrome.logScaleMark': 'L',
  'chrome.currencyAndUnit': '{currency} · {unit}',
  'chrome.priceLevelMenu': 'Actions at {price}',
}

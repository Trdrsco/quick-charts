import type { Translation } from '../runtime'
import type { chrome as source } from '../en/chrome'

export const chrome: Translation<typeof source> = {
  'chrome.topBar': 'סרגל הכלים של הגרף',
  'chrome.bottomBar': 'כותרת תחתונה של הגרף',
  'chrome.symbolSearch': 'חיפוש סימבול',
  'chrome.compare': 'השוואה או הוספה של סימבול',
  'chrome.chartStyle': 'סגנון הגרף',
  'chrome.indicators': 'אינדיקטורים',
  'chrome.replay': 'הפעלה חוזרת של נרות',
  'chrome.replayChip': 'הפעלה חוזרת',
  'chrome.image': 'תמונת הגרף',
  'chrome.session': 'סשן מסחר',
  'chrome.sessionsHeading': 'סשנים',
  'chrome.navigation': 'ניווט בגרף',
  'chrome.activeChart': '{symbol}, {timeframe}',
}

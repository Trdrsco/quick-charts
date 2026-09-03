import type { Translation } from '../runtime'
import type { chrome as source } from '../en/chrome'

export const chrome: Translation<typeof source> = {
  'chrome.topBar': 'Chart toolbar',
  'chrome.bottomBar': 'Chart footer',
  'chrome.symbolSearch': 'Search symbol',
  'chrome.compare': 'Compare or add symbol',
  'chrome.chartStyle': 'Chart style',
  'chrome.indicators': 'Indicators',
  'chrome.replay': 'Bar replay',
  'chrome.image': 'Chart image',
  'chrome.session': 'Trading session',
  'chrome.sessionsHeading': 'Sessions',
  'chrome.navigation': 'Chart navigation',
  'chrome.activeChart': '{symbol}, {timeframe}',
}

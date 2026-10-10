import type { Translation } from '../runtime'
import type { chrome as source } from '../en/chrome'

export const chrome: Translation<typeof source> = {
  'chrome.topBar': 'Chart-Symbolleiste',
  'chrome.bottomBar': 'Chart-Fußleiste',
  'chrome.symbolSearch': 'Symbol suchen',
  'chrome.compare': 'Symbol vergleichen oder hinzufügen',
  'chrome.chartStyle': 'Chartstil',
  'chrome.indicators': 'Indikatoren',
  'chrome.replay': 'Balken-Wiedergabe',
  'chrome.replayChip': 'Wiedergabe',
  'chrome.image': 'Chartbild',
  'chrome.session': 'Handelssitzung',
  'chrome.sessionsHeading': 'Sitzungen',
  'chrome.navigation': 'Chartnavigation',
  'chrome.activeChart': '{symbol}, {timeframe}',
}

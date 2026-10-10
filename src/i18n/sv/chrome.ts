import type { Translation } from '../runtime'
import type { chrome as source } from '../en/chrome'

export const chrome: Translation<typeof source> = {
  'chrome.topBar': 'Diagrammets verktygsfält',
  'chrome.bottomBar': 'Diagrammets sidfot',
  'chrome.symbolSearch': 'Sök symbol',
  'chrome.compare': 'Jämför eller lägg till symbol',
  'chrome.chartStyle': 'Diagramstil',
  'chrome.indicators': 'Indikatorer',
  'chrome.replay': 'Stapeluppspelning',
  'chrome.replayChip': 'Uppspelning',
  'chrome.image': 'Diagrambild',
  'chrome.session': 'Handelssession',
  'chrome.sessionsHeading': 'Sessioner',
  'chrome.navigation': 'Diagramnavigering',
  'chrome.activeChart': '{symbol}, {timeframe}',
}

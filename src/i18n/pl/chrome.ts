import type { Translation } from '../runtime'
import type { chrome as source } from '../en/chrome'

export const chrome: Translation<typeof source> = {
  'chrome.topBar': 'Pasek narzędzi wykresu',
  'chrome.bottomBar': 'Stopka wykresu',
  'chrome.symbolSearch': 'Szukaj symbolu',
  'chrome.compare': 'Porównaj lub dodaj symbol',
  'chrome.chartStyle': 'Styl wykresu',
  'chrome.indicators': 'Wskaźniki',
  'chrome.replay': 'Odtwarzanie słupków',
  'chrome.replayChip': 'Odtwarzanie',
  'chrome.image': 'Obraz wykresu',
  'chrome.session': 'Sesja handlowa',
  'chrome.sessionsHeading': 'Sesje',
  'chrome.navigation': 'Nawigacja po wykresie',
  'chrome.activeChart': '{symbol}, {timeframe}',
  'chrome.scaleHigh': 'High',
  'chrome.scaleLow': 'Low',
  'chrome.scaleBid': 'Bid',
  'chrome.scaleAsk': 'Ask',
}

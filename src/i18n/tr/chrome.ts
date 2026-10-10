import type { Translation } from '../runtime'
import type { chrome as source } from '../en/chrome'

export const chrome: Translation<typeof source> = {
  'chrome.topBar': 'Grafik araç çubuğu',
  'chrome.bottomBar': 'Grafik alt bilgisi',
  'chrome.symbolSearch': 'Sembol ara',
  'chrome.compare': 'Sembol karşılaştır veya ekle',
  'chrome.chartStyle': 'Grafik stili',
  'chrome.indicators': 'Göstergeler',
  'chrome.replay': 'Bar tekrar oynatma',
  'chrome.replayChip': 'Tekrar oynatma',
  'chrome.image': 'Grafik görüntüsü',
  'chrome.session': 'İşlem seansı',
  'chrome.sessionsHeading': 'Seanslar',
  'chrome.navigation': 'Grafik gezintisi',
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

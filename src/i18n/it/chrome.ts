import type { Translation } from '../runtime'
import type { chrome as source } from '../en/chrome'

export const chrome: Translation<typeof source> = {
  'chrome.topBar': 'Barra degli strumenti del grafico',
  'chrome.bottomBar': 'Piè di pagina del grafico',
  'chrome.symbolSearch': 'Cerca simbolo',
  'chrome.compare': 'Confronta o aggiungi simbolo',
  'chrome.chartStyle': 'Stile del grafico',
  'chrome.indicators': 'Indicatori',
  'chrome.replay': 'Replay delle barre',
  'chrome.replayChip': 'Replay',
  'chrome.image': 'Immagine del grafico',
  'chrome.session': 'Sessione di negoziazione',
  'chrome.sessionsHeading': 'Sessioni',
  'chrome.navigation': 'Navigazione del grafico',
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
  'chrome.currencyAndUnit': '{currency} · {unit}',
}

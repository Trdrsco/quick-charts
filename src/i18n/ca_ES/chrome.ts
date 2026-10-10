import type { Translation } from '../runtime'
import type { chrome as source } from '../en/chrome'

export const chrome: Translation<typeof source> = {
  'chrome.topBar': 'Barra d’eines del gràfic',
  'chrome.bottomBar': 'Peu del gràfic',
  'chrome.symbolSearch': 'Cerca un símbol',
  'chrome.compare': 'Compara o afegeix un símbol',
  'chrome.chartStyle': 'Estil del gràfic',
  'chrome.indicators': 'Indicadors',
  'chrome.replay': 'Repetició de barres',
  'chrome.replayChip': 'Repetició',
  'chrome.image': 'Imatge del gràfic',
  'chrome.session': 'Sessió de negociació',
  'chrome.sessionsHeading': 'Sessions',
  'chrome.navigation': 'Navegació del gràfic',
  'chrome.activeChart': '{symbol}, {timeframe}',
}

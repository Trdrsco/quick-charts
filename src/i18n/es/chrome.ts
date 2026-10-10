import type { Translation } from '../runtime'
import type { chrome as source } from '../en/chrome'

export const chrome: Translation<typeof source> = {
  'chrome.topBar': 'Barra de herramientas del gráfico',
  'chrome.bottomBar': 'Pie del gráfico',
  'chrome.symbolSearch': 'Buscar símbolo',
  'chrome.compare': 'Comparar o añadir símbolo',
  'chrome.chartStyle': 'Estilo del gráfico',
  'chrome.indicators': 'Indicadores',
  'chrome.replay': 'Repetición de velas',
  'chrome.replayChip': 'Repetición',
  'chrome.image': 'Imagen del gráfico',
  'chrome.session': 'Sesión de negociación',
  'chrome.sessionsHeading': 'Sesiones',
  'chrome.navigation': 'Navegación del gráfico',
  'chrome.activeChart': '{symbol}, {timeframe}',
  'chrome.scaleHigh': 'High',
  'chrome.scaleLow': 'Low',
  'chrome.scaleBid': 'Bid',
  'chrome.scaleAsk': 'Ask',
}

import type { Translation } from '../runtime'
import type { chrome as source } from '../en/chrome'

export const chrome: Translation<typeof source> = {
  'chrome.topBar': 'Панель инструментов графика',
  'chrome.bottomBar': 'Нижняя панель графика',
  'chrome.symbolSearch': 'Поиск инструмента',
  'chrome.compare': 'Сравнить или добавить инструмент',
  'chrome.chartStyle': 'Стиль графика',
  'chrome.indicators': 'Индикаторы',
  'chrome.replay': 'Воспроизведение баров',
  'chrome.replayChip': 'Воспроизведение',
  'chrome.image': 'Снимок графика',
  'chrome.session': 'Торговая сессия',
  'chrome.sessionsHeading': 'Сессии',
  'chrome.navigation': 'Навигация по графику',
  'chrome.activeChart': '{symbol}, {timeframe}',
}

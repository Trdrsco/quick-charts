import type { Translation } from '../runtime'
import type { chrome as source } from '../en/chrome'

export const chrome: Translation<typeof source> = {
  'chrome.topBar': '图表工具栏',
  'chrome.bottomBar': '图表底栏',
  'chrome.symbolSearch': '搜索代码',
  'chrome.compare': '比较或添加代码',
  'chrome.chartStyle': '图表样式',
  'chrome.indicators': '指标',
  'chrome.replay': 'K线回放',
  'chrome.replayChip': '回放',
  'chrome.image': '图表图片',
  'chrome.session': '交易时段',
  'chrome.sessionsHeading': '交易时段',
  'chrome.navigation': '图表导航',
  'chrome.activeChart': '{symbol}，{timeframe}',
}

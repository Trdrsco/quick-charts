import type { Translation } from '../runtime'
import type { chrome as source } from '../en/chrome'

export const chrome: Translation<typeof source> = {
  'chrome.topBar': '차트 도구 모음',
  'chrome.bottomBar': '차트 하단 바',
  'chrome.symbolSearch': '심볼 검색',
  'chrome.compare': '심볼 비교 또는 추가',
  'chrome.chartStyle': '차트 스타일',
  'chrome.indicators': '지표',
  'chrome.replay': '바 리플레이',
  'chrome.replayChip': '리플레이',
  'chrome.image': '차트 이미지',
  'chrome.session': '거래 세션',
  'chrome.sessionsHeading': '세션',
  'chrome.navigation': '차트 탐색',
  'chrome.activeChart': '{symbol}, {timeframe}',
  'chrome.scaleHigh': 'High',
  'chrome.scaleLow': 'Low',
  'chrome.scaleBid': 'Bid',
  'chrome.scaleAsk': 'Ask',
}

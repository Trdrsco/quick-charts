import type { Translation } from '../runtime'
import type { chrome as source } from '../en/chrome'

export const chrome: Translation<typeof source> = {
  'chrome.topBar': 'チャートツールバー',
  'chrome.bottomBar': 'チャートフッター',
  'chrome.symbolSearch': '銘柄を検索',
  'chrome.compare': '銘柄を比較または追加',
  'chrome.chartStyle': 'チャートスタイル',
  'chrome.indicators': 'インジケーター',
  'chrome.replay': 'バーリプレイ',
  'chrome.replayChip': 'リプレイ',
  'chrome.image': 'チャート画像',
  'chrome.session': '取引セッション',
  'chrome.sessionsHeading': 'セッション',
  'chrome.navigation': 'チャートナビゲーション',
  'chrome.activeChart': '{symbol}、{timeframe}',
}

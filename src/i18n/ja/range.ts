import type { Translation } from '../runtime'
import type { range as source } from '../en/range'

export const range: Translation<typeof source> = {
  'range.oneDay': '1日',
  'range.fiveDays': '5日',
  'range.oneMonth': '1か月',
  'range.threeMonths': '3か月',
  'range.sixMonths': '6か月',
  'range.yearToDate': '年初来',
  'range.oneYear': '1年',
  'range.fiveYears': '5年',
  'range.all': 'すべてのデータ',
  'range.tip': '{range} · {interval}バー',
  'range.zoomIn': '拡大',
  'range.zoomOut': '縮小',
  'range.scrollLeft': '左へスクロール',
  'range.scrollRight': '右へスクロール',
  'range.reset': 'チャート表示をリセット',
}

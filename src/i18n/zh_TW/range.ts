import type { Translation } from '../runtime'
import type { range as source } from '../en/range'

export const range: Translation<typeof source> = {
  'range.oneDay': '1日',
  'range.fiveDays': '5日',
  'range.oneMonth': '1個月',
  'range.threeMonths': '3個月',
  'range.sixMonths': '6個月',
  'range.yearToDate': '年初至今',
  'range.oneYear': '1年',
  'range.fiveYears': '5年',
  'range.all': '全部資料',
  'range.tip': '{range} · {interval}K線',
  'range.zoomIn': '放大',
  'range.zoomOut': '縮小',
  'range.scrollLeft': '向左捲動',
  'range.scrollRight': '向右捲動',
  'range.reset': '重設圖表檢視',
}

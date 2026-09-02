import type { Translation } from '../runtime'
import type { range as source } from '../en/range'

export const range: Translation<typeof source> = {
  'range.oneDay': '1天',
  'range.fiveDays': '5天',
  'range.oneMonth': '1个月',
  'range.threeMonths': '3个月',
  'range.sixMonths': '6个月',
  'range.yearToDate': '年初至今',
  'range.oneYear': '1年',
  'range.fiveYears': '5年',
  'range.all': '全部数据',
  'range.tip': '{range} · {interval}K线',
  'range.zoomIn': '放大',
  'range.zoomOut': '缩小',
  'range.scrollLeft': '向左滚动',
  'range.scrollRight': '向右滚动',
  'range.reset': '重置图表视图',
}

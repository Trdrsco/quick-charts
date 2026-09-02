// The bottom bar's range presets and the on-chart navigation cluster. A preset's chip wears its
// key ('1D', 'YTD', 'All') as written; these are the full names its tooltip says, and the verbs
// of the zoom, scroll and reset controls.
export const range = {
  'range.oneDay': '1 Day',
  'range.fiveDays': '5 Days',
  'range.oneMonth': '1 Month',
  'range.threeMonths': '3 Months',
  'range.sixMonths': '6 Months',
  'range.yearToDate': 'Year to date',
  'range.oneYear': '1 Year',
  'range.fiveYears': '5 Years',
  'range.all': 'All data',
  /** A preset's tooltip: what it frames, and the bars it frames it in. */
  'range.tip': '{range} · {interval} bars',
  'range.zoomIn': 'Zoom in',
  'range.zoomOut': 'Zoom out',
  'range.scrollLeft': 'Scroll left',
  'range.scrollRight': 'Scroll right',
  'range.reset': 'Reset chart view',
} as const

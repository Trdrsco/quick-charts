// The default chart chrome: the top bar's controls, the bottom bar, and the on-chart navigation
// cluster. The symbol, the timeframe token, a chart style's id and a zone's offset are data and
// pass through as written; these are the words around them. A control that IS a command reads
// the command's own name from command.ts rather than repeating it here.
export const chrome = {
  /** The two bars' accessible names, for a landmark reader. */
  'chrome.topBar': 'Chart toolbar',
  'chrome.bottomBar': 'Chart footer',
  /** The symbol pill: it opens the symbol search for the active chart. */
  'chrome.symbolSearch': 'Search symbol',
  'chrome.compare': 'Compare or add symbol',
  'chrome.chartStyle': 'Chart style',
  'chrome.indicators': 'Indicators',
  'chrome.replay': 'Bar replay',
  /** The short word the replay control wears on the bar, where the icon beside it already says
   *  which replay is meant. Its accessible name stays the full one above. */
  'chrome.replayChip': 'Replay',
  'chrome.image': 'Chart image',
  /** The bottom bar's session-view trigger. Its clock and timezone trigger reads `timezone.title`. */
  'chrome.session': 'Trading session',
  'chrome.sessionsHeading': 'Sessions',
  /** The on-chart navigation cluster's group name. */
  'chrome.navigation': 'Chart navigation',
  /** The active chart's identity as the toolbar reads it aloud; `{symbol}` and `{timeframe}` are data. */
  'chrome.activeChart': '{symbol}, {timeframe}',
  /** The tags beside the price levels the price scale marks: the visible range's high and low, and
   *  the bid and the ask. */
  'chrome.scaleHigh': 'High',
  'chrome.scaleLow': 'Low',
  'chrome.scaleBid': 'Bid',
  'chrome.scaleAsk': 'Ask',
} as const

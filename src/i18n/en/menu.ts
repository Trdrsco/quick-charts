// The right-click context menu, the price menu the price scale's plus opens and the scale's menu its
// corner button opens: the chart's own rows and their shortcuts. Shortcuts are key names as they are printed on the keyboard and never
// translated; `{price}` is the pane's own value. The rows an extension contributes for a level (an
// alert, an order) carry their own words.
export const menu = {
  'menu.resetView': 'Reset chart view',
  'menu.copyPrice': 'Copy price {price}',
  'menu.paste': 'Paste',

  'menu.removeIndicators': { one: 'Remove {count} indicator', other: 'Remove {count} indicators' },
  'menu.removeDrawings': { one: 'Remove {count} drawing', other: 'Remove {count} drawings' },
  'menu.settings': 'Settings…',

  'menu.drawHorizontalLine': 'Draw horizontal line at {price}',

  'menu.resetPriceScale': 'Reset price scale',
  'menu.autoFitScale': 'Auto (fits data to screen)',
  'menu.scalePriceChartOnly': 'Scale price chart only',
  'menu.invertScale': 'Invert scale',
  'menu.scaleRegular': 'Regular',
  'menu.scalePercent': 'Percent',
  'menu.scaleIndexed': 'Indexed to 100',
  'menu.scaleLogarithmic': 'Logarithmic',
  'menu.moveScaleLeft': 'Move scale to left',
  'menu.moveScaleRight': 'Move scale to right',
  'menu.scaleLabels': 'Labels',
  'menu.scaleLines': 'Lines',
  'menu.moreSettings': 'More settings…',
  'menu.labelSymbolName': 'Symbol name label',
  'menu.labelSymbolValue': 'Symbol last price label',
  'menu.labelPreviousClose': 'Symbol previous day close price label',
  'menu.labelExtendedHours': 'Pre/post/night market price label',
  'menu.labelHighLow': 'High and low price labels',
  'menu.labelBidAsk': 'Bid and ask labels',
  'menu.labelIndicatorName': 'Indicators and financials name labels',
  'menu.labelIndicatorValue': 'Indicators and financials value labels',
  'menu.linePrice': 'Price line',
  'menu.linePreviousClose': 'Previous day close price line',
  'menu.lineExtendedHours': 'Pre/post/night market price line',
  'menu.lineHighLow': 'High and low price lines',
  'menu.lineBidAsk': 'Bid and ask lines',
} as const

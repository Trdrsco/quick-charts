// Execution marks and their card. A mark's own label is the fill as figures ("3 @ 100.00") and each
// row is a size, a price and a time — the card's words are the side, the average line and the
// section header.
export const marks = {
  'marks.buy': 'Buy',
  'marks.sell': 'Sell',
  /** The stack's summary above the rows: total size at the average it filled. */
  'marks.avgPrice': '{qty} @ {price} avg price',
  'marks.trades': 'TRADES',
} as const

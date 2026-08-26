// Trade lines on the chart: labels, pills, and the toasts their edits raise. Prices, sizes and
// symbols are the venue's own figures; a broker's rejection reaches the trader in the broker's own
// words. The TP/SL drag handles keep their two-character marks in every language — they are marks
// on a 29px button, and the tooltip beside each one is what says the words.
export const lines = {
  // The pills' controls.
  'lines.reversePosition': 'Reverse Position',
  'lines.closePosition': 'Close Position',
  'lines.cancelOrder': 'Cancel order',
  'lines.modifyQty': 'Modify order quantity…',
  'lines.price': 'Price {price}',
  'lines.takeProfit': 'Take profit',
  'lines.stopLoss': 'Stop loss',
  'lines.dragTakeProfit': 'Drag to add Take profit',
  'lines.dragStopLoss': 'Drag to add Stop loss',
  /** On a RESTING entry the leg arms when that order fills, which the tooltip says outright. */
  'lines.dragTakeProfitOnFill': 'Drag to add Take profit (arms on fill)',
  'lines.dragStopLossOnFill': 'Drag to add Stop loss (arms on fill)',

  // A resting order's label: its side and its type.
  'lines.orderBuy': 'Buy {type}',
  'lines.orderSell': 'Sell {type}',

  // The ticket's draft line: the side chip states the side and sends the order.
  'lines.buy': 'Buy',
  'lines.sell': 'Sell',
  'lines.changeOrderType': 'Change order type',
  'lines.discardOrder': 'Discard this order',
  /** The side chip's tooltip — the action, or the reason there isn't one. One message per order type
   *  rather than a type dropped into a sentence, because a language that inflects it needs the whole
   *  line to agree. */
  'lines.submitMarket': 'Send this market order',
  'lines.submitLimit': 'Send this limit order',
  'lines.submitStop': 'Send this stop order',
  'lines.submitStopLimit': 'Send this stop limit order',
  /** A draft whose type a HOST named itself: `{type}` is that host's own word. */
  'lines.submitOrder': 'Send this {type} order',
  'lines.selectAccount': 'Select an account to trade',
  'lines.locked': 'Trading is locked for this account',

  /** A position's P&L in ticks. `{sign}` is the true minus or plus and `{value}` the figure at the
   *  precision the readout keeps; `count` selects the form. */
  'lines.ticks': { one: '{sign} {value} tick', other: '{sign} {value} ticks' },

  // What a gesture reports when it cannot act, or after it has.
  'lines.moveCancelled': 'Selection changed, move cancelled',
  'lines.editCancelled': 'Selection changed, edit cancelled',
  'lines.bracketCancelled': 'Selection changed, bracket cancelled',
  'lines.actionCancelled': 'Selection changed, action cancelled',
  'lines.outsideRange': 'Outside the allowed range, reverted',
  'lines.takeProfitUnsupported': 'Take profit is not supported for this account',
  'lines.qtySet': 'Order size set to {qty}',
  'lines.positionReversed': 'Position reversed',
  'lines.positionReversedOrders': {
    one: 'Position reversed · {count} order cancelled',
    other: 'Position reversed · {count} orders cancelled',
  },
  /** A protective leg placed on an open position: which leg, and the order that now rests. */
  'lines.takeProfitPlacedSell': 'Take Profit order placed · Sell {qty} at {price}',
  'lines.takeProfitPlacedBuy': 'Take Profit order placed · Buy {qty} at {price}',
  'lines.stopLossPlacedSell': 'Stop Loss order placed · Sell {qty} at {price}',
  'lines.stopLossPlacedBuy': 'Stop Loss order placed · Buy {qty} at {price}',
  /** A leg attached to an UNFILLED entry: it exists, but it does not rest yet. */
  'lines.takeProfitArms': 'Take profit set at {price} · arms when the entry fills',
  'lines.stopLossArms': 'Stop loss set at {price} · arms when the entry fills',
  'lines.takeProfitMoved': 'Take profit moved to {price}',
  'lines.stopLossMoved': 'Stop loss moved to {price}',
  'lines.takeProfitRemoved': 'Take profit removed',
  'lines.stopLossRemoved': 'Stop loss removed',
  /** A rejection that carried no message of its own — anything the broker DID say is shown verbatim. */
  'lines.actionFailed': 'Chart action failed',
} as const

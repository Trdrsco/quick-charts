// The chart-native order ticket: fields, actions, and the states it reports.
//
// The four ORDER TYPE words are the widget's one order-type vocabulary: the ticket's type menu, the
// draft line's type cell and a resting order's label all read them from here, so a type is named
// once. The English values are also the canonical tokens the PreviewSet carries between a host and
// the widget — the label a host reads and writes stays English; only the render is translated.
export const ticket = {
  'ticket.typeMarket': 'Market',
  'ticket.typeLimit': 'Limit',
  'ticket.typeStop': 'Stop',
  'ticket.typeStopLimit': 'Stop Limit',

  // What submit reports. A refusal the BROKER makes reaches the trader in the broker's own words.
  'ticket.noAccount': 'No account armed — connect an account to place orders.',
  'ticket.locked': 'Trading is locked for this account.',
  'ticket.needsPrice': 'The order needs a price.',
  'ticket.cannotPlace': 'This integration does not place orders.',
  /** `{type}` is the order type's own word; `{qty}` the size the venue was sent. */
  'ticket.placedBuy': 'Buy {qty} {type} placed',
  'ticket.placedSell': 'Sell {qty} {type} placed',
} as const

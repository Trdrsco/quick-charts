// The right-click level menu: rows, shortcuts, and the orders a level can hold. Shortcuts are key
// names as they are printed on the keyboard and never translated; `{symbol}` and `{price}` are the
// pane's own values.
export const menu = {
  'menu.resetView': 'Reset chart view',
  'menu.copyPrice': 'Copy price {price}',
  'menu.paste': 'Paste',
  'menu.addAlert': 'Add alert on {symbol} at {price}…',
  'menu.addOrder': 'Add order on {symbol} at {price}…',

  /** The two orders a level can HOLD, above the market and below it. `{at}` is the order as figures —
   *  size, symbol and level — so a translation may place it wherever the sentence needs it. */
  'menu.sellLimit': 'Sell {at} limit',
  'menu.buyStop': 'Buy {at} stop',
  'menu.buyLimit': 'Buy {at} limit',
  'menu.sellStop': 'Sell {at} stop',

  'menu.removeIndicators': { one: 'Remove {count} indicator', other: 'Remove {count} indicators' },
  'menu.removeDrawings': { one: 'Remove {count} drawing', other: 'Remove {count} drawings' },
  /** A CHECKABLE row: state shows as a checkmark, so the wording never changes with it. */
  'menu.hideMarks': 'Hide marks on bars',
  'menu.settings': 'Settings…',
} as const

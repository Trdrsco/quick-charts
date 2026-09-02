// The right-click level menu: the chart's own rows and their shortcuts. Shortcuts are key names as
// they are printed on the keyboard and never translated; `{symbol}` and `{price}` are the pane's
// own values. The rows an extension contributes for a level carry their own words.
export const menu = {
  'menu.resetView': 'Reset chart view',
  'menu.copyPrice': 'Copy price {price}',
  'menu.paste': 'Paste',
  'menu.addAlert': 'Add alert on {symbol} at {price}…',

  'menu.removeIndicators': { one: 'Remove {count} indicator', other: 'Remove {count} indicators' },
  'menu.removeDrawings': { one: 'Remove {count} drawing', other: 'Remove {count} drawings' },
  'menu.settings': 'Settings…',
} as const

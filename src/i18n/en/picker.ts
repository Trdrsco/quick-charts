// The indicator picker: the dialog over the built-in definitions. An indicator's name and
// description are keys in indicators.ts; its short tag (SMA, RSI) is data. The four category
// headings are here, keyed by the category id a definition carries.
export const picker = {
  'picker.title': 'Indicators',
  'picker.search': 'Search indicators',
  'picker.noMatches': 'No matching indicators.',
  /** A row's verb; `{name}` is the indicator's name. */
  'picker.add': 'Add {name}',
  /** A row the access policy refuses. */
  'picker.notPermitted': '{name} is not available here',
  'picker.categoryMa': 'Moving averages',
  'picker.categoryBand': 'Bands and channels',
  'picker.categoryOsc': 'Oscillators',
  'picker.categoryVol': 'Volume',
} as const

// The chart-owned indicator picker. Definitions use indicators.ts; optional host labels are
// localized by the host and never added to the product's built-in catalog.
export const picker = {
  'picker.title': 'Indicators',
  'picker.search': 'Search indicators',
  'picker.noMatches': 'No matching indicators.',
  'picker.collections': 'Indicator collections',
  'picker.personal': 'Personal',
  /** The rail's heading over the shipped definitions. */
  'picker.builtin': 'Built-in',
  /** The rail's collection of shipped technical indicators, under Built-in. */
  'picker.technicals': 'Technicals',
  'picker.favorites': 'Favorites',
  /** The kind filters: their group's name, the filter that shows every kind, and the chart's own
   *  kind beside the kinds a host declares. */
  'picker.kindFilter': 'Type',
  'picker.allKinds': 'All',
  'picker.indicators': 'Indicators',
  'picker.thousands': ' K',
  'picker.name': 'Name',
  'picker.author': 'Author',
  'picker.favorite': 'Favorite {name}',
  'picker.unfavorite': 'Unfavorite {name}',
  'picker.loading': 'Loading indicators…',
  'picker.unavailable': 'Indicator content is unavailable. Try again.',
  'picker.actionFailed': 'The action could not be completed. Try again.',
  /** A row's verb; `{name}` is the indicator's name. */
  'picker.add': 'Add {name}',
  /** A row the access policy refuses. */
  'picker.notPermitted': '{name} is not available here',
} as const

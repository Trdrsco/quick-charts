// Symbol search: the dialog family's titles, input, sections, compare placements, and the spread
// operators. Asset-class filter names come from the host, whose feed defines the classes, and
// data-source attribution is the host's too; symbols, names and venues are data.
export const search = {
  'search.title': 'Symbol search',
  'search.compareTitle': 'Compare symbols',
  'search.changeSymbolTitle': 'Change symbol',
  'search.placeholder': 'Search symbol',
  'search.clear': 'Clear',
  'search.noMatches': 'No matching symbols.',
  'search.loadingMore': 'Loading more…',
  /** The feed refused or failed the query and nothing cached stands in. */
  'search.failed': 'Search failed.',
  // Compare mode: the three placements a row adds at, and its empty-query sections.
  'search.samePercent': 'Same % scale',
  'search.newScale': 'New price scale',
  'search.newPane': 'New pane',
  'search.added': 'Added symbols',
  'search.recent': 'Recent symbols',
  /** The checkmark on a row already on the chart. */
  'search.addedMark': '{symbol} is on the chart. Click to remove.',
  'search.compareEmpty': 'No symbols here yet. Why not add some?',
  // The spread operators' names (the reference's own), and the strip's toggle.
  'search.opDivision': 'Division',
  'search.opSubtraction': 'Subtraction',
  'search.opAddition': 'Addition',
  'search.opMultiplication': 'Multiplication',
  'search.opExponentiation': 'Exponentiation',
  'search.opReciprocal': 'Reciprocal',
  'search.opsHide': 'Hide spread operators',
  'search.opsShow': 'Show spread operators',
} as const

// Symbol search: the dialog family's titles, input, sections, compare placements, the asset-class
// filter strip with the scope chip at its edge, and the spread operators. A class's own name comes
// from the host, whose feed defines the classes; a scope's name and data-source attribution are the
// host's too; symbols, names and venues are data.
export const search = {
  'search.title': 'Symbol search',
  'search.compareTitle': 'Compare symbols',
  'search.changeSymbolTitle': 'Change symbol',
  'search.placeholder': 'Search symbol',
  'search.clear': 'Clear',
  'search.close': 'Close',
  'search.noMatches': 'No symbols match your criteria',
  'search.loadingMore': 'Loading more',
  /** The feed refused or failed the query and nothing cached stands in. */
  'search.failed': 'Search failed.',
  /** The result list's accessible name. */
  'search.results': 'Symbols',
  // Compare mode: the three placements a row adds at, and its empty-query sections.
  'search.samePercent': 'Same % scale',
  'search.newScale': 'New price scale',
  'search.newPane': 'New pane',
  'search.added': 'Added symbols',
  'search.recent': 'Recent symbols',
  /** The checkmark on a row already on the chart. */
  'search.addedMark': '{symbol} is on the chart. Click to remove.',
  'search.compareEmpty': 'No symbols here yet. Why not add some?',
  // The asset-class filter strip: the chip for every class, and the strip's own name.
  'search.allClasses': 'All',
  'search.classFilter': 'Asset class',
  /** The scope chip's accessible name: what pressing it does. `{scope}` is the host's name for the
   *  scope, which the chip shows; whether the limit stands is the chip's pressed state. */
  'search.limitToScope': 'Limit search to {scope}',
  // The spread operators' names, each for the arithmetic it inserts, and the strip's toggle.
  'search.opDivision': 'Division',
  'search.opSubtraction': 'Subtraction',
  'search.opAddition': 'Addition',
  'search.opMultiplication': 'Multiplication',
  'search.opExponentiation': 'Exponentiation',
  'search.opReciprocal': 'Reciprocal',
  'search.opsHide': 'Hide spread operators',
  'search.opsShow': 'Show spread operators',
  /** The operator strip's own name, for the group the toggle shows and hides. */
  'search.ops': 'Spread operators',
} as const

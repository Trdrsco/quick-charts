// The timezone picker and the time label. Zone ids, city names and offsets ("UTC-7") are the zone
// table's own data and carry no key; the picker's name, its exchange row and the quarter a date
// format writes are the chart's words.
export const timezone = {
  'timezone.title': 'Chart timezone',
  /** The row that follows the charted symbol's exchange clock. */
  'timezone.exchange': 'Exchange',
  /** The quarter of a year a date format writes, such as Q3. */
  'timezone.quarter': 'Q{quarter}',
} as const

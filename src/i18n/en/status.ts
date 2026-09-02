// Market status: the legend's status control and its popup. The five session NAMES a title line
// shows live in session.ts (`session.<state>`); these are the states that have no session name
// (a feed that is not live, a market that never closes, a session the feed has not resolved),
// the sentence under the title, and the countdown that fills `{until}`.
export const status = {
  'status.title': 'Market status',
  'status.unknownTitle': 'Session unknown',
  'status.unknown': "This symbol's trading session has not resolved yet.",
  /** The feed serves one bar a day after the close: the title, and the whole sentence. */
  'status.endOfDayTitle': 'End of day',
  'status.endOfDay': 'Prices update once a day, after the session closes.',
  /** A delayed stream: appended to the session sentence through `status.delayedPair`. */
  'status.delayed': 'Prices are delayed.',
  'status.delayedPair': '{status} {delay}',
  /** A `24x7` market. */
  'status.continuousTitle': 'Open 24/7',
  'status.continuous': 'This market trades around the clock and never closes.',
  'status.open': 'Market is open for regular trading.',
  'status.openCloses': 'Market is open for regular trading. Closes in {until}.',
  'status.extended': 'Market is open for extended-hours trading.',
  'status.extendedRegular': 'Market is open for extended-hours trading. Regular hours start in {until}.',
  'status.extendedCloses': 'Market is open for extended-hours trading. Closes in {until}.',
  'status.pre': 'Market is open for pre-market trading.',
  'status.preRegular': 'Market is open for pre-market trading. Regular hours start in {until}.',
  'status.after': 'Market is open for after-hours trading.',
  'status.afterEnds': 'Market is open for after-hours trading. Ends in {until}.',
  'status.closed': 'Market is closed.',
  'status.closedPre': 'Market is closed. Pre-market starts in {until}.',
  'status.closedOpens': 'Market is closed. Opens in {until}.',
  /** The footer under the timeline; `{zone}` is the exchange city and offset. */
  'status.exchangeTimezone': 'Exchange timezone: {zone}',
  // The countdown that fills {until}: one unit, or the coarser unit followed by the finer one.
  // `durationPair` owns the order and the separator, so a language decides both.
  'status.durationDays': { one: '{count} day', other: '{count} days' },
  'status.durationHours': { one: '{count} hour', other: '{count} hours' },
  'status.durationMinutes': { one: '{count} minute', other: '{count} minutes' },
  'status.durationPair': '{major} {minor}',
} as const

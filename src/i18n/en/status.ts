// Market status: the legend's status marks and their popup. The popup's market section names the
// phase (the session names live in session.ts, keyed through SESSION_STATE_TITLE; the overnight
// stretch and a holiday have their own here), says what it means, and counts down to the next
// transition in bold; its data section names a feed that is not a live stream.
export const status = {
  'status.title': 'Market status',
  'status.unknownTitle': 'Session unknown',
  'status.unknown': "This symbol's trading session has not resolved yet.",
  /** The data section for a feed that serves one bar a day after the close: its title and its
   *  sentence. */
  'status.endOfDayTitle': 'End-of-day data',
  'status.endOfDay': 'Prices update once a day, after the session ends.',
  /** The data section for a delayed stream: its title and its sentence. */
  'status.delayedTitle': 'Data is delayed',
  'status.delayedText': "This symbol's prices are delayed.",
  /** The titles of the two phases the session names do not cover. */
  'status.overnightTitle': 'Overnight',
  'status.holidayTitle': 'Holiday',
  /** The sentence under each phase's title. An open market and a continuous one say the same. */
  'status.openText': "All's well, market is open.",
  'status.preText': 'Morning. Market is open for pre-market trading.',
  'status.postText': 'Evening. Market is open for post-market trading.',
  'status.overnightText': 'Hey there, night owl. Market is currently open for overnight trading.',
  'status.extended': 'Market is open for extended-hours trading.',
  'status.closedText': 'Time for a walk, this market is closed.',
  'status.holidayText': 'Market is currently on holiday. Lucky them.',
  /** The countdown, in bold after the sentence, named for where the market goes next. */
  'status.closesIn': "It'll close in {until}.",
  'status.postMarketIn': "It'll go to post-market trading in {until}.",
  'status.overnightIn': 'Overnight trading will start in {until}.',
  'status.extendedIn': "It'll go to extended-hours trading in {until}.",
  'status.preMarketIn': 'Pre-market will start in {until}.',
  'status.opensFullyIn': "It'll open fully in {until}.",
  'status.opensPreMarketIn': "It'll open for pre-market trading in {until}.",
  'status.opensIn': "It'll open in {until}.",
  /** The sentence and the countdown as one line of text. */
  'status.textPair': '{sentence} {countdown}',
  /** The footer under the timeline; `{zone}` is the exchange city and offset. */
  'status.exchangeTimezone': 'Exchange timezone: {zone}',
  // The countdown that fills {until}: one unit, or the coarser unit followed by the finer one.
  // `durationPair` owns the order and the joining words, so a language decides both.
  'status.durationDays': { one: '{count} day', other: '{count} days' },
  'status.durationHours': { one: '{count} hour', other: '{count} hours' },
  'status.durationMinutes': { one: '{count} minute', other: '{count} minutes' },
  'status.durationPair': '{major} and {minor}',
  // The chart reads none of these. They stay in the catalog until the next major, since a
  // dictionary of your own carries every key of the major's baseline.
  'status.delayed': 'Prices are delayed.',
  'status.delayedPair': '{status} {delay}',
  'status.continuousTitle': 'Open 24/7',
  'status.continuous': 'This market trades around the clock and never closes.',
  'status.open': 'Market is open for regular trading.',
  'status.openCloses': 'Market is open for regular trading. Closes in {until}.',
  'status.extendedRegular': 'Market is open for extended-hours trading. Regular hours start in {until}.',
  'status.extendedCloses': 'Market is open for extended-hours trading. Closes in {until}.',
  'status.pre': 'Market is open for pre-market trading.',
  'status.preRegular': 'Market is open for pre-market trading. Regular hours start in {until}.',
  'status.after': 'Market is open for after-hours trading.',
  'status.afterEnds': 'Market is open for after-hours trading. Ends in {until}.',
  'status.closed': 'Market is closed.',
  'status.closedPre': 'Market is closed. Pre-market starts in {until}.',
  'status.closedOpens': 'Market is closed. Opens in {until}.',
} as const

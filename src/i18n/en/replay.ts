// The bar-replay bar: the starting-point split button and its menu, the date picker, the
// transport, the speed and update-interval menus, and the exit. A speed option ('1x'), the bar
// counter's figures and a timeframe token are data and carry no words.
export const replay = {
  // The starting point.
  'replay.selectBar': 'Select bar',
  'replay.selectDate': 'Select date',
  'replay.selectStartingPoint': 'Select starting point',
  'replay.startBar': 'Bar',
  'replay.startDate': 'Date',
  'replay.startRandom': 'Random bar',
  /** The hint while the chart waits for the click that picks the bar. */
  'replay.pickBarHint': 'Click a bar on the chart to start replay there',
  // The Select date dialog.
  'replay.startDateField': 'Replay start date',
  'replay.startTimeField': 'Replay start time (UTC, optional)',
  /** The two fields' format hints, shown as placeholders. */
  'replay.dateMask': 'YYYY-MM-DD',
  'replay.timeMask': 'HH:MM',
  'replay.previousMonth': 'Previous month',
  'replay.nextMonth': 'Next month',
  'replay.cancel': 'Cancel',
  'replay.select': 'Select',
  /** The calendar's column heads, a two-letter form the dialog owns, Monday first. */
  'replay.weekdayMon': 'Mo',
  'replay.weekdayTue': 'Tu',
  'replay.weekdayWed': 'We',
  'replay.weekdayThu': 'Th',
  'replay.weekdayFri': 'Fr',
  'replay.weekdaySat': 'Sa',
  'replay.weekdaySun': 'Su',
  // The transport.
  'replay.stepBack': 'Step back one bar',
  'replay.play': 'Play',
  'replay.pause': 'Pause',
  'replay.stepForward': 'Step forward one bar',
  'replay.goLiveTitle': 'Jump to the live edge',
  'replay.exit': 'Exit replay',
  /** The bar counter; both figures are data. */
  'replay.position': '{cursor} of {total}',
  // Speed. The multiplier itself ('10x') is data; these name what it means.
  'replay.speed': 'Replay speed',
  'replay.updatesPerSecond': { one: '{count} update per second', other: '{count} updates per second' },
  'replay.oneUpdatePerSeconds': { one: '1 update per {count} second', other: '1 update per {count} seconds' },
  // The update interval.
  'replay.interval': 'Update interval',
  'replay.intervalHelp': 'How much time each replay update advances. Finer than the chart interval, each bar forms from real finer bars.',
  /** The interval option that picks the grain itself, rather than a named token. */
  'replay.auto': 'Auto',
  'replay.autoSelectInterval': 'Auto select interval',
} as const

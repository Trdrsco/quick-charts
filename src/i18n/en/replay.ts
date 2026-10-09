// The bar-replay bar: the starting-point split button and its menu, the date picker, the
// transport, the speed and update-timeframe menus, and the exit. A speed option ('1x'), the bar
// counter's figures and a timeframe token are data and carry no words.
export const replay = {
  /** Pane-local watermark and legend status title. */
  'replay.watermark': 'Replay',
  // The starting point.
  'replay.selectBar': 'Select bar',
  'replay.selectDate': 'Select date',
  'replay.selectStartingPoint': 'Select starting point',
  'replay.startBar': 'Bar',
  'replay.startDate': 'Date…',
  'replay.startFirst': 'First available date',
  'replay.startRandom': 'Random bar',
  // The Select date dialog.
  'replay.close': 'Close',
  'replay.startDateField': 'Replay start date',
  'replay.startTimeField': 'Replay start time (UTC, optional)',
  /** The two fields' format hints, shown as placeholders. */
  'replay.dateMask': 'YYYY-MM-DD',
  'replay.timeMask': 'HH:MM',
  /** The clock at the end of the time field, which lists the day in quarter hours. */
  'replay.chooseTime': 'Choose a time',
  /** The calendar's arrows, each naming the month, the year or the span of years it turns to. */
  'replay.previousMonth': 'Previous month, {month}',
  'replay.nextMonth': 'Next month, {month}',
  'replay.previousYear': 'Previous year, {year}',
  'replay.nextYear': 'Next year, {year}',
  'replay.previousYears': 'Previous years, {years}',
  'replay.nextYears': 'Next years, {years}',
  /** The calendar's heading, naming what a press turns it to: the months of a year, a span of
   *  years, or the days of a month. */
  'replay.showMonths': 'Switch to months, {year}',
  'replay.showYears': 'Switch to years, {years}',
  'replay.showDates': 'Switch to dates, {month}',
  /** A span of years by its first and its last. */
  'replay.yearRange': '{from} - {to}',
  /** The band over the months of a year and over a span of years. */
  'replay.months': 'Months',
  'replay.years': 'Years',
  /** The chip that moves the choice to the first day the chart can replay from. */
  'replay.firstAvailableDay': 'Select the first available day',
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
  // Speed. The multiplier itself ('10x') is data; these name what it means.
  'replay.speed': 'Replay speed',
  'replay.updatesPerSecond': { one: '{count} update per second', other: '{count} updates per second' },
  'replay.oneUpdatePerSeconds': { one: '1 update per {count} second', other: '1 update per {count} seconds' },
  // The update timeframe.
  'replay.timeframe': 'Update timeframe',
  'replay.timeframeHelp': 'How much time each replay update advances. Finer than the chart timeframe, each bar forms from real finer bars.',
  /** Why the control is unavailable: this timeframe has nothing finer to form its bars from. */
  'replay.timeframeNone': 'No finer timeframe for this chart timeframe',
  /** The timeframe option that picks the grain itself, rather than a named token. */
  'replay.auto': 'Auto',
  'replay.autoSelectTimeframe': 'Auto select timeframe',
} as const

// The timeframe picker: unit headings, counted timeframes, and the custom-timeframe footer. The
// TOKEN ('5m', '1000t') is the grammar's own and is never translated; these are the words around
// it. The unit names serve both the picker's group headings and the custom-timeframe unit rows.
export const timeframe = {
  'timeframe.title': 'Timeframe',
  'timeframe.all': 'All timeframes',
  'timeframe.unitTicks': 'Ticks',
  'timeframe.unitSeconds': 'Seconds',
  'timeframe.unitMinutes': 'Minutes',
  'timeframe.unitHours': 'Hours',
  'timeframe.unitDays': 'Days',
  'timeframe.unitWeeks': 'Weeks',
  'timeframe.unitMonths': 'Months',
  /** A counted timeframe, one plural per unit: '5t' reads "5 Ticks", '1h' reads "1 Hour". */
  'timeframe.countTicks': { one: '{count} Tick', other: '{count} Ticks' },
  'timeframe.countSeconds': { one: '{count} Second', other: '{count} Seconds' },
  'timeframe.countMinutes': { one: '{count} Minute', other: '{count} Minutes' },
  'timeframe.countHours': { one: '{count} Hour', other: '{count} Hours' },
  'timeframe.countDays': { one: '{count} Day', other: '{count} Days' },
  'timeframe.countWeeks': { one: '{count} Week', other: '{count} Weeks' },
  'timeframe.countMonths': { one: '{count} Month', other: '{count} Months' },
  /** The per-row verbs; `{timeframe}` is the counted timeframe. */
  'timeframe.delete': 'Delete {timeframe}',
  'timeframe.save': 'Save {timeframe}',
  'timeframe.exists': '{timeframe} already exists',
  // The custom-timeframe footer: a count stepper, a unit picker, and Add.
  'timeframe.custom': 'Custom timeframe',
  'timeframe.customCount': 'Custom timeframe count',
  'timeframe.customUnit': 'Custom timeframe unit',
  'timeframe.addCustom': 'Add custom timeframe',
  'timeframe.increment': 'Increment',
  'timeframe.decrement': 'Decrement',
  /** The words the timeframe controls' bubbles show: the caret, and a counted timeframe in a
   *  sentence: '1m' reads "1 minute". */
  'timeframe.intervalTip': 'Chart interval',
  'timeframe.tipTicks': { one: '{count} tick', other: '{count} ticks' },
  'timeframe.tipSeconds': { one: '{count} second', other: '{count} seconds' },
  'timeframe.tipMinutes': { one: '{count} minute', other: '{count} minutes' },
  'timeframe.tipHours': { one: '{count} hour', other: '{count} hours' },
  'timeframe.tipDays': { one: '{count} day', other: '{count} days' },
  'timeframe.tipWeeks': { one: '{count} week', other: '{count} weeks' },
  'timeframe.tipMonths': { one: '{count} month', other: '{count} months' },
} as const

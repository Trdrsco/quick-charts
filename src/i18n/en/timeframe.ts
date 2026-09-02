// The timeframe picker: unit headings, counted intervals, and the custom-interval footer. The
// TOKEN ('5m', '1000t') is the grammar's own and is never translated; these are the words around
// it. The unit names serve both the picker's group headings and the custom-interval unit rows.
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
  /** A counted interval, one plural per unit: '5t' reads "5 Ticks", '1h' reads "1 Hour". */
  'timeframe.countTicks': { one: '{count} Tick', other: '{count} Ticks' },
  'timeframe.countSeconds': { one: '{count} Second', other: '{count} Seconds' },
  'timeframe.countMinutes': { one: '{count} Minute', other: '{count} Minutes' },
  'timeframe.countHours': { one: '{count} Hour', other: '{count} Hours' },
  'timeframe.countDays': { one: '{count} Day', other: '{count} Days' },
  'timeframe.countWeeks': { one: '{count} Week', other: '{count} Weeks' },
  'timeframe.countMonths': { one: '{count} Month', other: '{count} Months' },
  /** The per-row verbs; `{timeframe}` is the counted interval. */
  'timeframe.delete': 'Delete {timeframe}',
  'timeframe.save': 'Save {timeframe}',
  'timeframe.exists': '{timeframe} already exists',
  // The custom-interval footer: a count stepper, a unit picker, and Add.
  'timeframe.custom': 'Custom timeframe',
  'timeframe.customCount': 'Custom timeframe count',
  'timeframe.customUnit': 'Custom timeframe unit',
  'timeframe.addCustom': 'Add custom timeframe',
  'timeframe.increment': 'Increment',
  'timeframe.decrement': 'Decrement',
} as const

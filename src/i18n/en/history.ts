// The chart's own undo history: the two named forms a control wears when there is a change to
// name, and the word for each kind of change. The bare names of the two verbs live in command.ts
// with every other verb, because a control that IS a command reads the command's own name.
//
// A change word is a NOUN PHRASE and lowercase: it is composed into `history.undoNamed` rather than
// shown on its own, so "Undo timeframe change" reads as one sentence.
export const history = {
  /** The undo control when the step it would take back has a name. `{change}` is one of the words
   *  below. */
  'history.undoNamed': 'Undo {change}',
  'history.redoNamed': 'Redo {change}',

  'history.changeSymbol': 'symbol change',
  'history.changeTimeframe': 'timeframe change',
  'history.changeChartStyle': 'chart style change',
  /** How the price axis is read and whether it frames itself: one word for both. */
  'history.changePriceScale': 'price scale change',
  'history.changeAppearance': 'appearance change',
  'history.changeAddCompare': 'add comparison',
  'history.changeRemoveCompare': 'remove comparison',
  'history.changeCompare': 'comparison change',
  'history.changeAddIndicator': 'add indicator',
  'history.changeRemoveIndicator': 'remove indicator',
  'history.changeIndicator': 'indicator change',
  'history.changeAddDrawing': 'add drawing',
  'history.changeRemoveDrawing': 'remove drawing',
  'history.changeDrawing': 'drawing change',
} as const

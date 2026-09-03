// The chart settings menu (appearance, display, price scale, theme) and the indicator settings
// dialog (inputs, style, visibility). Colour values, line widths, precision digits, and the plot,
// level, fill and input names a manifest declares are data and never extracted; a scale mode's
// name and a theme mode's name are the command catalog's.
export const settings = {
  'settings.menu': 'Chart settings',
  'settings.sectionAppearance': 'Appearance',
  'settings.background': 'Background',
  'settings.upCandles': 'Up candles',
  'settings.downCandles': 'Down candles',
  'settings.upBorders': 'Up borders',
  'settings.downBorders': 'Down borders',
  'settings.upWicks': 'Up wicks',
  'settings.downWicks': 'Down wicks',
  'settings.sectionDisplay': 'Display',
  'settings.gridLines': 'Grid lines',
  'settings.sessionShading': 'Session shading',
  'settings.sectionScale': 'Price scale',
  'settings.sectionTheme': 'Theme',
  // The indicator settings dialog.
  /** The dialog's name; `{name}` is the indicator's name. */
  'settings.indicatorTitle': '{name} settings',
  'settings.tabInputs': 'Inputs',
  'settings.tabStyle': 'Style',
  'settings.tabVisibility': 'Visibility',
  'settings.plots': 'Plots',
  'settings.levels': 'Levels',
  'settings.fills': 'Fills',
  /** Per-row controls; `{name}` is the plot, level or fill name. */
  'settings.colorOf': '{name} color',
  'settings.lineWidthOf': '{name} line width',
  'settings.lineStyleOf': '{name} line style',
  'settings.visibleOf': 'Show {name}',
  'settings.lineStyleSolid': 'Solid',
  'settings.lineStyleDashed': 'Dashed',
  'settings.lineStyleDotted': 'Dotted',
  'settings.precision': 'Precision',
  'settings.precisionDefault': 'Default',
  'settings.labelsOnPriceScale': 'Labels on price scale',
  /** The whole instance's visibility, on the Visibility tab. */
  'settings.showIndicator': 'Show this indicator',
} as const

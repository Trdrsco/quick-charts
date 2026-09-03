// The command registry's own words: what a menu row, a shortcut list or an operator adapter calls
// each built-in verb. Every command the chart registers names a key here, so a host that renders
// the registry renders it in the trader's language without writing a word of its own.
//
// A key is one surface and one name, like every other catalog in this package; a command's ID is a
// dotted path (`chart.style.candles`) and is not a key, because an id is a contract and a key is a
// place in a catalog.
//
// A host CONTRIBUTED command names itself instead, in its own words and its own translations;
// `command.extension` is the fallback a surface uses when it will not read literal text.
export const command = {
  'command.extension': 'Host command',

  // View and navigation.
  'command.viewReset': 'Reset view',
  'command.viewGoLive': 'Go to the live edge',
  'command.viewZoomIn': 'Zoom in',
  'command.viewZoomOut': 'Zoom out',
  'command.viewScrollLeft': 'Scroll back',
  'command.viewScrollRight': 'Scroll forward',

  /** The level the right-click menu was raised at, copied in the symbol's own price format. */
  'command.priceCopy': 'Copy price',

  /** Change the chart's symbol. The symbol is the argument. */
  'command.symbolSet': 'Change symbol',

  // The seven main-series styles.
  'command.styleCandles': 'Candles',
  'command.styleHollow': 'Hollow candles',
  'command.styleBars': 'Bars',
  'command.styleLine': 'Line',
  'command.styleArea': 'Area',
  'command.styleBaseline': 'Baseline',
  'command.styleStepline': 'Step line',

  /** Restyle the chart through its runtime appearance layer. The partial is the argument. */
  'command.appearanceApply': 'Chart appearance',

  // The four price-scale modes.
  'command.scaleNormal': 'Regular price scale',
  'command.scaleLog': 'Logarithmic price scale',
  'command.scalePercent': 'Percentage price scale',
  'command.scaleIndexed': 'Indexed price scale',

  'command.indicatorAdd': 'Add indicator',
  'command.indicatorUpdate': 'Update indicator',
  'command.indicatorsRemoveAll': 'Remove indicators',
  'command.indicatorRemove': 'Remove indicator',
  'command.indicatorHide': 'Hide indicator',
  'command.indicatorShow': 'Show indicator',

  'command.drawingsRemoveAll': 'Remove drawings',
  'command.drawingDeleteSelected': 'Delete selected drawing',
  /** Arm a drawing tool. The tool is the argument, so the ninety tools share one command. */
  'command.drawingArm': 'Drawing tool',
  // The toolbar's switches and menus. Each takes its value as the argument.
  'command.drawingCursor': 'Cursor mode',
  'command.drawingMagnet': 'Magnet',
  'command.drawingStayInMode': 'Stay in drawing mode',
  'command.drawingLockAll': 'Lock all drawings',
  'command.drawingHide': 'Hide drawings or indicators',
  'command.drawingSync': 'Sync drawings across the layout',
  'command.drawingRemoveLockedPolicy': 'Always remove locked drawings',
  'command.drawingFavorite': 'Favorite drawing tool',
  'command.drawingFavoritesBar': 'Favorite drawing tools toolbar',
  // The selected drawing's verbs.
  'command.drawingStyle': 'Drawing style',
  'command.drawingProps': 'Drawing properties',
  'command.drawingLock': 'Lock drawing',
  'command.drawingClone': 'Clone drawing',
  'command.drawingCopy': 'Copy drawing',
  'command.drawingPaste': 'Paste drawing',
  'command.drawingBringToFront': 'Bring drawing to front',
  'command.drawingSendToBack': 'Send drawing to back',
  'command.drawingBringForward': 'Bring drawing forward',
  'command.drawingSendBackward': 'Send drawing backward',
  'command.drawingHideSelected': 'Hide drawing',
  'command.drawingVisibility': 'Drawing visibility on intervals',
  'command.drawingSettings': 'Drawing settings',
  'command.drawingCommitEdit': 'Apply drawing settings',
  'command.drawingPlaceImage': 'Place image',
  'command.drawingTemplateApply': 'Apply drawing template',
  'command.drawingTemplateSave': 'Save drawing template',
  'command.drawingTemplateRemove': 'Remove drawing template',
  'command.drawingTableAddRow': 'Add table row',
  'command.drawingTableAddColumn': 'Add table column',
  /** Disarm the armed drawing tool. */
  'command.drawingCancel': 'Cancel drawing',

  'command.compareOpen': 'Compare or add symbol',
  'command.compareAdd': 'Add comparison',
  'command.compareRemove': 'Remove comparison',
  'command.compareVisible': 'Show or hide a comparison',
  'command.compareChangeSymbol': 'Change compared symbol',

  'command.replayStart': 'Start bar replay',
  'command.replayExit': 'Exit bar replay',
  'command.replayPlay': 'Play replay',
  'command.replayPause': 'Pause replay',
  'command.replayStepForward': 'Step forward',
  'command.replayStepBack': 'Step back',
  'command.replayGoLive': 'Replay to the live edge',
  'command.replaySpeed': 'Replay speed',
  'command.replayInterval': 'Replay update interval',

  'command.timeframeSet': 'Timeframe',
  /** Which subsession intraday bars are shown for. A symbol with no extended hours offers only
   *  the first. */
  'command.subsessionRegular': 'Regular hours',
  'command.subsessionExtended': 'Extended hours',
  'command.rangeSet': 'Date range',
  'command.timezoneSet': 'Timezone',

  'command.themeLight': 'Light theme',
  'command.themeDark': 'Dark theme',
  'command.themeToggle': 'Switch theme',
  'command.themeSet': 'Set theme',

  'command.localeSet': 'Language',

  'command.fullscreenEnter': 'Fullscreen',
  'command.fullscreenExit': 'Exit fullscreen',
  'command.fullscreenToggle': 'Toggle fullscreen',

  'command.imageCapture': 'Capture image',
  'command.imageDownload': 'Download image',
  'command.imageCopy': 'Copy image',

  'command.layoutArrangement': 'Layout',
  'command.layoutActive': 'Active chart',
  'command.layoutSync': 'Chart synchronization',
  'command.layoutSave': 'Save layout',
  'command.layoutRename': 'Rename layout',
  'command.layoutLoad': 'Open layout',
  'command.layoutDelete': 'Delete layout',
  'command.layoutDetach': 'Create new layout',
  'command.layoutAutosave': 'Autosave layout',
} as const

// The drawing WORKFLOW's vocabulary: the rail's groups and section headings, its cursor, magnet,
// lock, hide, sync, remove and favorites controls, and the image picker's words.
//
// The 90 tool NAMES are not here. They live in `tools` beside this file and are read through
// `toolName`, so a tool is named once and translated once wherever it appears. What is here is
// everything around them.
//
// Level values, prices, bar indexes, hex colours, template names a trader typed, emoji and icon
// glyphs are data and never pass through this catalog.
export const drawing = {
  // The rail's tool GROUPS (a button each) and the SECTION headings inside their flyouts. `shapes`
  // and `textNotes` each name both a group and a section: one word, one key.
  'drawing.groupTrend': 'Trend tools',
  'drawing.groupFibGann': 'Fibonacci & Gann',
  'drawing.groupPatterns': 'Patterns',
  'drawing.groupForecast': 'Forecast & measure',
  'drawing.groupGlyphs': 'Emojis & stickers',
  'drawing.shapes': 'Shapes',
  'drawing.textNotes': 'Text & notes',
  'drawing.groupMenu': '{group} menu',
  'drawing.sectionLines': 'Lines',
  'drawing.sectionChannels': 'Channels',
  'drawing.sectionPitchforks': 'Pitchforks',
  'drawing.sectionFibonacci': 'Fibonacci',
  'drawing.sectionGann': 'Gann',
  'drawing.sectionChartPatterns': 'Chart patterns',
  'drawing.sectionElliott': 'Elliott waves',
  'drawing.sectionCycles': 'Cycles',
  'drawing.sectionForecasting': 'Forecasting',
  'drawing.sectionVolumeBased': 'Volume based',
  'drawing.sectionMeasures': 'Measures',
  'drawing.sectionBrushes': 'Brushes',
  'drawing.sectionArrows': 'Arrows',
  'drawing.sectionContent': 'Content',
  'drawing.sectionGlyphs': 'Emojis, stickers, icons',

  // The cursor entry and its flyout.
  'drawing.cursor': 'Cursor',
  'drawing.cursorMenu': 'Cursor menu',
  'drawing.cursorCross': 'Cross',
  'drawing.cursorDot': 'Dot',
  'drawing.cursorArrow': 'Arrow',
  'drawing.cursorEraser': 'Eraser',

  // The rail's actions and switches.
  'drawing.measure': 'Measure',
  'drawing.zoomIn': 'Zoom in',
  'drawing.magnet': 'Magnet',
  'drawing.magnetMenu': 'Magnet menu',
  'drawing.magnetWeak': 'Weak magnet',
  'drawing.magnetStrong': 'Strong magnet',
  'drawing.stayInDrawingMode': 'Stay in drawing mode',
  'drawing.lockAll': 'Lock all drawings',
  'drawing.unlockAll': 'Unlock all drawings',

  // The eye's three subjects, each in both states, and the menu that picks which one it acts on.
  // The eye reaches chart-owned layers only, so All means drawings and indicators.
  'drawing.hideMenu': 'Hide menu',
  'drawing.hideDrawings': 'Hide drawings',
  'drawing.showDrawings': 'Show drawings',
  'drawing.hideIndicators': 'Hide indicators',
  'drawing.showIndicators': 'Show indicators',
  'drawing.hideAll': 'Hide all',
  'drawing.showAll': 'Show all',

  // Drawing sync across a split layout.
  'drawing.syncLabel': 'Sync drawings across the layout',
  'drawing.syncOnHelp': 'New drawings are replicated to all charts in the layout and shown when the same ticker is selected',
  'drawing.syncOffHelp': 'New drawings stay on the chart that drew them',

  // The remove menu NAMES what each row takes. Two independently counted nouns share one row, so
  // each is its own plural phrase and the carrier sentence decides where the language puts them.
  'drawing.removeMenu': 'Remove menu',
  'drawing.removeDrawings': 'Remove drawings',
  'drawing.countDrawings': { one: '{count} drawing', other: '{count} drawings' },
  'drawing.countIndicators': { one: '{count} indicator', other: '{count} indicators' },
  'drawing.removeItems': 'Remove {items}',
  'drawing.removeBoth': 'Remove {drawings} & {indicators}',
  'drawing.nothingToRemove': 'Nothing to remove',
  'drawing.alwaysRemoveLocked': 'Always remove locked drawings',

  // Favorites: the rail's stars and the floating bar they fill.
  'drawing.favTools': 'Favorite drawing tools',
  'drawing.favToolsBar': 'Favorite drawing tools toolbar',
  'drawing.favAdd': 'Add {tool} to favorites',
  'drawing.favRemove': 'Remove {tool} from favorites',
  'drawing.moveToolbar': 'Move toolbar',
  'drawing.moveFavoritesToolbar': 'Move favorites toolbar',

  // The Image tool's picker, and what a refused picture is told.
  'drawing.imageReading': 'Reading...',
  'drawing.chooseImage': 'Choose image',
  'drawing.imageFormats': 'JPG or PNG',
  'drawing.imageMaxSize': 'Max size 2MB',
  'drawing.imageErrorType': 'That file is not a JPG or PNG. Pick one of those two formats.',
  'drawing.imageErrorSize': 'That image is {size}. The limit is 2MB.',
  'drawing.imageErrorRead': 'That file could not be read. Try picking it again.',
  'drawing.imageErrorDecode': 'That image could not be opened. It may be damaged.',
} as const

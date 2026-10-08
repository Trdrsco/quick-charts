// Every glyph the chart's own surfaces wear: the top bar, the legend, the dialogs, the drawing
// toolbar and its bars. Inline SVG markup in `currentColor`, so a recipe's ink is the glyph's ink
// and the package ships no asset and fetches nothing. Each glyph carries the grid it was drawn on,
// so a surface names the glyph and its size and never a viewBox. One object drawn for two optical
// sizes is two glyphs: the bare name is the common one and its twin carries its grid (`trash` on 18
// is every row's, `trash28` is the drawing toolbar's face). The tool miniatures live in the
// drawings' `toolIcons`, the layout arrangements in the chrome's `arrangementGlyphs`.

/** One glyph: its own grid and the inner markup drawn on it. */
export interface Glyph {
  viewBox: string
  body: string
  /** A glyph that is not square keeps its grid's proportion: the size is its HEIGHT and the width
   *  follows this ratio. Square glyphs omit it. */
  aspect?: number
  /** The height the glyph is drawn at when a caller names none. Glyphs drawn at 28 omit it. */
  size?: number
}

const stroke = (d: string, width = 1.5): string => `<path d="${d}" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`
const fill = (d: string): string => `<path d="${d}" fill="currentColor" fill-rule="evenodd"/>`

/** The main-series styles, in CHART_STYLES order. Each is drawn rather than stroked: a bar mark
 *  reads as the thing it names at any size, where a stroked outline of one thins out as it scales.
 *  Every path carries its own fill rule, because the ones with enclosed voids (a hollow body, the
 *  area's stepped fill) depend on it. */
export const STYLE_ICONS = {
  candles: { viewBox: '0 0 28 28', body:
    '<path fill="currentColor" fill-rule="evenodd" d="M17 11v6h3v-6h-3zm-.5-1h4a.5.5 0 0 1 .5.5v7a.5.5 0 0 1-.5.5h-4a.5.5 0 0 1-.5-.5v-7a.5.5 0 0 1 .5-.5z"/>' +
    '<path fill="currentColor" d="M18 7h1v3.5h-1zm0 10.5h1V21h-1z"/>' +
    '<path fill="currentColor" fill-rule="evenodd" d="M9 8v12h3V8H9zm-.5-1h4a.5.5 0 0 1 .5.5v13a.5.5 0 0 1-.5.5h-4a.5.5 0 0 1-.5-.5v-13a.5.5 0 0 1 .5-.5z"/>' +
    '<path fill="currentColor" d="M10 4h1v3.5h-1zm0 16.5h1V24h-1z"/>',
  },
  hollow: { viewBox: '0 0 28 28', body:
    '<path fill="currentColor" fill-rule="evenodd" d="M16.5 10h4a.5.5 0 0 1 .5.5v7a.5.5 0 0 1-.5.5h-4a.5.5 0 0 1-.5-.5v-7a.5.5 0 0 1 .5-.5ZM17 11v6h3v-6h-3Z"/>' +
    '<path fill="currentColor" d="M18 7h1v3.5h-1zm0 10.5h1V21h-1z"/>' +
    '<path fill="currentColor" fill-rule="evenodd" d="M9 8v12h3V8H9zm-.5-1h4a.5.5 0 0 1 .5.5v13a.5.5 0 0 1-.5.5h-4a.5.5 0 0 1-.5-.5v-13a.5.5 0 0 1 .5-.5z"/>' +
    '<path fill="currentColor" d="M10 4h1v3.5h-1zm0 16.5h1V24h-1z"/>' +
    '<path fill="currentColor" d="M9.5 8.5h2v11h-2z"/>',
  },
  bars: { viewBox: '0 0 28 28', body: '<path fill="currentColor" d="M19 6h-1v7h-3v1h3v8h1v-3h3v-1h-3V6ZM11 7h-1v13H7v1h3v2h1V10h3V9h-3V7Z"/>' },
  line: { viewBox: '0 0 28 28', body: '<path fill="currentColor" d="m25.39 7.31-8.83 10.92-6.02-5.47-7.16 8.56-.76-.64 7.82-9.36 6 5.45L24.61 6.7l.78.62Z"/>' },
  area: { viewBox: '0 0 28 28', body: '<path fill="currentColor" fill-rule="evenodd" d="m25.35 5.35-9.5 9.5-.35.36-.35-.36-4.65-4.64-8.15 8.14-.7-.7 8.5-8.5.35-.36.35.36 4.65 4.64 9.15-9.14.7.7ZM2 21h1v1H2v-1Zm2-1H3v1h1v1h1v-1h1v1h1v-1h1v1h1v-1h1v1h1v-1h1v1h1v-1h1v1h1v-1h1v1h1v-1h1v1h1v-1h1v1h1v-1h1v1h1v-1h1v1h1v-1h-1v-1h1v-1h-1v-1h1v-1h-1v-1h1v-1h-1v-1h1v-1h-1v-1h1v-1h-1v-1h1V9h-1v1h-1v1h-1v1h-1v1h-1v1h-1v1h-1v1h-1v1h-1v1h-1v-1h-1v-1h-1v-1h-1v-1h-1v-1h-1v1H9v1H8v1H7v1H6v1H5v1H4v1Zm1 0v1H4v-1h1Zm1 0H5v-1h1v1Zm1 0v1H6v-1h1Zm0-1H6v-1h1v1Zm1 0H7v1h1v1h1v-1h1v1h1v-1h1v1h1v-1h1v1h1v-1h1v1h1v-1h1v1h1v-1h1v1h1v-1h1v1h1v-1h1v-1h-1v-1h1v-1h-1v-1h1v-1h-1v-1h1v-1h-1v-1h1v-1h-1v1h-1v1h-1v1h-1v1h-1v1h-1v1h-1v1h-1v1h-1v-1h-1v-1h-1v-1h-1v-1h-1v-1h-1v1H9v1H8v1H7v1h1v1Zm1 0v1H8v-1h1Zm0-1H8v-1h1v1Zm1 0H9v1h1v1h1v-1h1v1h1v-1h1v1h1v-1h-1v-1h-1v-1h-1v-1h-1v-1h-1v1H9v1h1v1Zm1 0v1h-1v-1h1Zm0-1v-1h-1v1h1Zm0 0v1h1v1h1v-1h-1v-1h-1Zm6 2v-1h1v1h-1Zm2 0v1h-1v-1h1Zm0-1h-1v-1h1v1Zm1 0h-1v1h1v1h1v-1h1v1h1v-1h-1v-1h1v-1h-1v-1h1v-1h-1v-1h1v-1h-1v1h-1v1h-1v1h-1v1h1v1Zm1 0h-1v1h1v-1Zm0-1h1v1h-1v-1Zm0-1h1v-1h-1v1Zm0 0v1h-1v-1h1Zm-4 3v1h-1v-1h1Z"/>' },
  baseline: { viewBox: '0 0 28 28', body: '<path fill="currentColor" d="m10.49 7.55-.42.7-2.1 3.5.86.5 1.68-2.8 1.8 2.82.84-.54-2.23-3.5-.43-.68Zm12.32 4.72-.84-.54 2.61-4 .84.54-2.61 4Zm-5.3 6.3 1.2-1.84.84.54-1.63 2.5-.43.65-.41-.65-1.6-2.5.85-.54 1.17 1.85ZM4.96 16.75l.86.52-2.4 4-.86-.52 2.4-4ZM3 14v1h1v-1H3Zm2 0h1v1H5v-1Zm2 0v1h1v-1H7Zm2 0h1v1H9v-1Zm2 0v1h1v-1h-1Zm2 0h1v1h-1v-1Zm2 0v1h1v-1h-1Zm2 0h1v1h-1v-1Zm2 0v1h1v-1h-1Zm2 0h1v1h-1v-1Zm2 0v1h1v-1h-1Zm2 0h1v1h-1v-1Z"/>' },
  stepline: { viewBox: '0 0 28 28', body: '<path fill="currentColor" d="M19 5h5v1h-4v13h-6v-7h-4v12H5v-1h4V11h6v7h4V5Z"/>' },
} as const satisfies Record<string, Glyph>

export const ICONS = {
  legendEye: { viewBox: '0 0 18 18', body: "<path fill=\"currentColor\" fill-rule=\"evenodd\" d=\"M9 5c-2.1 0-3.77 1.18-4.92 2.4A11.5 11.5 0 0 0 2.56 9.4L2.5 9.5l.06.1a11.5 11.5 0 0 0 1.52 2C5.23 12.82 6.9 14 9 14s3.77-1.18 4.92-2.4a11.5 11.5 0 0 0 1.52-2l.06-.1-.06-.1a11.5 11.5 0 0 0-1.52-2C12.77 6.18 11.1 5 9 5Zm7.5 4.5.45-.22-.01-.02a6.05 6.05 0 0 0-.11-.21 12.5 12.5 0 0 0-1.68-2.35C13.9 5.4 11.98 4 9 4S4.1 5.4 2.85 6.7a12.5 12.5 0 0 0-1.79 2.56l-.01.02.45.22-.45.22.01.02.11.21a12.5 12.5 0 0 0 1.68 2.35C4.1 13.6 6.02 15 9 15s4.9-1.4 6.15-2.7a12.5 12.5 0 0 0 1.79-2.56l.01-.02-.45-.22ZM10.5 9.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Zm1 0a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Z\" />" },
  legendEyeOff: { viewBox: '0 0 18 18', body: "<path fill=\"currentColor\" fill-rule=\"evenodd\" d=\"M9 5c-2.1 0-3.77 1.18-4.92 2.4A11.5 11.5 0 0 0 2.56 9.4L2.5 9.5l.06.1a11.5 11.5 0 0 0 1.52 2C5.23 12.82 6.9 14 9 14s3.77-1.18 4.92-2.4a11.5 11.5 0 0 0 1.52-2l.06-.1-.06-.1a11.5 11.5 0 0 0-1.52-2C12.77 6.18 11.1 5 9 5Zm7.5 4.5.45-.22-.01-.02a6.05 6.05 0 0 0-.11-.21 12.5 12.5 0 0 0-1.68-2.35C13.9 5.4 11.98 4 9 4S4.1 5.4 2.85 6.7a12.5 12.5 0 0 0-1.79 2.56l-.01.02.45.22-.45.22.01.02.11.21a12.5 12.5 0 0 0 1.68 2.35C4.1 13.6 6.02 15 9 15s4.9-1.4 6.15-2.7a12.5 12.5 0 0 0 1.79-2.56l.01-.02-.45-.22ZM10.5 9.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Zm1 0a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Z\" /> <path d=\"M3.5 2.5l11 14\" stroke=\"currentColor\" stroke-linecap=\"round\" />" },
  legendSettings: { viewBox: '0 0 18 18', body: "<path fill=\"currentColor\" fill-rule=\"evenodd\" d=\"m3.1 9 2.28-5h7.24l2.28 5-2.28 5H5.38L3.1 9Zm1.63-6h8.54L16 9l-2.73 6H4.73L2 9l2.73-6Zm5.77 6a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Zm1 0a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Z\" />" },
  // THE trash, on the 18 grid every row control that carries one uses: the legend's compare rows,
  // the saved-layout rows and the timeframe list's custom rows.
  trash: { viewBox: '0 0 18 18', body: "<path fill=\"currentColor\" d=\"M7.5 4a.5.5 0 0 0-.5.5V5h4v-.5a.5.5 0 0 0-.5-.5h-3ZM12 5h3v1h-1.05l-.85 7.67A1.5 1.5 0 0 1 11.6 15H6.4a1.5 1.5 0 0 1-1.5-1.33L4.05 6H3V5h3v-.5C6 3.67 6.67 3 7.5 3h3c.83 0 1.5.67 1.5 1.5V5ZM5.06 6l.84 7.56a.5.5 0 0 0 .5.44h5.2a.5.5 0 0 0 .5-.44L12.94 6H5.06Z\" />" },
  legendChevron: { viewBox: '0 0 15 15', body: "<path fill=\"currentColor\" d=\"M3.5 5.58c.24-.28.65-.3.92-.07L7.5 8.14l3.08-2.63a.65.65 0 1 1 .84.98L7.5 9.86 3.58 6.49a.65.65 0 0 1-.07-.91z\" />" },
  paneCollapse: { viewBox: '0 0 18 18', body: "<path stroke=\"currentColor\" d=\"M3 4.5h12M3 13.5h12M9 6.5v-2M7.5 6l1.5 1.5L10.5 6M9 11.5v2M7.5 12l1.5-1.5L10.5 12\" />" },
  paneRestore: { viewBox: '0 0 18 18', body: "<path stroke=\"currentColor\" d=\"M3 4.5h12M3 13.5h12M9 5v3M7.5 7.5L9 9l1.5-1.5M9 13v-3M7.5 10.5L9 9l1.5 1.5\" />" },
  paneMaximize: { viewBox: '0 0 18 18', body: "<path stroke=\"currentColor\" d=\"M3.5 4.5h11v9h-11z\" /> <path stroke=\"currentColor\" d=\"M6 9h6M9 6.5v5M7.5 8L9 6.5 10.5 8M7.5 10L9 11.5 10.5 10\" />" },
  /** The product's own mark, on its native 120 grid. Every chart carries it in the plot's corner. */
  productMark: { viewBox: '0 0 120 120', body:
    '<path fill="currentColor" d="M113 2.5A7 7 0 0 1 120 9.5L120 71.5A6 6 0 0 1 114 77.5L83 77.5A3 3 0 0 1 80 74.5L80 42.5A4 4 0 0 1 84 38.5L110 38.5A4 4 0 0 0 114 34.5L114 12.5A4 4 0 0 0 110 8.5L10 8.5A4 4 0 0 0 6 12.5L6 34.5A4 4 0 0 0 10 38.5L36 38.5A4 4 0 0 1 40 42.5L40 74.5A3 3 0 0 1 37 77.5L6 77.5A6 6 0 0 1 0 71.5L0 9.5A7 7 0 0 1 7 2.5Z"/>' +
    '<path fill="currentColor" d="M40 77.5H80V110.5A7 7 0 0 1 73 117.5H47A7 7 0 0 1 40 110.5Z"/>',
  },
  /** The market-status mark, on its native 18 grid. */
  marketStatus: { viewBox: '0 0 18 18', body: '<circle cx="9" cy="9" r="7" fill="currentColor" opacity="0.2"/><path fill="currentColor" d="M9 5a4 4 0 1 1 0 8 4 4 0 0 1 0-8"/>' },
  /** The replay marks, on their native 18 grid. */
  // The disc carries the phase in `currentColor`; the rewind stays ONE ink in both modes, because a
  // mark that changed the colour of its own shape between modes would read as a different mark.
  replayStatus: { viewBox: '0 0 18 18', body: '<circle cx="9" cy="9" r="9" fill="currentColor"/><path d="M8 5.5v7L4.5 9 8 5.5Zm5 0v7L9.5 9 13 5.5Z" fill="var(--qc-state-markInk)"/>' },
  replayMark: { viewBox: '0 0 18 18', body: '<path fill="currentColor" fill-rule="evenodd" d="M9 0a9 9 0 1 1 0 18A9 9 0 0 1 9 0ZM8 5.5 4.5 9 8 12.5v-7Zm5 0L9.5 9l3.5 3.5v-7Z"/>' },
  /** The cut the arming guide is offering. Turned upright to sit on a VERTICAL rule: the blades
   *  cross above the pointer and the handles hang below it, so the shape reads along the line it
   *  rides rather than across it. Open strokes, no plate behind them, so the rule stays whole
   *  through the mark. */
  replayCut: { viewBox: '0 0 18 18', body:
    stroke('M5.3 3 11.4 12.2M12.7 3 6.6 12.2', 1.4) +
    '<circle cx="5" cy="14" r="2.3" fill="none" stroke="currentColor" stroke-width="1.4"/>' +
    '<circle cx="13" cy="14" r="2.3" fill="none" stroke="currentColor" stroke-width="1.4"/>',
  },
  comparePlus: { viewBox: '0 0 28 28', body: '<path fill="currentColor" d="M13.5 6a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM4 14.5a9.5 9.5 0 1 1 19 0 9.5 9.5 0 0 1-19 0z"/><path fill="currentColor" d="M9 14h4v-4h1v4h4v1h-4v4h-1v-4H9v-1z"/>' },
  // Bars under a trend line: the line a one-unit stroke, the bars one filled mark.
  indicators: { viewBox: '0 0 28 28', body:
    '<path stroke="currentColor" d="M6 12l4.8-4.8a1 1 0 0 1 1.4 0l2.7 2.7a1 1 0 0 0 1.3.1L23 5"/>' +
    '<path fill="currentColor" fill-rule="evenodd" d="M19 12a1 1 0 0 0-1 1v4h-3v-1a1 1 0 0 0-1-1h-3a1 1 0 0 0-1 1v2H7a1 1 0 0 0-1 1v4h17V13a1 1 0 0 0-1-1h-3zm0 10h3v-9h-3v9zm-1 0v-4h-3v4h3zm-4-4.5V22h-3v-6h3v1.5zM10 22v-3H7v3h3z"/>',
  },
  // A double rewind: two open triangles at the one-unit weight.
  replay: { viewBox: '0 0 28 28', body: '<path fill="none" stroke="currentColor" d="M13.5 20V9l-6 5.5 6 5.5zM21.5 20V9l-6 5.5 6 5.5z"/>' },
  // A step back and a step forward through the chart's own history: an arrow turning under itself,
  // and the same mark facing the other way, each one filled mark.
  undo: { viewBox: '0 0 28 28', body: '<path fill="currentColor" d="M8.707 13l2.647 2.646-.707.708L6.792 12.5l3.853-3.854.708.708L8.707 12H14.5a5.5 5.5 0 0 1 5.5 5.5V19h-1v-1.5a4.5 4.5 0 0 0-4.5-4.5H8.707z"/>' },
  redo: { viewBox: '0 0 28 28', body: '<path fill="currentColor" d="M18.293 13l-2.647 2.646.707.708 3.854-3.854-3.854-3.854-.707.708L18.293 12H12.5A5.5 5.5 0 0 0 7 17.5V19h1v-1.5a4.5 4.5 0 0 1 4.5-4.5h5.793z"/>' },
  settings: { viewBox: '0 0 28 28', body:
    fill('M18 14a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm-1 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z')
    + fill('M8.5 5h11l5 9-5 9h-11l-5-9 5-9Zm-3.86 9L9.1 6h9.82l4.45 8-4.45 8H9.1l-4.45-8Z'),
  },
  // Enter fullscreen: four corner brackets turning outward, drawn as a one-unit
  // wall on the 28 grid.
  fullscreen: { viewBox: '0 0 28 28', body: fill('M7 18.5A2.5 2.5 0 0 0 9.5 21H12v1H9.5A3.5 3.5 0 0 1 6 18.5V16h1zm15 0a3.5 3.5 0 0 1-3.5 3.5H16v-1h2.5a2.5 2.5 0 0 0 2.5-2.5V16h1zM12 7H9.5A2.5 2.5 0 0 0 7 9.5V12H6V9.5A3.5 3.5 0 0 1 9.5 6H12zm6.5-1A3.5 3.5 0 0 1 22 9.5V12h-1V9.5A2.5 2.5 0 0 0 18.5 7H16V6z') },
  // Exit fullscreen: the same brackets folded inward, stroked at a 1.5 weight.
  exitFullscreen: { viewBox: '0 0 28 28', body: stroke('M11 6v1.5A3.5 3.5 0 0 1 7.5 11H6M22 11h-1.5A3.5 3.5 0 0 1 17 7.5V6M17 22v-1.5a3.5 3.5 0 0 1 3.5-3.5H22M6 17h1.5a3.5 3.5 0 0 1 3.5 3.5V22', 1.5) },
  // Chart image: a camera, a one-unit-walled body with the shutter hump left of centre
  // and the lens ring offset toward it.
  camera: { viewBox: '0 0 28 28', body:
    fill('M11.118 6a.5.5 0 0 0-.447.276L9.809 8H5.5A1.5 1.5 0 0 0 4 9.5v10A1.5 1.5 0 0 0 5.5 21h16a1.5 1.5 0 0 0 1.5-1.5v-10A1.5 1.5 0 0 0 21.5 8h-4.309l-.862-1.724A.5.5 0 0 0 15.882 6h-4.764zm-1.342-.17A1.5 1.5 0 0 1 11.118 5h4.764a1.5 1.5 0 0 1 1.342.83L17.809 7H21.5A2.5 2.5 0 0 1 24 9.5v10a2.5 2.5 0 0 1-2.5 2.5h-16A2.5 2.5 0 0 1 3 19.5v-10A2.5 2.5 0 0 1 5.5 7h3.691l.585-1.17z')
    + fill('M13.5 18a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zm0 1a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9z'),
  },
  /** The layout tile's own maximize and restore marks, on their native 18 grid: two
   *  opposite corner brackets turning outward to fill the layout, and inward to give the tile back. */
  tileMaximize: { viewBox: '0 0 18 18', body: '<path fill="currentColor" d="M14.5 8V3.5H10V2h6v6h-1.5Zm-11 2v4.5H8V16H2v-6h1.5Z"/>' },
  tileRestore: { viewBox: '0 0 18 18', body: '<path fill="currentColor" d="M10 8V2h1.5v4.5H16V8h-6Zm-2 2v6H6.5v-4.5H2V10h6Z"/>' },
  /** The on-chart navigation cluster's five marks, on the same 18 grid the tile marks use and
   *  filled rather than stroked: they sit in 24px chips over the bars, where a hairline outline
   *  goes grey against a candle. One chevron serves both directions; the back button turns it. */
  navZoomOut: { viewBox: '0 0 18 18', body: '<path fill="currentColor" d="M14 10H4V8.5h10V10Z"/>' },
  navZoomIn: { viewBox: '0 0 18 18', body: '<path fill="currentColor" d="M8.25 13.75v-9.5h1.5v9.5h-1.5Z"/><path fill="currentColor" d="M13.75 9.75h-9.5v-1.5h9.5v1.5Z"/>' },
  navScroll: { viewBox: '0 0 18 18', body: '<path fill="currentColor" d="M7.83 3.92 12.28 9l-4.45 5.08-1.13-1L10.29 9l-3.6-4.09 1.14-.99Z"/>' },
  navReset: { viewBox: '0 0 18 18', body: '<path fill="currentColor" d="M10 6.38V8L6 5.5 10 3v1.85A5.25 5.25 0 1 1 3.75 10a.75.75 0 0 1 1.5 0A3.75 3.75 0 1 0 10 6.38Z"/>' },
  /** The pickers' wide caret, on its native 16 by 8 grid: the trigger arrow, which
   *  renders half size beside a picker's text. */
  menuArrowWide: { viewBox: '0 0 16 8', body: '<path fill="currentColor" d="M0 1.475l7.396 6.04.596.485.593-.49L16 1.39 14.807 0 7.393 6.122 8.58 6.12 1.186.08z"/>' },
  // Hairline weight: these two sit beside a label rather than alone in a 38px cell.
  download: { viewBox: '0 0 28 28', body: '<path fill="currentColor" d="M7 17v4.5a.5.5 0 0 0 .5.5h14a.5.5 0 0 0 .5-.5V17h1v4.5a1.5 1.5 0 0 1-1.5 1.5h-14A1.5 1.5 0 0 1 6 21.5V17zm8-11v11.293l3.146-3.146.707.707-4.353 4.353-4.353-4.353.707-.707L14 17.293V6z"/>' },
  copy: { viewBox: '0 0 28 28', body:
    '<g fill="none" fill-rule="evenodd" stroke="currentColor">' +
    '<path d="M13.111 18.5H10.5a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1h11a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-8.389z"/>' +
    '<path d="M18.5 20v1.5a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1H8"/>' +
    '</g>',
  },
  chevronDown: { viewBox: '0 0 28 28', body: stroke('M8 11l6 6 6-6', 1.7) },
  chevronUp: { viewBox: '0 0 28 28', body: stroke('M8 17l6-6 6 6', 1.7) },
  chevronLeft: { viewBox: '0 0 28 28', body: stroke('M17 8l-6 6 6 6', 1.7) },
  chevronRight: { viewBox: '0 0 28 28', body: stroke('M11 8l6 6-6 6', 1.7) },
  check: { viewBox: '0 0 28 28', body: '<path fill="currentColor" d="M22 9.06 11 20 6 14.7l1.09-1.02 3.94 4.16L20.94 8 22 9.06Z"/>' },
  close: { viewBox: '0 0 28 28', body: stroke('M7 7l14 14M21 7 7 21', 1.6) },
  /** A hairline cross on its own 17 grid: the close a whole row carries at its far end. */
  closeThin: { viewBox: '0 0 17 17', body: '<path fill="currentColor" d="m.58 1.42.82-.82 15 15-.82.82z"/><path fill="currentColor" d="m.58 15.58 15-15 .82.82-15 15z"/>' },
  // The magnifier is DRAWN, not stroked: it stands at full size in the search field's own row,
  // where a stroked ring thins out beside a 15px value and reads as a lighter mark than the text.
  search: { viewBox: '0 0 28 28', body: '<path fill="currentColor" d="M12.182 4a8.18 8.18 0 0 1 6.29 13.412l5.526 5.525-1.06 1.06-5.527-5.525A8.182 8.182 0 1 1 12.181 4m0 1.5a6.681 6.681 0 1 0 0 13.363 6.681 6.681 0 0 0 0-13.363"/>' },
  // The operator strip's toggle, on the 18 grid it was drawn on: a card of arithmetic with a chevron
  // at its open edge, pointing out to show the strip and back in to hide it.
  spreadOpsShow: { viewBox: '0 0 18 18', body: '<path fill="currentColor" d="M15 2a2 2 0 0 1 2 2v10a2 2 0 0 1-1.8 1.99L15 16H5l-.2-.01A2 2 0 0 1 3 14.2L3 14h1a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1H3c0-1.1.9-2 2-2zm-7 9h1v1H8v1H7v-1H6v-1h1v-1h1zm6 2h-3v-1h3zM4.27 6.64 2.3 9l1.97 2.36-.77.64L1 9l2.5-3zM14 11h-3v-1h3zm-1.5-5.2.8-.8.7.7-.8.8.8.8-.7.7-.8-.79-.8.79-.7-.7.79-.8-.79-.8.7-.7zM9 7H6V6h3z"/>' },
  spreadOpsHide: { viewBox: '0 0 18 18', body: '<path fill="currentColor" d="M15 2a2 2 0 0 1 2 2v10a2 2 0 0 1-1.8 1.99L15 16H5l-.2-.01A2 2 0 0 1 3 14.2L3 14h1a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1H3c0-1.1.9-2 2-2zm-7 9h1v1H8v1H7v-1H6v-1h1v-1h1zm6 2h-3v-1h3zM4.42 9l-2.68 3-.74-.66L3.08 9 1 6.66l.75-.67zM14 11h-3v-1h3zm-1.5-5.2.8-.8.7.7-.8.8.8.8-.7.7-.8-.79-.8.79-.7-.7.79-.8-.79-.8.7-.7zM9 7H6V6h3z"/>' },
  // A FILLED disc with the cross cut out of it, on the 18 grid, so the mark reads as a solid
  // control to press rather than as a thin ring the eye has to find. Drawn beside a text field at
  // its own size, which is why it does not share the 28 grid the toolbar marks are drawn on.
  clear: { viewBox: '0 0 18 18', body: '<path fill="currentColor" fill-rule="evenodd" d="M9 17A8 8 0 1 0 9 1a8 8 0 0 0 0 16Zm0-9.04L6.04 5 5 6.04 7.96 9 5 11.96 6.04 13 9 10.04 11.96 13 13 11.96 10.04 9 13 6.04 11.96 5 9 7.96Z"/>' },
  plus: { viewBox: '0 0 28 28', body: stroke('M14 6v16M6 14h16', 1.7) },
  goLive: { viewBox: '0 0 28 28', body:
    fill(
    'M18 22V6h1v16h-1ZM8.834 7.996l6.258 5.632a.5.5 0 0 1 0 .744l-6.258 5.632A.5.5 0 0 1 8 19.632V8.368a.5.5 0 0 1 .834-.372Zm6.927 4.89a1.5 1.5 0 0 1 0 2.229l-6.258 5.632C8.538 21.616 7 20.93 7 19.632V8.368C7 7.07 8.538 6.384 9.503 7.253l6.258 5.632ZM21 6v16h1V6h-1Z',
  ),
  },
  play: { viewBox: '0 0 28 28', body:
    fill(
    'm10.997 6.93 7.834 6.628a.58.58 0 0 1 0 .88l-7.834 6.627c-.359.303-.897.04-.897-.44V7.37c0-.48.538-.743.897-.44Zm8.53 5.749a1.741 1.741 0 0 1 0 2.637l-7.834 6.628c-1.076.91-2.692.119-2.692-1.319V7.37c0-1.438 1.616-2.23 2.692-1.319l7.834 6.628Z',
  ),
  },
  pause: { viewBox: '0 0 28 28', body: fill('M10 6h2v16h-2V6ZM9 6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1V6Zm7 0h2v16h-2V6Zm-1 0a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1V6Z') },
  stepForward: { viewBox: '0 0 28 28', body:
    fill(
    'M20 6v16h1V6h-1Zm-3.908 7.628L9.834 7.996A.5.5 0 0 0 9 8.368v11.264a.5.5 0 0 0 .834.372l6.258-5.632a.5.5 0 0 0 0-.744Zm.67 1.487a1.5 1.5 0 0 0 0-2.23l-6.259-5.632C9.538 6.384 8 7.07 8 8.368v11.264c0 1.299 1.538 1.984 2.503 1.115l6.258-5.632Z',
  ),
  },
  stepBack: { viewBox: '0 0 28 28', body:
    `<g transform="translate(28,0) scale(-1,1)">${fill(
    'M20 6v16h1V6h-1Zm-3.908 7.628L9.834 7.996A.5.5 0 0 0 9 8.368v11.264a.5.5 0 0 0 .834.372l6.258-5.632a.5.5 0 0 0 0-.744Zm.67 1.487a1.5 1.5 0 0 0 0-2.23l-6.259-5.632C9.538 6.384 8 7.07 8 8.368v11.264c0 1.299 1.538 1.984 2.503 1.115l6.258-5.632Z',
  )}</g>`,
  },
  calendar: { viewBox: '0 0 28 28', body:
    fill(
    'M9 5V3H8v2H6a3 3 0 0 0-3 3v13a3 3 0 0 0 3 3h15a3 3 0 0 0 3-3V8a3 3 0 0 0-3-3h-2V3h-1v2H9Zm9 3V6H9v2H8V6H6a2 2 0 0 0-2 2v2h19V8a2 2 0 0 0-2-2h-2v2h-1ZM4 21V11h19v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Zm9-7.88V12l-.84.75-3.74 3.37-.42.38.41.37 3.75 3.38.84.75v-4h7v-1h-7v-2.88Zm-1 5.63L9.5 16.5l2.5-2.26v4.51Z',
  ),
  },
  selectBar: { viewBox: '0 0 28 28', body: fill('M10 6H8v16h2V6ZM8 5a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1H8Zm15 9.5h-6V19l-5-5 5-5v4.5h6v1Zm-9.586-.5L16 11.414v5.172L13.414 14Z') },
  // The first available date: a flag planted where the line begins. Its cut-outs overlap, so it keeps
  // the default fill rule rather than the even-odd one the other replay marks are drawn with.
  firstAvailable: { viewBox: '0 0 28 28', body: '<path fill="currentColor" d="M8 5.01c.807-.481 2.303-1.614 5.668-.601l.332.104c3.6 1.19 6 .496 7-.496v7.94c-.834.661-3.8 1.686-7 .496-2.334-.869-3.923-.506-5-.028v6.624c.98.2 1.752.972 1.95 1.952H22v1H10.95q.013-.079.024-.159A2.497 2.497 0 0 1 6 21.5a2.5 2.5 0 0 1 2-2.45zM8.5 20a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3m5.185-14.538c-1.658-.548-2.764-.522-3.505-.357A4 4 0 0 0 9 5.58v5.768a6.6 6.6 0 0 1 .972-.285c1.17-.243 2.611-.205 4.377.452a7.8 7.8 0 0 0 3.887.396A6.4 6.4 0 0 0 20 11.394v-5.64c-1.544.544-3.71.57-6.315-.292"/>' },
  randomBar: { viewBox: '0 0 28 28', body:
    fill(
    'M19.4 5.33a.1.1 0 0 1-.07.06l-4.26 1.52a.1.1 0 0 0 0 .18l4.26 1.52a.1.1 0 0 1 .06.06l1.52 4.26a.1.1 0 0 0 .18 0l1.52-4.26a.1.1 0 0 1 .06-.06l4.26-1.52a.1.1 0 0 0 0-.18l-4.26-1.52a.1.1 0 0 1-.06-.06l-1.52-4.26a.1.1 0 0 0-.18 0l-1.52 4.26ZM21 3.81l-.66 1.86a1.1 1.1 0 0 1-.67.67L17.8 7l1.86.66c.31.11.56.36.67.67L21 10.2l.66-1.86c.11-.31.36-.56.67-.67L24.2 7l-1.86-.66a1.1 1.1 0 0 1-.67-.67L21 3.8ZM8.5 11a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z',
  ),
  },
  // The saved-layouts menu's marks, at the hairline weight of the words beside them: a folder with
  // its tab, a pencil, one square lifted off another, and a plus as thin as a stroke of the text.
  folder: { viewBox: '0 0 28 28', body: '<path fill="currentColor" d="M5 7.5C5 6.67 5.67 6 6.5 6h4.2l2 2h8.8c.83 0 1.5.67 1.5 1.5v10c0 .83-.67 1.5-1.5 1.5h-15A1.5 1.5 0 0 1 5 19.5v-12ZM6.5 7a.5.5 0 0 0-.5.5V11h16V9.5a.5.5 0 0 0-.5-.5h-9.2l-2-2H6.5ZM22 12H6v7.5c0 .28.22.5.5.5h15a.5.5 0 0 0 .5-.5V12Z"/>' },
  pencil: { viewBox: '0 0 28 28', body: '<path fill="currentColor" d="M16.73 6.56a2.5 2.5 0 0 1 3.54 0l1.17 1.17a2.5 2.5 0 0 1 0 3.54l-.59.58-9 9-1 1-.14.15H6v-4.7l.15-.15 1-1 9-9 .58-.59Zm2.83.7a1.5 1.5 0 0 0-2.12 0l-.23.24 3.29 3.3.23-.24a1.5 1.5 0 0 0 0-2.12l-1.17-1.17Zm.23 4.24L16.5 8.2l-8.3 8.3 3.3 3.3 8.3-8.3Zm-9 9L7.5 17.2l-.5.5V21h3.3l.5-.5Z"/>' },
  clone: { viewBox: '0 0 28 28', body: '<path stroke="currentColor" d="M8 9.5H6.5a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V20m-8-1.5h11a1 1 0 0 0 1-1v-11a1 1 0 0 0-1-1h-11a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1z"/>' },
  plusThin: { viewBox: '0 0 28 28', body: fill('M13.9 14.1V22h1.2v-7.9H23v-1.2h-7.9V5h-1.2v7.9H6v1.2h7.9z') },
  // A dialog's close on its own 14 grid, drawn at 18px with a stroke that keeps its weight at any size.
  dialogClose: { viewBox: '0 0 14 14', body: '<path stroke="currentColor" stroke-width="1.2" d="m1.5 1.5 11 11m0-11-11 11" vector-effect="non-scaling-stroke"/>' },
  // The Layouts dialog's marks on the 18 grid: a saved row's delete, and the sort control's arrow, down
  // for a descending order and up for an ascending one, over the bars it sorts.
  removeRow: { viewBox: '0 0 18 18', body: fill('M12 4h3v1h-1.04l-.88 9.64a1.5 1.5 0 0 1-1.5 1.36H6.42a1.5 1.5 0 0 1-1.5-1.36L4.05 5H3V4h3v-.5C6 2.67 6.67 2 7.5 2h3c.83 0 1.5.67 1.5 1.5V4ZM7.5 3a.5.5 0 0 0-.5.5V4h4v-.5a.5.5 0 0 0-.5-.5h-3ZM5.05 5l.87 9.55a.5.5 0 0 0 .5.45h5.17a.5.5 0 0 0 .5-.45L12.94 5h-7.9Z') },
  sortDown: { viewBox: '0 0 18 18', body: fill('M5 4v9.05l-2-2.06-.7.7L5.5 15l3.2-3.32-.7-.7-2 2.07V4zM10 6h6V5h-6zM15 10h-5V9h5zM10 14h4v-1h-4z') },
  sortUp: { viewBox: '0 0 18 18', body: fill('M5 15V5.95l-2 2.06-.7-.7L5.5 4l3.2 3.32-.7.7-2-2.07V15zM10 6h6V5h-6zM15 10h-5V9h5zM10 14h4v-1h-4z') },
  // The sort menu's rows carry the same arrows on the 28 grid, stroked like the menu's other marks.
  sortUpRow: { viewBox: '0 0 28 28', body: '<path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M19.5 18.5h-3M21.5 13.5h-5M23.5 8.5h-7M8.5 20.5V7M12.5 11l-4-4-4 4"/>' },
  sortDownRow: { viewBox: '0 0 28 28', body: '<path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M19.5 18.5h-3M21.5 13.5h-5M23.5 8.5h-7M8.5 7v13.5M4.5 16.5l4 4 4-4"/>' },
  cursorCross: { viewBox: '0 0 28 28', body: '<path fill="currentColor" d="M18 15h8v-1h-8z"/><path fill="currentColor" d="M14 18v8h1v-8zM14 3v8h1v-8zM3 15h8v-1h-8z"/>' },
  cursorDot: { viewBox: '0 0 28 28', body: '<circle cx="14" cy="14" r="3" fill="currentColor"/>' },
  cursorArrow: { viewBox: '0 0 28 28', body: '<path fill="currentColor" d="M11.682 16.09l3.504 6.068 1.732-1-3.497-6.057 3.595-2.1L8 7.74v10.512l3.682-2.163zm-.362 1.372L7 20V6l12 7-4.216 2.462 3.5 6.062-3.464 2-3.5-6.062z"/>' },
  eraser: {
    viewBox: '0 0 29 31',
    aspect: 29 / 31,
    size: 31,
    body: '<g fill="currentColor" fill-rule="nonzero"><path d="M15.3 22l8.187-8.187c.394-.394.395-1.028.004-1.418l-4.243-4.243c-.394-.394-1.019-.395-1.407-.006l-11.325 11.325c-.383.383-.383 1.018.007 1.407l1.121 1.121h7.656zm-9.484-.414c-.781-.781-.779-2.049-.007-2.821l11.325-11.325c.777-.777 2.035-.78 2.821.006l4.243 4.243c.781.781.78 2.048-.004 2.832l-8.48 8.48h-8.484l-1.414-1.414z"/><path d="M13.011 22.999h7.999v-1h-7.999zM13.501 11.294l6.717 6.717.707-.707-6.717-6.717z"/></g>',
  },
  magnet: { viewBox: '0 0 28 28', body: '<path fill="currentColor" d="M14 10a2 2 0 0 0-2 2v11H6V12c0-4.416 3.584-8 8-8s8 3.584 8 8v11h-6V12a2 2 0 0 0-2-2zm-3 2a3 3 0 0 1 6 0v10h4V12c0-3.864-3.136-7-7-7s-7 3.136-7 7v10h4V12z"/><path fill="currentColor" d="M6.5 18h5v1h-5zm10 0h5v1h-5z"/>' },
  magnetStrong: { viewBox: '0 0 28 28', body: '<path fill="currentColor" d="M14 5a7 7 0 0 0-7 7v3h4v-3a3 3 0 1 1 6 0v3h4v-3a7 7 0 0 0-7-7zm7 11h-4v3h4v-3zm-10 0H7v3h4v-3zm-5-4a8 8 0 1 1 16 0v8h-6v-8a2 2 0 1 0-4 0v8H6v-8zm3.293 11.294l-1.222-2.037.858-.514 1.777 2.963-2 1 1.223 2.037-.858.514-1.778-2.963 2-1zm9.778-2.551l.858.514-1.223 2.037 2 1-1.777 2.963-.858-.514 1.223-2.037-2-1 1.777-2.963z"/>' },
  pin: { viewBox: '0 0 28 28', body: '<path fill="currentColor" d="M17.27 4.56a2.5 2.5 0 0 0-3.54 0l-.58.59-9 9-1 1-.15.14V20h4.7l.15-.15 1-1 9-9 .59-.58a2.5 2.5 0 0 0 0-3.54l-1.17-1.17Zm-2.83.7a1.5 1.5 0 0 1 2.12 0l1.17 1.18a1.5 1.5 0 0 1 0 2.12l-.23.23-3.3-3.29.24-.23Zm-.94.95 3.3 3.29-8.3 8.3-3.3-3.3 8.3-8.3Zm-9 9 3.3 3.29-.5.5H4v-3.3l.5-.5Zm16.5.29a1.5 1.5 0 0 0-3 0V18h4.5c.83 0 1.5.67 1.5 1.5v4c0 .83-.67 1.5-1.5 1.5h-6a1.5 1.5 0 0 1-1.5-1.5v-4c0-.83.67-1.5 1.5-1.5h.5v-2.5a2.5 2.5 0 0 1 5 0v.5h-1v-.5ZM16.5 19a.5.5 0 0 0-.5.5v4c0 .28.22.5.5.5h6a.5.5 0 0 0 .5-.5v-4a.5.5 0 0 0-.5-.5h-6Zm2.5 4v-2h1v2h-1Z"/>' },
  pinOn: { viewBox: '0 0 28 28', body: '<path fill="currentColor" d="M17.27 4.56a2.5 2.5 0 0 0-3.54 0l-.58.59-9 9-1 1-.15.14V20h4.7l.15-.15 1-1 9-9 .59-.58a2.5 2.5 0 0 0 0-3.54l-1.17-1.17Zm-2.83.7a1.5 1.5 0 0 1 2.12 0l1.17 1.18a1.5 1.5 0 0 1 0 2.12l-.23.23-3.3-3.29.24-.23Zm-.94.95 3.3 3.29-8.3 8.3-3.3-3.3 8.3-8.3Zm-9 9 3.3 3.29-.5.5H4v-3.3l.5-.5Zm16.5.29a1.5 1.5 0 0 0-3 0V18h3v-2.5Zm1 0V18h.5c.83 0 1.5.67 1.5 1.5v4c0 .83-.67 1.5-1.5 1.5h-6a1.5 1.5 0 0 1-1.5-1.5v-4c0-.83.67-1.5 1.5-1.5h.5v-2.5a2.5 2.5 0 0 1 5 0ZM16.5 19a.5.5 0 0 0-.5.5v4c0 .28.22.5.5.5h6a.5.5 0 0 0 .5-.5v-4a.5.5 0 0 0-.5-.5h-6Zm2.5 4v-2h1v2h-1Z"/>' },
  lockOpen: { viewBox: '0 0 28 28', body: '<path fill="currentColor" fill-rule="evenodd" d="M14 6a3 3 0 0 0-3 3v3h8.5a2.5 2.5 0 0 1 2.5 2.5v7a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 6 21.5v-7A2.5 2.5 0 0 1 8.5 12H10V9a4 4 0 0 1 8 0h-1a3 3 0 0 0-3-3zm-1 11a1 1 0 1 1 2 0v2a1 1 0 1 1-2 0v-2zm-6-2.5c0-.83.67-1.5 1.5-1.5h11c.83 0 1.5.67 1.5 1.5v7c0 .83-.67 1.5-1.5 1.5h-11A1.5 1.5 0 0 1 7 21.5v-7z"/>' },
  lockClosed: { viewBox: '0 0 28 28', body: '<path fill="currentColor" fill-rule="evenodd" d="M14 6a3 3 0 0 0-3 3v3h6V9a3 3 0 0 0-3-3zm4 6V9a4 4 0 0 0-8 0v3H8.5A2.5 2.5 0 0 0 6 14.5v7A2.5 2.5 0 0 0 8.5 24h11a2.5 2.5 0 0 0 2.5-2.5v-7a2.5 2.5 0 0 0-2.5-2.5H18zm-5 5a1 1 0 1 1 2 0v2a1 1 0 1 1-2 0v-2zm-6-2.5c0-.83.67-1.5 1.5-1.5h11c.83 0 1.5.67 1.5 1.5v7c0 .83-.67 1.5-1.5 1.5h-11A1.5 1.5 0 0 1 7 21.5v-7z"/>' },
  drawingsShown: { viewBox: '0 0 28 28', body: '<path fill="currentColor" fill-rule="evenodd" d="M5 10.76l-.41-.72-.03-.04.03-.04a15 15 0 012.09-2.9c1.47-1.6 3.6-3.12 6.32-3.12 2.73 0 4.85 1.53 6.33 3.12a15.01 15.01 0 012.08 2.9l.03.04-.03.04a15 15 0 01-2.09 2.9c-1.47 1.6-3.6 3.12-6.32 3.12-2.73 0-4.85-1.53-6.33-3.12a15 15 0 01-1.66-2.18zm17.45-.98L22 10l.45.22-.01.02a5.04 5.04 0 01-.15.28 16.01 16.01 0 01-2.23 3.1c-1.56 1.69-3.94 3.44-7.06 3.44-3.12 0-5.5-1.75-7.06-3.44a16 16 0 01-2.38-3.38v-.02h-.01L4 10l-.45-.22.01-.02a5.4 5.4 0 01.15-.28 16 16 0 012.23-3.1C7.5 4.69 9.88 2.94 13 2.94c3.12 0 5.5 1.75 7.06 3.44a16.01 16.01 0 012.38 3.38v.02h.01zM22 10l.45-.22.1.22-.1.22L22 10zM3.55 9.78L4 10l-.45.22-.1-.22.1-.22zm6.8.22A2.6 2.6 0 0113 7.44 2.6 2.6 0 0115.65 10 2.6 2.6 0 0113 12.56 2.6 2.6 0 0110.35 10zM13 6.44A3.6 3.6 0 009.35 10 3.6 3.6 0 0013 13.56c2 0 3.65-1.58 3.65-3.56A3.6 3.6 0 0013 6.44zm7.85 12l.8-.8.7.71-.79.8a.5.5 0 000 .7l.59.59c.2.2.5.2.7 0l1.8-1.8.7.71-1.79 1.8a1.5 1.5 0 01-2.12 0l-.59-.59a1.5 1.5 0 010-2.12zM16.5 21.5l-.35-.35a.5.5 0 00-.07.07l-1 1.5-1 1.5a.5.5 0 00.42.78h4a2.5 2.5 0 001.73-.77A2.5 2.5 0 0021 22.5a2.5 2.5 0 00-.77-1.73A2.5 2.5 0 0018.5 20a3.1 3.1 0 00-1.65.58 5.28 5.28 0 00-.69.55v.01h-.01l.35.36zm.39.32l-.97 1.46-.49.72h3.07c.34 0 .72-.17 1.02-.48.3-.3.48-.68.48-1.02 0-.34-.17-.72-.48-1.02-.3-.3-.68-.48-1.02-.48-.35 0-.75.18-1.1.42a4.27 4.27 0 00-.51.4z"/>' },
  drawingsHidden: { viewBox: '0 0 28 28', body: '<path fill="currentColor" fill-rule="evenodd" d="M19.76 6.07l-.7.7a13.4 13.4 0 011.93 2.47c.19.3.33.55.42.72l.03.04-.03.04a15 15 0 01-2.09 2.9c-1.47 1.6-3.6 3.12-6.32 3.12-.98 0-1.88-.2-2.7-.52l-.77.76c1.03.47 2.18.76 3.47.76 3.12 0 5.5-1.75 7.06-3.44a16 16 0 002.38-3.38v-.02h.01L22 10l.45.22.1-.22-.1-.22L22 10l.45-.22-.01-.02a5.1 5.1 0 00-.15-.28 16 16 0 00-2.53-3.41zM6.24 13.93l.7-.7-.27-.29a15 15 0 01-2.08-2.9L4.56 10l.03-.04a15 15 0 012.09-2.9c1.47-1.6 3.6-3.12 6.32-3.12.98 0 1.88.2 2.7.52l.77-.76A8.32 8.32 0 0013 2.94c-3.12 0-5.5 1.75-7.06 3.44a16 16 0 00-2.38 3.38v.02h-.01L4 10l-.45-.22-.1.22.1.22L4 10l-.45.22.01.02a5.5 5.5 0 00.15.28 16 16 0 002.53 3.41zm6.09-.43a3.6 3.6 0 004.24-4.24l-.93.93a2.6 2.6 0 01-2.36 2.36l-.95.95zm-1.97-3.69l-.93.93a3.6 3.6 0 014.24-4.24l-.95.95a2.6 2.6 0 00-2.36 2.36zm11.29 7.84l-.8.79a1.5 1.5 0 000 2.12l.59.59a1.5 1.5 0 002.12 0l1.8-1.8-.71-.7-1.8 1.79a.5.5 0 01-.7 0l-.59-.59a.5.5 0 010-.7l.8-.8-.71-.7zm-5.5 3.5l.35.35-.35-.35.01-.02.02-.02.02-.02a4.68 4.68 0 01.65-.5c.4-.27 1-.59 1.65-.59.66 0 1.28.33 1.73.77.44.45.77 1.07.77 1.73a2.5 2.5 0 01-.77 1.73 2.5 2.5 0 01-1.73.77h-4a.5.5 0 01-.42-.78l1-1.5 1-1.5a.5.5 0 01.07-.07zm.74.67a3.46 3.46 0 01.51-.4c.35-.24.75-.42 1.1-.42.34 0 .72.17 1.02.48.3.3.48.68.48 1.02 0 .34-.17.72-.48 1.02-.3.3-.68.48-1.02.48h-3.07l.49-.72.97-1.46zM21.2 2.5L5.5 18.2l-.7-.7L20.5 1.8l.7.7z"/>' },
  indicatorsShown: { viewBox: '0 0 28 28', body: '<path fill="currentColor" fill-rule="evenodd" d="M5 10.76a13.27 13.27 0 01-.41-.72L4.56 10l.03-.04a15 15 0 012.08-2.9c1.48-1.6 3.6-3.12 6.33-3.12s4.85 1.53 6.33 3.12a15.01 15.01 0 012.08 2.9l.03.04-.03.04a15 15 0 01-2.08 2.9c-1.48 1.6-3.6 3.12-6.33 3.12s-4.85-1.53-6.33-3.12a15 15 0 01-1.66-2.18zm17.45-.98L22 10l.45.22-.01.02a14.3 14.3 0 01-.6 1.05c-.4.64-1 1.48-1.78 2.33-1.56 1.7-3.94 3.44-7.06 3.44s-5.5-1.75-7.06-3.44a16 16 0 01-2.23-3.1 9.39 9.39 0 01-.15-.28v-.02h-.01L4 10l-.45-.22.01-.02a5.59 5.59 0 01.15-.28 16 16 0 012.23-3.1C7.5 4.69 9.87 2.94 13 2.94c3.12 0 5.5 1.75 7.06 3.44a16 16 0 012.23 3.1 9.5 9.5 0 01.15.28v.01l.01.01zM22 10l.45-.22.1.22-.1.22L22 10zM3.55 9.78L4 10l-.45.22-.1-.22.1-.22zm6.8.22A2.6 2.6 0 0113 7.44 2.6 2.6 0 0115.65 10 2.6 2.6 0 0113 12.56 2.6 2.6 0 0110.35 10zM13 6.44A3.6 3.6 0 009.35 10c0 1.98 1.65 3.56 3.65 3.56s3.65-1.58 3.65-3.56A3.6 3.6 0 0013 6.44zM20 18c0-.42.1-.65.23-.77.12-.13.35-.23.77-.23.42 0 .65.1.77.23.13.12.23.35.23.77h1c0-.58-.14-1.1-.52-1.48-.38-.38-.9-.52-1.48-.52s-1.1.14-1.48.52c-.37.38-.52.9-.52 1.48v2h-1v1h1v2c0 .42-.1.65-.23.77-.12.13-.35.23-.77.23-.42 0-.65-.1-.77-.23-.13-.12-.23-.35-.23-.77h-1c0 .58.14 1.1.52 1.48.38.37.9.52 1.48.52s1.1-.14 1.48-.52c.37-.38.52-.9.52-1.48v-2h1v-1h-1v-2zm1.65 4.35l1.14 1.15-1.14 1.15.7.7 1.15-1.14 1.15 1.14.7-.7-1.14-1.15 1.14-1.15-.7-.7-1.15 1.14-1.15-1.14-.7.7z"/>' },
  indicatorsHidden: { viewBox: '0 0 28 28', body: '<path fill="currentColor" d="M16.47 3.7A8.32 8.32 0 0013 2.94c-3.12 0-5.5 1.75-7.06 3.44a16 16 0 00-2.38 3.38v.02h-.01L4 10l-.45-.22-.1.22.1.22L4 10l-.45.22.01.02a5.5 5.5 0 00.15.28 16 16 0 002.53 3.41l.7-.7-.27-.29a15 15 0 01-2.08-2.9L4.56 10l.03-.04a15 15 0 012.09-2.9c1.47-1.6 3.6-3.12 6.32-3.12.98 0 1.88.2 2.7.52l.77-.76zm-7.04 7.04l.93-.93a2.6 2.6 0 012.36-2.36l.95-.95a3.6 3.6 0 00-4.24 4.24zm.1 5.56c1.03.47 2.18.76 3.47.76 3.12 0 5.5-1.75 7.06-3.44a16 16 0 002.38-3.38v-.02h.01L22 10l.45.22.1-.22-.1-.22L22 10l.45-.22-.01-.02-.02-.03-.01-.03a9.5 9.5 0 00-.57-1 16 16 0 00-2.08-2.63l-.7.7.27.29a15.01 15.01 0 012.08 2.9l.03.04-.03.04a15 15 0 01-2.09 2.9c-1.47 1.6-3.6 3.12-6.32 3.12-.98 0-1.88-.2-2.7-.52l-.77.76zm2.8-2.8a3.6 3.6 0 004.24-4.24l-.93.93a2.6 2.6 0 01-2.36 2.36l-.95.95zm7.9 3.73c-.12.12-.23.35-.23.77v2h1v1h-1v2c0 .58-.14 1.1-.52 1.48-.38.38-.9.52-1.48.52s-1.1-.14-1.48-.52c-.38-.38-.52-.9-.52-1.48h1c0 .42.1.65.23.77.12.12.35.23.77.23.42 0 .65-.1.77-.23.12-.12.23-.35.23-.77v-2h-1v-1h1v-2c0-.58.14-1.1.52-1.48.38-.38.9-.52 1.48-.52s1.1.14 1.48.52c.38.38.52.9.52 1.48h-1c0-.42-.1-.65-.23-.77-.12-.12-.35-.23-.77-.23-.42 0-.65.1-.77.23zm2.56 6.27l-1.14-1.15.7-.7 1.15 1.14 1.15-1.14.7.7-1.14 1.15 1.14 1.15-.7.7-1.15-1.14-1.15 1.14-.7-.7 1.14-1.15zM21.2 2.5L5.5 18.2l-.7-.7L20.5 1.8l.7.7z"/>' },
  allShown: { viewBox: '0 0 28 28', body: '<path fill="currentColor" fill-rule="evenodd" d="M4.56 14a10.05 10.05 0 00.52.91c.41.69 1.04 1.6 1.85 2.5C8.58 19.25 10.95 21 14 21c3.05 0 5.42-1.76 7.07-3.58A17.18 17.18 0 0023.44 14a9.47 9.47 0 00-.52-.91c-.41-.69-1.04-1.6-1.85-2.5C19.42 8.75 17.05 7 14 7c-3.05 0-5.42 1.76-7.07 3.58A17.18 17.18 0 004.56 14zM24 14l.45-.21-.01-.03a7.03 7.03 0 00-.16-.32c-.11-.2-.28-.51-.5-.87-.44-.72-1.1-1.69-1.97-2.65C20.08 7.99 17.45 6 14 6c-3.45 0-6.08 2-7.8 3.92a18.18 18.18 0 00-2.64 3.84v.02h-.01L4 14l-.45-.21-.1.21.1.21L4 14l-.45.21.01.03a5.85 5.85 0 00.16.32c.11.2.28.51.5.87.44.72 1.1 1.69 1.97 2.65C7.92 20.01 10.55 22 14 22c3.45 0 6.08-2 7.8-3.92a18.18 18.18 0 002.64-3.84v-.02h.01L24 14zm0 0l.45.21.1-.21-.1-.21L24 14zm-10-3a3 3 0 100 6 3 3 0 000-6zm-4 3a4 4 0 118 0 4 4 0 01-8 0z"/>' },
  allHidden: { viewBox: '0 0 28 28', body: '<path fill="currentColor" d="M18.15 7.02A9.05 9.05 0 0014 6c-3.45 0-6.08 2-7.8 3.92a18.18 18.18 0 00-2.64 3.84v.02h-.01L4 14l-.45-.21-.1.21.1.21L4 14l-.45.21.01.03a5.85 5.85 0 00.16.32c.11.2.28.51.5.87a18.18 18.18 0 002.4 3.12l.71-.71A17.18 17.18 0 014.56 14a10.05 10.05 0 01.52-.91c.41-.69 1.04-1.6 1.85-2.5C8.58 8.75 10.95 7 14 7a8 8 0 013.4.77l.75-.75zm-3.11 3.12a4 4 0 00-4.9 4.9l.86-.87V14a3 3 0 013.17-3l.87-.86zm1.96 3.7l.86-.88a4 4 0 01-4.9 4.9l.87-.86A3 3 0 0017 13.83zm-6.4 6.4A8 8 0 0014 21c3.05 0 5.42-1.76 7.07-3.58A17.18 17.18 0 0023.44 14a9.47 9.47 0 00-.52-.91 17.18 17.18 0 00-2.25-2.93l.7-.7a18.18 18.18 0 013.06 4.3l.02.02L24 14l.45.21-.01.03a7.03 7.03 0 01-.16.32c-.11.2-.28.51-.5.87-.44.72-1.1 1.69-1.97 2.65C20.08 20.01 17.45 22 14 22c-1.55 0-2.94-.4-4.15-1.02l.75-.75zM24 14l.45-.21.1.21-.1.21L24 14zM22.2 6.5L6.5 22.2l-.7-.7L21.5 5.8l.7.7z"/>' },
  sync: { viewBox: '0 0 28 28', body: '<path fill="currentColor" fill-rule="nonzero" d="M15.039 5.969l-.019-.019-2.828 2.828.707.707 2.474-2.474c1.367-1.367 3.582-1.367 4.949 0s1.367 3.582 0 4.949l-2.474 2.474.707.707 2.828-2.828-.019-.019c1.415-1.767 1.304-4.352-.334-5.99-1.638-1.638-4.224-1.749-5.99-.334zM5.97 15.038l-.019-.019 2.828-2.828.707.707-2.475 2.475c-1.367 1.367-1.367 3.582 0 4.949s3.582 1.367 4.949 0l2.474-2.474.707.707-2.828 2.828-.019-.019c-1.767 1.415-4.352 1.304-5.99-.334-1.638-1.638-1.749-4.224-.334-5.99z"/><path fill="currentColor" d="M10.485 16.141l5.656-5.656.707.707-5.656 5.656z"/>' },
  ruler: { viewBox: '0 0 28 28', body: '<path fill="currentColor" fill-rule="evenodd" transform="rotate(-45 14 14)" d="M2 9.75a1.5 1.5 0 0 0-1.5 1.5v5.5a1.5 1.5 0 0 0 1.5 1.5h24a1.5 1.5 0 0 0 1.5-1.5v-5.5a1.5 1.5 0 0 0-1.5-1.5zm0 1h3v2.5h1v-2.5h3.25v3.9h1v-3.9h3.25v2.5h1v-2.5h3.25v3.9h1v-3.9H22v2.5h1v-2.5h3a.5.5 0 0 1 .5.5v5.5a.5.5 0 0 1-.5.5H2a.5.5 0 0 1-.5-.5v-5.5a.5.5 0 0 1 .5-.5z"/>' },
  zoomIn: { viewBox: '0 0 28 28', body: '<path fill="currentColor" d="M17.646 18.354l4 4 .708-.708-4-4z"/><path fill="currentColor" d="M12.5 21a8.5 8.5 0 1 1 0-17 8.5 8.5 0 0 1 0 17zm0-1a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15z"/><path fill="currentColor" d="M9 13h7v-1H9z"/><path fill="currentColor" d="M13 16V9h-1v7z"/>' },
  groupGlyphs: { viewBox: '0 0 28 28', body: '<path fill="currentColor" d="M4.05 14a9.95 9.95 0 1 1 19.9 0 9.95 9.95 0 0 1-19.9 0ZM14 3a11 11 0 1 0 0 22 11 11 0 0 0 0-22Zm-3 13.03a.5.5 0 0 1 .64.3 2.5 2.5 0 0 0 4.72 0 .5.5 0 0 1 .94.34 3.5 3.5 0 0 1-6.6 0 .5.5 0 0 1 .3-.64Zm.5-4.53a1 1 0 1 0 0 2 1 1 0 0 0 0-2Zm5 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z"/>' },
  // The drawing toolbar's arrow: a filled chevron on a 10 by 16 grid, drawn 4 by 7 in the strip.
  chevronRight16: { viewBox: '0 0 10 16', aspect: 4 / 7, size: 7, body: '<path fill="currentColor" d="M.6 1.4l1.4-1.4 8 8-8 8-1.4-1.4 6.389-6.532-6.389-6.668z"/>' },
  // Six dots on an 8 by 12 grid, each PAINTED in currentColor: the svg the glyph is wrapped in
  // carries `fill="none"`, so a rect with no fill of its own is a grip nobody can see.
  grip: {
    viewBox: '0 0 8 12',
    aspect: 8 / 12,
    body: '<rect fill="currentColor" width="2" height="2" rx="1"/><rect fill="currentColor" width="2" height="2" rx="1" y="5"/><rect fill="currentColor" width="2" height="2" rx="1" y="10"/><rect fill="currentColor" width="2" height="2" rx="1" x="6"/><rect fill="currentColor" width="2" height="2" rx="1" x="6" y="5"/><rect fill="currentColor" width="2" height="2" rx="1" x="6" y="10"/>',
  },
  // Four tiles with the fourth replaced by a plus. Every shape names its own ink: the wrapper says
  // `fill="none"` and nothing else, so a shape that inherited its stroke from the old svg element
  // drew nothing at all here.
  template: { viewBox: '0 0 28 28', body: '<path stroke="currentColor" stroke-linecap="round" d="M15.5 18.5h6m-3 3v-6"/><rect stroke="currentColor" width="6" height="6" rx="1.5" x="6.5" y="6.5"/><rect stroke="currentColor" width="6" height="6" rx="1.5" x="15.5" y="6.5"/><rect stroke="currentColor" width="6" height="6" rx="1.5" x="6.5" y="15.5"/>' },
  layers: { viewBox: '0 0 28 28', body: '<path fill="currentColor" d="M25 17.225 14 24 3 17.357l.508-.867L14 22.873l10.498-6.51zM13.999 5c.172 0 .345.04.499.128l9.984 5.753a1 1 0 0 1-.015 1.741l-9.983 5.522a1 1 0 0 1-.968-.001l-9.984-5.545a1 1 0 0 1-.012-1.742l9.98-5.728A1 1 0 0 1 13.999 5m-9.981 6.724L14 17.269l9.982-5.522L14 5.994z"/>' },
  eyeCrossed: { viewBox: '0 0 28 28', body: '<path fill="currentColor" fill-rule="evenodd" d="M19.76 6.07l-.7.7a13.4 13.4 0 011.93 2.47c.19.3.33.55.42.72l.03.04-.03.04a15 15 0 01-2.09 2.9c-1.47 1.6-3.6 3.12-6.32 3.12-.98 0-1.88-.2-2.7-.52l-.77.76c1.03.47 2.18.76 3.47.76 3.12 0 5.5-1.75 7.06-3.44a16 16 0 002.38-3.38v-.02h.01L22 10l.45.22.1-.22-.1-.22L22 10l.45-.22-.01-.02a5.1 5.1 0 00-.15-.28 16 16 0 00-2.53-3.41zM6.24 13.93l.7-.7-.27-.29a15 15 0 01-2.08-2.9L4.56 10l.03-.04a15 15 0 012.09-2.9c1.47-1.6 3.6-3.12 6.32-3.12.98 0 1.88.2 2.7.52l.77-.76A8.32 8.32 0 0013 2.94c-3.12 0-5.5 1.75-7.06 3.44a16 16 0 00-2.38 3.38v.02h-.01L4 10l-.45-.22-.1.22.1.22L4 10l-.45.22.01.02a5.5 5.5 0 00.15.28 16 16 0 002.53 3.41zm6.09-.43a3.6 3.6 0 004.24-4.24l-.93.93a2.6 2.6 0 01-2.36 2.36l-.95.95zm-1.97-3.69l-.93.93a3.6 3.6 0 014.24-4.24l-.95.95a2.6 2.6 0 00-2.36 2.36zM21.2 2.5L5.5 18.2l-.7-.7L20.5 1.8l.7.7z" transform="translate(1 4)"/>' },
  pencil16: { size: 16, viewBox: '0 0 16 16', body: '<path fill="currentColor" d="M10.62.72a2.47 2.47 0 0 1 3.5 0l1.16 1.16c.96.97.96 2.54 0 3.5l-.58.58-8.9 8.9-1 1-.14.14H0v-4.65l.14-.15 1-1 8.9-8.9.58-.58Zm2.8.7a1.48 1.48 0 0 0-2.1 0l-.23.23 3.26 3.26.23-.23c.58-.58.58-1.52 0-2.1l-1.16-1.16Zm.23 4.2-3.26-3.27-8.2 8.2 3.25 3.27 8.2-8.2Zm-8.9 8.9-3.27-3.26-.5.5V15h3.27l.5-.5Z"/>' },
  bucket: { size: 16, viewBox: '0 0 20 20', body: '<path stroke="currentColor" d="M13.5 6.5l-3-3-7 7 7.59 7.59a2 2 0 0 0 2.82 0l4.18-4.18a2 2 0 0 0 0-2.82L13.5 6.5zm0 0v-4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v6"/><path fill="currentColor" d="M0 16.5C0 15 2.5 12 2.5 12S5 15 5 16.5 4 19 2.5 19 0 18 0 16.5z"/><circle fill="currentColor" cx="9.5" cy="9.5" r="1.5"/>' },
  textTee: { size: 15, aspect: 13 / 15, viewBox: '0 0 13 15', body: '<path stroke="currentColor" d="M4 14.5h2.5m2.5 0H6.5m0 0V.5m0 0h-5a1 1 0 0 0-1 1V4m6-3.5h5a1 1 0 0 1 1 1V4"/>' },
  // A tool's star in a flyout: an outline at rest and a filled star once saved, on an 18 grid.
  star: { viewBox: '0 0 18 18', body: '<path stroke="currentColor" d="M9 2.13l1.903 3.855.116.236.26.038 4.255.618-3.079 3.001-.188.184.044.259.727 4.237-3.805-2L9 12.434l-.233.122-3.805 2.001.727-4.237.044-.26-.188-.183-3.079-3.001 4.255-.618.26-.038.116-.236L9 2.13z"/>' },
  // The favorites bar's toggle on the drawing toolbar: one outlined star in either state, the state
  // carried by the button's fill.
  favoritesBar: { viewBox: '0 0 28 28', body: '<path fill="currentColor" fill-rule="evenodd" d="m17.13 9.74 7.37.9-5.44 5.06L20.4 23 14 19.38 7.6 23l1.34-7.3-5.44-5.06 7.37-.9L14 3l3.13 6.74Zm5.11 1.63-4.26 3.97 1.04 5.74L14 18.24l-5.02 2.84 1.04-5.74-4.26-3.97 5.79-.7L14 5.37l2.45 5.3 5.8.7Z"/>' },
  starFilled: { viewBox: '0 0 18 18', body: '<path fill="currentColor" d="M9 1l2.35 4.76 5.26.77-3.8 3.7.9 5.24L9 13l-4.7 2.47.9-5.23-3.8-3.71 5.25-.77L9 1z"/>' },
  trash28: { viewBox: '0 0 28 28', body: '<path fill="currentColor" d="M18 7h5v1h-2.01l-1.33 14.64a1.5 1.5 0 0 1-1.5 1.36H9.84a1.5 1.5 0 0 1-1.49-1.36L7.01 8H5V7h5V6c0-1.1.9-2 2-2h4a2 2 0 0 1 2 2v1Zm-6-2a1 1 0 0 0-1 1v1h6V6a1 1 0 0 0-1-1h-4ZM8.02 8l1.32 14.54a.5.5 0 0 0 .5.46h8.33a.5.5 0 0 0 .5-.46L19.99 8H8.02Z"/>' },
  gear: { viewBox: '0 0 28 28', body: '<path fill="currentColor" fill-rule="evenodd" d="M18 14a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm-1 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/><path fill="currentColor" fill-rule="evenodd" d="M8.5 5h11l5 9-5 9h-11l-5-9 5-9Zm-3.86 9L9.1 6h9.82l4.45 8-4.45 8H9.1l-4.45-8Z"/>' },
  // The More control: three ringed dots in a row.
  kebab: { viewBox: '0 0 28 28', body: '<path fill="currentColor" fill-rule="evenodd" d="M7.5 13a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM5 14.5a2.5 2.5 0 1 1 5 0 2.5 2.5 0 0 1-5 0zm9.5-1.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM12 14.5a2.5 2.5 0 1 1 5 0 2.5 2.5 0 0 1-5 0zm9.5-1.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM19 14.5a2.5 2.5 0 1 1 5 0 2.5 2.5 0 0 1-5 0z"/>' },
  // The line styles as the settings bar draws them: a stroked line for solid, and FILLED rect runs
  // for dashed and dotted, which stay crisp at one pixel where a dasharray'd stroke blurs.
  lineSolid: { viewBox: '0 0 28 28', body: '<path stroke="currentColor" d="M4 13.5h20"/>' },
  lineDashed: { viewBox: '0 0 28 28', body: '<path fill="currentColor" d="M4 13h5v1H4v-1zM12 13h5v1h-5v-1zM20 13h5v1h-5v-1z"/>' },
  lineDotted: { viewBox: '0 0 28 28', body: '<path fill="currentColor" d="M3 13h2v2H3v-2Zm5 0h2v2H8v-2Zm7 0h-2v2h2v-2Zm3 0h2v2h-2v-2Zm7 0h-2v2h2v-2Z"/>' },
  // The line thicknesses as the settings bar draws them: an eighteen-pixel bar as tall as the line,
  // with fully rounded ends.
  lineThickness1: { viewBox: '0 0 18 1', size: 1, aspect: 18, body: '<rect width="18" height="1" rx="0.5" fill="currentColor"/>' },
  lineThickness2: { viewBox: '0 0 18 2', size: 2, aspect: 9, body: '<rect width="18" height="2" rx="1" fill="currentColor"/>' },
  lineThickness3: { viewBox: '0 0 18 3', size: 3, aspect: 6, body: '<rect width="18" height="3" rx="1.5" fill="currentColor"/>' },
  lineThickness4: { viewBox: '0 0 18 4', size: 4, aspect: 4.5, body: '<rect width="18" height="4" rx="2" fill="currentColor"/>' },
  // A line's two end styles, drawn for its left end: the right end wears the same glyph mirrored.
  lineEndNormal: { viewBox: '0 0 28 28', body: '<path stroke="currentColor" d="M8.5 13.5a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm0 0H24"/>' },
  lineEndArrow: { viewBox: '0 0 28 28', body: '<path stroke="currentColor" d="M4.5 13.5H24m-19.5 0L8 17m-3.5-3.5L8 10"/>' },
  // A menu row that opens a submenu points at where it will appear.
  submenuArrow: { viewBox: '0 0 24 24', body: '<path d="M9 18l6-6-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' },
  // The Text page's weight and slant toggles: a capital B drawn heavy, and a slanted capital I with
  // its serifs, each on the 28 grid.
  textBold: { viewBox: '0 0 28 28', body: '<path fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" d="M9.5 6.5h5.25a3.75 3.75 0 0 1 0 7.5H9.5zM9.5 14h6a3.75 3.75 0 0 1 0 7.5h-6z"/>' },
  textItalic: { viewBox: '0 0 28 28', body: '<path fill="none" stroke="currentColor" d="M12 6.5h7M9 21.5h7M15.5 6.5l-3 15"/>' },
  close18: { viewBox: '0 0 18 18', body: '<path d="M4.5 4.5l9 9M13.5 4.5l-9 9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>' },
  chevronDown18: { viewBox: '0 0 18 18', body: '<path fill="currentColor" d="M3.92 7.83 9 12.29l5.08-4.46-1-1.13L9 10.29l-4.09-3.6-.99 1.14Z"/>' },
  // The indicator picker's marks, on the grids its rows were drawn for.
  pickerStar: { viewBox: '0 0 18 18', body: '<path fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" d="M9 2.13L11.057 6.168L15.534 6.877L12.329 10.082L13.038 14.558L9 12.5L4.962 14.558L5.671 10.082L2.466 6.877L6.943 6.168z"/>' },
  pickerStarFilled: { viewBox: '0 0 18 18', body: '<path fill="currentColor" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" d="M9 2.13L11.057 6.168L15.534 6.877L12.329 10.082L13.038 14.558L9 12.5L4.962 14.558L5.671 10.082L2.466 6.877L6.943 6.168z"/>' },
  plus24: { viewBox: '0 0 24 24', body: '<path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' },
  search24: { viewBox: '0 0 24 24', body: '<circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.8"/><path d="M20 20l-3.5-3.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' },
  // The note beside a switch that needs a sentence.
  info: { viewBox: '0 0 18 18', body: '<path fill="currentColor" d="M9 17A8 8 0 1 0 9 1a8 8 0 0 0 0 16Zm1-12a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM8.5 9.5H7V8h3v6H8.5V9.5Z"/>' },
} as const satisfies Record<string, Glyph>

export type IconName = keyof typeof ICONS

/** The compare list's empty mark, on its own 120 grid: a magnifier inside a dashed ring with a plus
 *  badge on its shoulder. An illustration rather than a control glyph, which is why it is the one mark
 *  in this file that names its own inks: the drawing, the badge and the plus on it each wear an
 *  illustration role, so a viewer's eye lands on the thing the words are asking them to do. */
export const COMPARE_EMPTY_MARK: Glyph = {
  viewBox: '0 0 121 120',
  body:
  '<path fill="var(--qc-illustration-ink)" d="M53.88 18.36a43.4 43.4 0 0 1 11.24 0 1 1 0 0 0 .26-1.98 45.42 45.42 0 0 0-11.76 0 1 1 0 1 0 .26 1.98zM43.04 21.26a1 1 0 0 0-.77-1.85A44.95 44.95 0 0 0 32.1 25.3a1 1 0 0 0 1.22 1.58 42.95 42.95 0 0 1 9.72-5.62zM75.42 19.96a1 1 0 0 1 1.3-.55A44.95 44.95 0 0 1 86.9 25.3a1 1 0 0 1-1.22 1.58 42.95 42.95 0 0 0-9.72-5.62 1 1 0 0 1-.54-1.3zM25.38 34.82a1 1 0 1 0-1.58-1.22 44.95 44.95 0 0 0-5.89 10.17 1 1 0 0 0 1.85.77 42.95 42.95 0 0 1 5.62-9.72zM16.86 55.38a1 1 0 0 0-1.98-.26 45.42 45.42 0 0 0 0 11.76 1 1 0 1 0 1.98-.26 43.4 43.4 0 0 1 0-11.24zM103 54.26a1 1 0 0 1 1.12.86 45.4 45.4 0 0 1 0 11.76 1 1 0 0 1-1.98-.26 43.37 43.37 0 0 0 0-11.24 1 1 0 0 1 .86-1.12zM19.76 77.46a1 1 0 0 0-1.85.77A44.95 44.95 0 0 0 23.8 88.4a1 1 0 0 0 1.58-1.22 42.95 42.95 0 0 1-5.62-9.72zM100.54 76.92a1 1 0 0 1 .54 1.3A44.95 44.95 0 0 1 95.2 88.4a1 1 0 0 1-1.58-1.22 42.95 42.95 0 0 0 5.62-9.72 1 1 0 0 1 1.3-.54zM33.32 95.12a1 1 0 1 0-1.22 1.58 44.94 44.94 0 0 0 10.17 5.88 1 1 0 0 0 .77-1.84 42.97 42.97 0 0 1-9.72-5.62zM87.08 95.3a1 1 0 0 1-.18 1.4 44.94 44.94 0 0 1-10.17 5.88 1 1 0 0 1-.77-1.84 42.98 42.98 0 0 0 9.72-5.62 1 1 0 0 1 1.4.18zM53.88 103.64a1 1 0 0 0-.26 1.98 45.4 45.4 0 0 0 11.76 0 1 1 0 0 0-.26-1.98 43.37 43.37 0 0 1-11.24 0zM62.81 53.17a1 1 0 0 0-.78 1.84 6.62 6.62 0 0 1 3.49 3.5 1 1 0 1 0 1.84-.78 8.62 8.62 0 0 0-4.55-4.56z"/>' +
    '<path fill="var(--qc-illustration-ink)" d="M45.5 61a14 14 0 1 1 24.28 9.5l7.92 7.92a1 1 0 0 1-1.42 1.42l-7.96-7.97A14 14 0 0 1 45.5 61zm14-12a12 12 0 1 0 0 24 12 12 0 0 0 0-24z"/>' +
    '<circle fill="var(--qc-illustration-accent)" cx="97.5" cy="39" r="13"/>' +
    '<path fill="var(--qc-illustration-accentInk)" d="M98.5 34a1 1 0 1 0-2 0v4h-4a1 1 0 1 0 0 2h4v4a1 1 0 1 0 2 0v-4h4a1 1 0 0 0 0-2h-4v-4z"/>',
}

/** The symbol search's empty result, on its own 120 grid: a saucer beaming up a calf in the ink of
 *  the words beneath it. Each mode has its own drawing, the light one heavier so it holds on white,
 *  and the stylesheet shows the one for the mode in effect. */
export const SEARCH_EMPTY_MARK: Glyph = {
  viewBox: '0 0 120 120',
  body:
  '<path class="qc-only-dark" fill="currentColor" d="M60.9 6.68c6.3.28 11.64 3.67 14.17 8.45 10.83 2.75 18.26 8.39 18.26 14.89v.43c-.26 4.88-4.71 9.23-11.63 12.2l33.3 70.68h-3.67l-32.78-69.5A60 60 0 0 1 60 46.67a58 58 0 0 1-19.93-3.3l-31.4 69.96H5l32-71.26c-6.17-2.94-10.07-7.05-10.3-11.62l-.03-.45c0-6.5 7.43-12.13 18.28-14.88 2.67-5 8.43-8.47 15.1-8.47Zm7.6 49.99c.46 0 1 2.06.92 4.16 1.8-.23 3.63.28 5.04 1.42l.9.7.87.07a5.9 5.9 0 0 1 5.44 5.88v.42a5.8 5.8 0 0 1-3.57 5.01l-3.4 1.44v.06a30 30 0 0 1-3.16 10.94l3.06 9-8.93 4.23-5.46-6.46-4.13 2.1q-.34 1.46-.88 2.84l1.47 5.3-9.6 4.55L34.95 86.3a3.34 3.34 0 0 0-1.05 4.02l3.7 8.33-3.05 1.35-3.7-8.33a6.67 6.67 0 0 1 2.98-8.6 3.1 3.1 0 0 1 1.74-2.44l23.66-11.3-2.56-5.04 6-.75a12.7 12.7 0 0 0 5.48-6.34q.15-.55.35-.53m3.88 8.18a3.3 3.3 0 0 0-3.81-.25l-2.95 1.78-.3.17-.34.05-3.2.4 1.17 2.33.78 1.54-1.53.73-24.97 11.94 11.23 20.48 4.25-2.04-1.04-3.66.37-.89c.85-2.15 1.3-4.45 1.3-6.76v-4h3.33v4l-.02.95 4.42-2.25 5.5 6.51 3.91-1.86-2.56-7.54.41-.8a27 27 0 0 0 3.05-10.16l.1-1.06.09-1 .91-.38 4.32-1.81a2.56 2.56 0 0 0-.82-4.92l-1.4-.12-.5-.03-.41-.33Zm-28.8-45.89a40 40 0 0 0-5.66 2.24C32.25 24.04 30 27.37 30 30.02s2.25 5.96 7.92 8.8C43.4 41.55 51.2 43.33 60 43.33s16.6-1.78 22.08-4.51C87.75 35.98 90 32.67 90 30s-2.25-5.96-7.92-8.82a37 37 0 0 0-5.66-2.22q.25 1.23.25 2.5c0 3.54-4.4 8.54-16.62 8.54-5-.07-16.72-1.37-16.72-8.5q0-1.3.25-2.54M60 35a1.67 1.67 0 1 1 0 3.33A1.67 1.67 0 0 1 60 35m-21.67-6.67a1.67 1.67 0 1 1 0 3.34 1.67 1.67 0 0 1 0-3.34m43.34 0a1.67 1.67 0 1 1 0 3.33 1.67 1.67 0 0 1 0-3.33M60.05 10c-7.78 0-13.38 5.5-13.38 11.5 0 .3.33 1.54 2.66 2.87 2.2 1.26 5.77 2.3 10.72 2.3 5.68 0 9.16-1.17 11.08-2.42 1.95-1.25 2.2-2.42 2.2-2.75 0-6-5.53-11.5-13.28-11.5"/>' +
    '<path class="qc-only-light" fill="currentColor" d="M60.05 8c7.12 0 13.17 3.59 15.7 8.68C86.02 19.32 93 24.48 93 30.4c0 4.73-4.44 8.96-11.46 11.81L116 112h-4.44L77.75 43.56A62 62 0 0 1 60 46a61 61 0 0 1-19.16-2.9L9.4 112H5l32.11-70.36C30.88 38.81 27 34.83 27 30.41c0-5.93 6.98-11.1 17.27-13.74C46.82 11.58 52.92 8 60.05 8m7.83 49c.44 0 .97 2.05.88 4.12q.51-.11 1.02-.12c.97 0 1.94.32 2.77.89l1.12.76 3.34.96a5.52 5.52 0 0 1 .76 10.32l-3.14 1.44-.18 2.01a19 19 0 0 1-2.17 7.24l-.7 1.29 2.48 7.53.56 1.68-7.32 3.44-.98-1.24-4.35-5.47-8 3.76a14 14 0 0 1-.72 1.5l-.18.33 1.93 6.98-7.8 3.58-11.72-21.88a5.1 5.1 0 0 0-.94 5.72l3.06 6.5-3.62 1.66-3.06-6.46A9.1 9.1 0 0 1 34.1 82.1a3.4 3.4 0 0 1 1.9-2.54l23.2-10.89-2.2-4.88c2.1-.3 4.21-.6 6.34-.76a13 13 0 0 0 4.2-5.5q.15-.53.34-.52m2.42 8.2a1 1 0 0 0-1.06-.05l-2.63 1.5-.46.27h-.54c-.77 0-1.78.06-2.74.15l1.65 3.51L38.3 82.9l10.65 19.86 1.2-.57L49 97.65l-.19-.77.38-.69.56-1.02A10 10 0 0 0 51 90.34V86h4v4.71L63.13 87l.99 1.12 4.35 5.47 1.24-.58-2.19-6.67-.27-.81.4-.76 1.1-2.04a15 15 0 0 0 1.71-5.71l.3-3.17.1-1.15 1.06-.49 4.19-1.91a1.52 1.52 0 0 0-.21-2.84l-3.65-1.06-.3-.09-.27-.18zM43.03 21.17q-2.55.8-4.65 1.8C32.74 25.64 31 28.54 31 30.4c0 1.86 1.74 4.75 7.37 7.41C43.7 40.34 51.34 42 60 42s16.3-1.66 21.63-4.18c5.63-2.66 7.37-5.55 7.37-7.41s-1.74-4.77-7.38-7.43a36 36 0 0 0-4.65-1.8q.03.4.03.8l-.01.3C76.7 25.57 72.12 30 60.05 30 49.25 30 43.2 25.9 43 22.15v-.18q0-.4.03-.79M60 34a2 2 0 1 1 0 4 2 2 0 0 1 0-4m-22-6a2 2 0 1 1 0 4 2 2 0 0 1 0-4m44 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4M60.05 12c-7.96 0-13 5.13-13.05 9.92 0-.05.16.83 2.29 1.95C51.46 25.04 55.04 26 60.05 26c5.78 0 9.24-1.1 11.1-2.21 1.67-1 1.83-1.8 1.85-1.85l-.01-.42c-.3-4.69-5.24-9.52-12.94-9.52"/>',
}

/** The spread operators' glyphs on a 13 grid, by operator id. The operators themselves, their order
 *  and their names are the search module's. */
export const OPERATOR_GLYPHS = {
  division: { viewBox: '0 0 13 13', body: '<path fill="none" stroke="currentColor" stroke-linecap="square" d="M2.5 6.5h9"/><circle fill="currentColor" cx="7" cy="3" r="1"/><circle fill="currentColor" cx="7" cy="10" r="1"/>' },
  subtraction: { viewBox: '0 0 13 13', body: '<path fill="none" stroke="currentColor" stroke-linecap="square" d="M2.5 6.5h8"/>' },
  addition: { viewBox: '0 0 13 13', body: '<path fill="none" stroke="currentColor" stroke-linecap="square" d="M2.5 6.5h8m-4-4v8"/>' },
  multiplication: { viewBox: '0 0 13 13', body: '<path fill="none" stroke="currentColor" stroke-linecap="square" d="M3 10l7-7M3 3l7 7"/>' },
  exponentiation: { viewBox: '0 0 13 13', body: '<path fill="none" stroke="currentColor" stroke-linecap="square" d="M3 7l3.5-3.5L10 7"/>' },
  reciprocal: { viewBox: '0 0 13 13', body: '<g fill="none" fill-rule="evenodd" stroke="currentColor"><path stroke-linecap="square" stroke-linejoin="round" d="M3.5 10V2.5L1 5"/><path stroke-linecap="square" d="M1.5 10.5h4"/><path d="M8 12l3-11"/></g>' },
} as const satisfies Record<string, Glyph>

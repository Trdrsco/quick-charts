// The chrome glyphs, as SVG body strings on a 28 grid (a 13 grid for the spread operators), drawn
// with `currentColor` so a recipe's ink is the glyph's ink. Inline so the package ships no asset
// dependency and fetches nothing. A surface passes a body to `glyph()` and gets a hidden, sized
// SVG; the control it sits in carries the accessible name.

const stroke = (d: string, width = 1.5): string => `<path d="${d}" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`
const fill = (d: string): string => `<path d="${d}" fill="currentColor" fill-rule="evenodd"/>`

/** The main-series styles, in CHART_STYLES order. */
export const STYLE_ICONS = {
  candles: fill('M9 5h1v3h2v10h-2v3H9v-3H7V8h2V5Zm-1 4v8h3V9H8Zm10-3h1v2h2v11h-2v2h-1v-2h-2V8h2V6Zm-1 3v9h3V9h-3Z'),
  hollow: fill('M9 5h1v3h2v10h-2v3H9v-3H7V8h2V5Zm-1 4v8h3V9H8Zm10-3h1v2h2v11h-2v2h-1v-2h-2V8h2V6Zm-1 3v9h3V9h-3Zm1 1h1v7h-1v-7Z'),
  bars: stroke('M9 5v18M6 12h3M9 16h3M19 5v18M16 9h3M19 19h3', 1.6),
  line: stroke('M4 20l6-7 4 3 5-8 5 4', 1.7),
  area: fill('M4 20l6-7 4 3 5-8 5 4v11H4v-3Zm1.5-.4V22h17v-9.3l-3.6-2.9-5 8-4-3-4.4 5.2Z'),
  baseline: fill('M4 14h20v1H4v-1Zm0 6l6-7 4 3 5-8 5 4v1.5l-4.6-3.7-5 8-4-3L5.5 21.2H4V20Z'),
  stepline: stroke('M4 20h5v-6h6v-4h5V7h4', 1.7),
} as const

/** The chrome's own controls. */
export const ICONS = {
  comparePlus: stroke('M14 5.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17Zm0 5v7m-3.5-3.5h7', 1.5),
  indicators: stroke('M4 21l5-9 4 5 4-12 3 7 4-3M4 23h20', 1.6),
  replay: stroke('M7 10.5A8 8 0 1 1 6 14M6 8v3.5h3.5M12 11v6l5-3-5-3Z', 1.5),
  settings: stroke(
    'M14 10.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7Zm-2.6-6h5.2l.7 2.6 2.3 1.3 2.6-.7 2.6 4.5-1.9 1.9v2.8l1.9 1.9-2.6 4.5-2.6-.7-2.3 1.3-.7 2.6h-5.2l-.7-2.6-2.3-1.3-2.6.7-2.6-4.5 1.9-1.9v-2.8L4.3 12.2l2.6-4.5 2.6.7 2.3-1.3.7-2.6Z',
    1.4,
  ),
  fullscreen: stroke('M5 11V5h6M17 5h6v6M23 17v6h-6M11 23H5v-6', 1.6),
  exitFullscreen: stroke('M11 5v6H5M17 11V5M23 11h-6M17 17v6M23 17h-6M11 23v-6H5', 1.6),
  camera: stroke('M4 9.5h4l2-3h8l2 3h4V22H4V9.5Zm10 3a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7Z', 1.5),
  download: stroke('M14 4v13m-5-5 5 5 5-5M5 20v3h18v-3', 1.6),
  copy: stroke('M10 10V5h13v13h-5M5 10h13v13H5V10Z', 1.5),
  chevronDown: stroke('M8 11l6 6 6-6', 1.7),
  chevronUp: stroke('M8 17l6-6 6 6', 1.7),
  chevronLeft: stroke('M17 8l-6 6 6 6', 1.7),
  chevronRight: stroke('M11 8l6 6-6 6', 1.7),
  check: stroke('M6 14.5l5 5L22 8.5', 1.8),
  close: stroke('M7 7l14 14M21 7 7 21', 1.6),
  search: stroke('M12.5 5a7.5 7.5 0 1 1 0 15 7.5 7.5 0 0 1 0-15Zm5.5 13 5 5', 1.6),
  clear: stroke('M14 5.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17Zm-3 5.5 6 6m0-6-6 6', 1.5),
  star: stroke('M14 4.5l2.9 6.2 6.6.8-4.9 4.6 1.3 6.6L14 19.4l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8L14 4.5Z', 1.4),
  starFilled: fill('M14 4.5l2.9 6.2 6.6.8-4.9 4.6 1.3 6.6L14 19.4l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8L14 4.5Z'),
  trash: stroke('M6 8h16M11 8V5h6v3M8 8l1 15h10l1-15M12 12v7m4-7v7', 1.4),
  plus: stroke('M14 6v16M6 14h16', 1.7),
  minus: stroke('M6 14h16', 1.7),
  info: stroke('M14 4.5a9.5 9.5 0 1 1 0 19 9.5 9.5 0 0 1 0-19Zm0 8v6.5M14 9.5v.5', 1.5),
  zoomIn: stroke('M12 4a8 8 0 1 1 0 16 8 8 0 0 1 0-16Zm0 4.5v7M8.5 12h7M18 18l6 6', 1.6),
  zoomOut: stroke('M12 4a8 8 0 1 1 0 16 8 8 0 0 1 0-16ZM8.5 12h7M18 18l6 6', 1.6),
  reset: stroke('M6.5 15A8.5 8.5 0 1 0 15 6.5H8.5M12 10 8.5 6.5 12 3', 1.5),
  goLive: fill(
    'M18 22V6h1v16h-1ZM8.834 7.996l6.258 5.632a.5.5 0 0 1 0 .744l-6.258 5.632A.5.5 0 0 1 8 19.632V8.368a.5.5 0 0 1 .834-.372Zm6.927 4.89a1.5 1.5 0 0 1 0 2.229l-6.258 5.632C8.538 21.616 7 20.93 7 19.632V8.368C7 7.07 8.538 6.384 9.503 7.253l6.258 5.632ZM21 6v16h1V6h-1Z',
  ),
  play: fill(
    'm10.997 6.93 7.834 6.628a.58.58 0 0 1 0 .88l-7.834 6.627c-.359.303-.897.04-.897-.44V7.37c0-.48.538-.743.897-.44Zm8.53 5.749a1.741 1.741 0 0 1 0 2.637l-7.834 6.628c-1.076.91-2.692.119-2.692-1.319V7.37c0-1.438 1.616-2.23 2.692-1.319l7.834 6.628Z',
  ),
  pause: fill('M11 6v16h1.5V6H11Zm4.5 0v16H17V6h-1.5Z'),
  stepForward: fill(
    'M20 6v16h1V6h-1Zm-3.908 7.628L9.834 7.996A.5.5 0 0 0 9 8.368v11.264a.5.5 0 0 0 .834.372l6.258-5.632a.5.5 0 0 0 0-.744Zm.67 1.487a1.5 1.5 0 0 0 0-2.23l-6.259-5.632C9.538 6.384 8 7.07 8 8.368v11.264c0 1.299 1.538 1.984 2.503 1.115l6.258-5.632Z',
  ),
  stepBack: `<g transform="translate(28,0) scale(-1,1)">${fill(
    'M20 6v16h1V6h-1Zm-3.908 7.628L9.834 7.996A.5.5 0 0 0 9 8.368v11.264a.5.5 0 0 0 .834.372l6.258-5.632a.5.5 0 0 0 0-.744Zm.67 1.487a1.5 1.5 0 0 0 0-2.23l-6.259-5.632C9.538 6.384 8 7.07 8 8.368v11.264c0 1.299 1.538 1.984 2.503 1.115l6.258-5.632Z',
  )}</g>`,
  calendar: fill(
    'M9 5V3H8v2H6a3 3 0 0 0-3 3v13a3 3 0 0 0 3 3h15a3 3 0 0 0 3-3V8a3 3 0 0 0-3-3h-2V3h-1v2H9Zm9 3V6H9v2H8V6H6a2 2 0 0 0-2 2v2h19V8a2 2 0 0 0-2-2h-2v2h-1ZM4 21V11h19v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Zm9-7.88V12l-.84.75-3.74 3.37-.42.38.41.37 3.75 3.38.84.75v-4h7v-1h-7v-2.88Zm-1 5.63L9.5 16.5l2.5-2.26v4.51Z',
  ),
  selectBar: fill('M10 6H8v16h2V6ZM8 5a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1H8Zm15 9.5h-6V19l-5-5 5-5v4.5h6v1Zm-9.586-.5L16 11.414v5.172L13.414 14Z'),
  randomBar: fill(
    'M19.4 5.33a.1.1 0 0 1-.07.06l-4.26 1.52a.1.1 0 0 0 0 .18l4.26 1.52a.1.1 0 0 1 .06.06l1.52 4.26a.1.1 0 0 0 .18 0l1.52-4.26a.1.1 0 0 1 .06-.06l4.26-1.52a.1.1 0 0 0 0-.18l-4.26-1.52a.1.1 0 0 1-.06-.06l-1.52-4.26a.1.1 0 0 0-.18 0l-1.52 4.26ZM21 3.81l-.66 1.86a1.1 1.1 0 0 1-.67.67L17.8 7l1.86.66c.31.11.56.36.67.67L21 10.2l.66-1.86c.11-.31.36-.56.67-.67L24.2 7l-1.86-.66a1.1 1.1 0 0 1-.67-.67L21 3.8ZM8.5 11a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z',
  ),
  folder: stroke('M4 8h7l2 2.5h11V22H4V8Z', 1.5),
  pencil: stroke('M17 6l5 5L9 24H4v-5L17 6Zm-2 2 5 5', 1.5),
  clone: stroke('M9 9V5h14v14h-4M5 9h14v14H5V9Z', 1.5),
  sun: stroke('M14 9a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0-6v3m0 20v3M3 14h3m16 0h3M6.2 6.2l2.1 2.1m11.4 11.4 2.1 2.1M21.8 6.2l-2.1 2.1M8.3 19.7l-2.1 2.1', 1.5),
  moon: stroke('M22 16.5A8.5 8.5 0 0 1 11.5 6a8.5 8.5 0 1 0 10.5 10.5Z', 1.5),
  dot: '<circle cx="14" cy="14" r="4" fill="currentColor"/>',
} as const

/** The spread operators' glyphs on a 13 grid, by operator id. The operators themselves, their order
 *  and their names are the search module's. */
export const OPERATOR_GLYPHS = {
  division: '<path fill="none" stroke="currentColor" stroke-linecap="square" d="M2.5 6.5h9"/><circle fill="currentColor" cx="7" cy="3" r="1"/><circle fill="currentColor" cx="7" cy="10" r="1"/>',
  subtraction: '<path fill="none" stroke="currentColor" stroke-linecap="square" d="M2.5 6.5h8"/>',
  addition: '<path fill="none" stroke="currentColor" stroke-linecap="square" d="M2.5 6.5h8m-4-4v8"/>',
  multiplication: '<path fill="none" stroke="currentColor" stroke-linecap="square" d="M3 10l7-7M3 3l7 7"/>',
  exponentiation: '<path fill="none" stroke="currentColor" stroke-linecap="square" d="M3 7l3.5-3.5L10 7"/>',
  reciprocal:
    '<g fill="none" fill-rule="evenodd" stroke="currentColor"><path stroke-linecap="square" stroke-linejoin="round" d="M3.5 10V2.5L1 5"/><path stroke-linecap="square" d="M1.5 10.5h4"/><path d="M8 12l3-11"/></g>',
} as const

// From a resolved theme to what the two renderers need: the scoped custom properties for the DOM,
// and the concrete values for the canvas.
//
// Both are pure functions of one resolved theme, which is what keeps a mode switch atomic. The
// widget calls them together, writes the attribute and the properties on its own root element, and
// pushes the canvas values into the chart engine in the same pass. Nothing here reads or writes a
// document: this module is a mapping, so it is testable without a DOM and safe on a server.
//
// The custom-property names are private. A host styles Quick Charts through role ids, not by
// targeting `--qc-` variables or package selectors.
import { themeDeclarations, THEME_ROOT_ATTRIBUTE, type ThemeDeclaration } from './css-contract'
import type { SemanticTheme, ThemeMode } from './schema'

export type { ThemeDeclaration }

/** Everything the widget writes on its own root element for one resolved theme. */
export interface ThemeRootStyle {
  /** The attribute that scopes the package stylesheet to this instance. */
  attribute: { name: string; value: ThemeMode }
  /** One entry per role, ordered by role id. */
  declarations: readonly ThemeDeclaration[]
}

/** The scoped attribute and custom properties for one instance root. Two instances that resolve
 *  different themes produce different declarations from the same stylesheet. */
export function themeRootStyle(mode: ThemeMode, theme: SemanticTheme): ThemeRootStyle {
  return { attribute: { name: THEME_ROOT_ATTRIBUTE, value: mode }, declarations: themeDeclarations(theme) }
}

/** The theme values the canvas renderer draws with. The chart appearance ladder sits above these:
 *  a host override of a series color wins over `up` and `down` here, which are the mode's defaults
 *  for anything the appearance tree does not name. */
export interface CanvasTheme {
  background: string
  paneBorder: string
  grid: string
  axisText: string
  axisBackground: string
  axisBorder: string
  crosshair: string
  crosshairLabelBackground: string
  crosshairLabelText: string
  /** The size, in CSS pixels, of text drawn into the canvas. */
  fontSize: number
  fontFamily: string
  /** Ink for text the chart paints over the plot area, such as the legend. */
  textOnCanvas: string
  up: string
  down: string
  neutral: string
  session: { preMarket: string; extended: string; afterHours: string; closed: string }
}

/** The leading number of a CSS length, which is what a canvas API takes. The built-in type roles are
 *  written in pixels; a value in another unit is read as its number, and one with no number at all
 *  falls back rather than painting text at zero. */
function pixels(value: string, fallback: number): number {
  const n = Number.parseFloat(value)
  return Number.isFinite(n) ? n : fallback
}

/** Project a resolved theme onto the canvas renderer's inputs. */
export function canvasTheme(theme: SemanticTheme): CanvasTheme {
  return {
    background: theme['canvas.background'],
    paneBorder: theme['canvas.paneBorder'],
    grid: theme['scale.grid'],
    axisText: theme['scale.text'],
    axisBackground: theme['scale.background'],
    axisBorder: theme['scale.border'],
    crosshair: theme['scale.crosshair'],
    crosshairLabelBackground: theme['scale.crosshairLabelBackground'],
    crosshairLabelText: theme['scale.crosshairLabelText'],
    fontSize: pixels(theme['text.fontSizeAxis'], 13),
    fontFamily: theme['text.fontFamily'],
    textOnCanvas: theme['text.onCanvas'],
    up: theme['series.up'],
    down: theme['series.down'],
    neutral: theme['series.neutral'],
    session: {
      preMarket: theme['scale.sessionPreMarket'],
      extended: theme['scale.sessionExtended'],
      afterHours: theme['scale.sessionAfterHours'],
      closed: theme['scale.sessionClosed'],
    },
  }
}

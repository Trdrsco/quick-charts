// The icon contract a host draws with: one factory that makes one fresh SVG element for a box the
// chart names, in the document the chart draws into. The same contract draws a host's own toolbar
// control and replaces a glyph of the chart's own, so a host learns it once.
//
// The factory is the host's own code, trusted as the page it runs in is. The chart does not fetch
// artwork, parse markup or accept a selector: what arrives is an element the host built. The chart
// keeps what makes a control a control, which is its name, its hit area, its focus and its pressed
// and disabled states; artwork changes how a control looks and never what it does.

/** Where one glyph will stand. */
export interface ChartIconContext {
  /** The document the glyph is drawn into. Create its nodes with this one, never a global. */
  readonly document: Document
  /** The box the glyph fills, in CSS pixels. The chart sizes the answered element to it, so a
   *  factory draws on whatever grid its viewBox names. */
  readonly width: number
  readonly height: number
  /** The reading direction of the control the glyph stands in. When a language turns the widget's
   *  direction around, the chart asks the factory again for every glyph it drew and puts the new
   *  drawing in place of the old; an answer it refuses leaves the old drawing standing. A glyph the
   *  chart mirrors for a right-to-left language is mirrored whatever artwork it wears, so a factory
   *  always draws the left-to-right form of those; `direction` is for artwork that differs otherwise. */
  readonly direction: 'ltr' | 'rtl'
}

/** Draws one glyph: a fresh `<svg>` element, never one it answered before or one already in the
 *  document. `currentColor` takes the control's own ink in every theme and state. */
export type ChartIconFactory = (context: ChartIconContext) => SVGSVGElement

/** Why a host's glyph was not drawn. */
export type ChartIconFailure = 'threw' | 'not-svg' | 'in-use'

/** One glyph the chart could not draw from a host's factory. The control fell back to the chart's
 *  own glyph, or to none where the control is the host's. Each icon reports its first failure. */
export interface ChartIconDiagnostic {
  /** The icon: a published icon id, or `toolbarButton` for the glyph of a host's own control. */
  icon: string
  code: ChartIconFailure
  message: string
}

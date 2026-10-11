// Whether a color leaf's value is one the chart can paint.
//
// A setting accepts browser color syntax beyond the theme's measurable hex and rgb palette, such as
// a named color or `transparent`. In a browser the answer is the same CSS assignment the renderer
// consumes, made on a detached element so nothing is inserted and no fallback color is inherited
// from a malformed value. A context-dependent value (a custom property, `currentcolor`, a CSS-wide
// keyword) cannot be painted the same way everywhere, so it is refused. Without a browser, only the
// portable parser can establish validity.
import { parseCssColor } from '../theme/color'

export function paintableColor(value: string): boolean {
  if (typeof document === 'undefined') return parseCssColor(value) !== null
  if (/\b(?:var|env)\s*\(|\b(?:currentcolor|inherit|initial|unset|revert(?:-layer)?)\b/i.test(value)) return false
  const style = document.createElement('span').style
  style.color = value
  return style.color !== ''
}

// The theme system's own color arithmetic. Quick Charts adds no dependency for this: parsing a CSS
// color, compositing a translucent value over its backdrop, and computing a WCAG contrast ratio are
// the three operations the schema's validation and contrast gates need, and each is a few lines of
// arithmetic defined by a public specification.
//
// The parser accepts the two notations a palette or a host override is written in: hex (`#rgb`,
// `#rgba`, `#rrggbb`, `#rrggbbaa`) and the `rgb()`/`rgba()` functions in either the comma or the
// space-with-slash form. It rejects everything else, including named colors and `currentColor`,
// because a role's value has to be measurable for the contrast gate to mean anything.

/** A parsed color in sRGB. Channels are 0-255 integers; `a` is 0-1. */
export interface Rgba {
  r: number
  g: number
  b: number
  a: number
}

const HEX = /^#([0-9a-f]{3,8})$/i
const FUNCTIONAL = /^rgba?\(([^)]*)\)$/i

/** One `rgb()` argument: a 0-255 number, or a percentage of 255. Alpha percentages are handled by
 *  the caller, which divides by 100 rather than by 255. */
function channel(token: string): number | null {
  const pct = token.endsWith('%')
  const n = Number(pct ? token.slice(0, -1) : token)
  if (!Number.isFinite(n)) return null
  return pct ? (n / 100) * 255 : n
}

/** Parse a CSS color string into sRGB channels, or null when the notation is not one a palette may
 *  use. A parse failure is a diagnostic, never a throw: an invalid host override is reported and
 *  the built-in value is kept. */
export function parseCssColor(input: string): Rgba | null {
  const value = input.trim()

  const hex = HEX.exec(value)
  if (hex) {
    const digits = hex[1]!
    const expand = (s: string): number => parseInt(s.length === 1 ? s + s : s, 16)
    if (digits.length === 3 || digits.length === 4) {
      const [r, g, b, a] = [digits[0]!, digits[1]!, digits[2]!, digits[3]]
      return { r: expand(r), g: expand(g), b: expand(b), a: a === undefined ? 1 : expand(a) / 255 }
    }
    if (digits.length === 6 || digits.length === 8) {
      const pair = (i: number): number => parseInt(digits.slice(i, i + 2), 16)
      return { r: pair(0), g: pair(2), b: pair(4), a: digits.length === 8 ? pair(6) / 255 : 1 }
    }
    return null
  }

  const fn = FUNCTIONAL.exec(value)
  if (!fn) return null
  const body = fn[1]!.trim()
  const [colorPart, alphaPart] = body.includes('/') ? body.split('/') : [body, undefined]
  const parts = colorPart!.trim().split(/[\s,]+/).filter(Boolean)
  const explicitAlpha = alphaPart?.trim() ?? (parts.length === 4 ? parts[3] : undefined)
  if (parts.length !== 3 && parts.length !== 4) return null
  const rgb = [parts[0]!, parts[1]!, parts[2]!].map(channel)
  if (rgb.some((c) => c === null)) return null
  let a = 1
  if (explicitAlpha !== undefined) {
    const raw = explicitAlpha.endsWith('%') ? Number(explicitAlpha.slice(0, -1)) / 100 : Number(explicitAlpha)
    if (!Number.isFinite(raw)) return null
    a = raw
  }
  const clamp = (n: number, hi: number): number => Math.min(hi, Math.max(0, n))
  return { r: clamp(Math.round(rgb[0]!), 255), g: clamp(Math.round(rgb[1]!), 255), b: clamp(Math.round(rgb[2]!), 255), a: clamp(a, 1) }
}

/** Flatten a translucent color onto an opaque backdrop, the way a browser composites it. Contrast
 *  is only defined between opaque colors, so every ratio starts here. */
export function compositeOver(front: Rgba, back: Rgba): Rgba {
  if (front.a >= 1) return { ...front, a: 1 }
  const mix = (f: number, b: number): number => Math.round(f * front.a + b * (1 - front.a))
  return { r: mix(front.r, back.r), g: mix(front.g, back.g), b: mix(front.b, back.b), a: 1 }
}

/** WCAG 2.2 relative luminance of an opaque sRGB color (WCAG 2.2, relative luminance definition). */
export function relativeLuminance(c: Rgba): number {
  const linear = (v: number): number => {
    const s = v / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * linear(c.r) + 0.7152 * linear(c.g) + 0.0722 * linear(c.b)
}

/** The WCAG 2.2 contrast ratio between a foreground and a backdrop, 1 to 21. Contrast is defined on
 *  opaque colors, so a translucent backdrop is flattened onto white first and the foreground is
 *  then composited onto that. */
export function contrastRatio(foreground: Rgba, background: Rgba): number {
  const front = compositeOver(foreground, background)
  const back = compositeOver(background, { r: 255, g: 255, b: 255, a: 1 })
  const [hi, lo] = [relativeLuminance(front), relativeLuminance(back)].sort((a, b) => b - a) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

/** The contrast ratio between two color strings, or null when either is unparseable. */
export function contrastOf(foreground: string, background: string): number | null {
  const f = parseCssColor(foreground)
  const b = parseCssColor(background)
  return f && b ? contrastRatio(f, b) : null
}

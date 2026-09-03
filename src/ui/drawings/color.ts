// The color arithmetic behind the palette and the custom picker: hex and HSV both ways, the base
// color of a value that carries alpha, and the swatch grid computed from hue angles and shade
// steps rather than written as literals, so the theme palettes stay the one file that holds a
// color.

export interface Hsv {
  /** 0..360 */
  h: number
  /** 0..1 */
  s: number
  /** 0..1 */
  v: number
}

const to2 = (n: number): string => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0')

/** `#rrggbb` from channels. */
export const rgbToHex = (r: number, g: number, b: number): string => `#${to2(r)}${to2(g)}${to2(b)}`

/** Whether a string is a six-digit hex color, with or without its hash. */
export const isHex = (s: string): boolean => /^#?[0-9a-f]{6}$/i.test(s)

/** `#rrggbb` to HSV. */
export function hexToHsv(hex: string): Hsv {
  const n = parseInt(hex.replace('#', ''), 16)
  const r = ((n >> 16) & 255) / 255
  const g = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  return { h, s: max === 0 ? 0 : d / max, v: max }
}

/** HSV to `#rrggbb`. */
export function hsvToHex(h: number, s: number, v: number): string {
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c
  const [r1, g1, b1] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
  return rgbToHex((r1 + m) * 255, (g1 + m) * 255, (b1 + m) * 255)
}

/** The opaque `#rrggbb` of a hex, rgb or rgba value: what a swatch highlight compares against and
 *  what the opacity track fades into. An unknown format passes through. */
export function hexOf(color: string): string {
  const rgb = color.trim().match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i)
  if (rgb) return rgbToHex(Number(rgb[1]), Number(rgb[2]), Number(rgb[3]))
  const short = color.trim().match(/^#([0-9a-f]{3})$/i)
  if (short) return `#${short[1]!.split('').map((c) => c + c).join('')}`.toLowerCase()
  return color.trim().toLowerCase()
}

/** Mix a hex color toward white (amount below zero) or black (amount above zero). */
export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.replace('#', ''), 16)
  const target = amount < 0 ? 255 : 0
  const t = Math.abs(amount)
  const ch = (v: number): number => v + (target - v) * t
  return rgbToHex(ch((n >> 16) & 255), ch((n >> 8) & 255), ch(n & 255))
}

/** The ten hues of the palette, as angles, with the saturation and value each is painted at. */
const HUES: readonly { h: number; s: number; v: number }[] = [
  { h: 355, s: 0.78, v: 0.95 },
  { h: 36, s: 1, v: 1 },
  { h: 54, s: 0.77, v: 1 },
  { h: 122, s: 0.54, v: 0.69 },
  { h: 168, s: 0.94, v: 0.6 },
  { h: 187, s: 1, v: 0.83 },
  { h: 225, s: 0.84, v: 1 },
  { h: 262, s: 0.68, v: 0.72 },
  { h: 291, s: 0.78, v: 0.69 },
  { h: 340, s: 0.87, v: 0.91 },
]

/** The palette: a grey ramp on the first row, then five shade rows over the ten hues, light to
 *  dark. Ten columns by six rows, every cell a `#rrggbb`. */
export const SWATCH_ROWS: readonly (readonly string[])[] = (() => {
  const greys = [1, 0.86, 0.72, 0.61, 0.5, 0.39, 0.29, 0.18, 0.06, 0].map((v) => hsvToHex(0, 0, v))
  const bases = HUES.map((hue) => hsvToHex(hue.h, hue.s, hue.v))
  return [greys, ...[-0.5, -0.25, 0, 0.25, 0.5].map((amount) => bases.map((base) => shade(base, amount)))]
})()

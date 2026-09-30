// The color arithmetic behind every palette and custom editor in the chart: hex and HSV both ways,
// the opaque base of a value that carries alpha, and the swatch grid. The grid's ten hues and ten
// greys are stated as the values the historical picker painted, because a palette is a chosen set
// of colors rather than a formula: deriving the hues from angles moved eight of the ten off their
// pinned values. The five shade rows still derive, by mixing each hue toward white and black.
//
// These are the only literal colors outside `theme/palettes.ts` and the documented series
// defaults, and they belong here rather than in a theme role: they are the set the chart OFFERS a
// trader to choose from, the same in light and dark, and a pick becomes a drawing or indicator
// property rather than anything a mode re-resolves. `theme/literals.test.ts` names this file as
// that exemption and pins its count.
import { parseCssColor } from '../../../theme/color'

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
 *  what the opacity track fades into. A value in a notation the palette does not read passes
 *  through untouched, so an unsupported declaration is never rewritten as opaque black. */
export function hexOf(color: string): string {
  const value = color.trim()
  const parsed = parseCssColor(value)
  if (parsed) return rgbToHex(parsed.r, parsed.g, parsed.b)
  return value.toLowerCase()
}

/** The color and alpha of a value the control can edit, or null when the notation is not one it
 *  reads. A null keeps the declaration intact until a valid edit replaces it. */
export function readColor(color: string | undefined): { hex: string; alpha: number } | null {
  if (!color) return null
  const parsed = parseCssColor(color.trim())
  if (!parsed) return null
  return { hex: rgbToHex(parsed.r, parsed.g, parsed.b), alpha: parsed.a }
}

/** The grey ramp of the first row, white to black. */
export const GREY_RAMP: readonly string[] = ['#ffffff', '#dbdbdb', '#b8b8b8', '#9c9c9c', '#808080', '#636363', '#4a4a4a', '#2e2e2e', '#0f0f0f', '#000000']

/** The ten base hues, the row every ramp below is a lighter or darker reading of. */
export const HUE_BASES: readonly string[] = ['#f23645', '#ff9800', '#ffeb3b', '#4caf50', '#089981', '#00bcd4', '#2962ff', '#673ab7', '#9c27b0', '#e91e63']

/** The six ramps under the bases, light to dark. Each is a CHOSEN row rather than a mix of the
 *  base above it: a ramp computed by moving every hue the same distance toward white or black
 *  goes muddy in the greens and neons in the yellows, so each step is stated as the value it is. */
export const HUE_RAMPS: readonly (readonly string[])[] = [
  ['#fccbcd', '#ffe0b2', '#fff9c4', '#c8e6c9', '#ace5dc', '#b2ebf2', '#bbd9fb', '#d1c4e9', '#e1bee7', '#f8bbd0'],
  ['#faa1a4', '#ffcc80', '#fff59d', '#a5d6a7', '#70ccbd', '#80deea', '#90bff9', '#b39ddb', '#ce93d8', '#f48fb1'],
  ['#f77c80', '#ffb74d', '#fff176', '#81c784', '#42bda8', '#4dd0e1', '#5b9cf6', '#9575cd', '#ba68c8', '#f06292'],
  ['#f7525f', '#ffa726', '#ffee58', '#66bb6a', '#22ab94', '#26c6da', '#3179f5', '#7e57c2', '#ab47bc', '#ec407a'],
  ['#b22833', '#f57c00', '#fbc02d', '#388e3c', '#056656', '#0097a7', '#1848cc', '#512da8', '#7b1fa2', '#c2185b'],
  ['#801922', '#e65100', '#f57f17', '#1b5e20', '#00332a', '#006064', '#0c3299', '#311b92', '#4a148c', '#880e4f'],
]

/** The default the custom editor opens on when the current value is not a color it can read. */
export const CUSTOM_COLOR_FALLBACK = '#4c98fb'

/** The palette as the panel lays it out: the greys and the bases stand together as what a trader
 *  reaches for first, and the ramps stand as their own block under a gap. Ten columns throughout,
 *  every cell a `#rrggbb`. */
export const SWATCH_BLOCKS: readonly (readonly (readonly string[])[])[] = [[GREY_RAMP, HUE_BASES], HUE_RAMPS]

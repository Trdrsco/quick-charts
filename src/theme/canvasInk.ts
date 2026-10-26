// The lightness of the canvas a chart is drawn on, read as a theme mode: the one answer every surface
// drawn over the plot reads its ink from. A viewer can paint a white canvas in dark mode or a black
// one in light mode, and the inks the mode in effect draws with would then vanish into it. The
// canvas's tone is the mode whose own ink reads at the higher contrast over the canvas color, so a
// light canvas reads as `light` (the light mode's dark ink) and a dark one as `dark`.
import { contrastOf } from './color'
import { BUILT_IN_THEMES } from './palettes'
import type { ThemeMode } from './schema'

/** The mode whose own ink reads best over a canvas of `background`: `light` for a light canvas and
 *  `dark` for a dark one. A translucent background is read over `beneath`, the opaque surface it is
 *  drawn on, and over white without one. Null for a color that cannot be read. */
export function canvasTone(background: string, beneath?: string): ThemeMode | null {
  const light = contrastOf(BUILT_IN_THEMES.light['text.onCanvas'], background, beneath)
  const dark = contrastOf(BUILT_IN_THEMES.dark['text.onCanvas'], background, beneath)
  if (light === null || dark === null) return null
  return light >= dark ? 'light' : 'dark'
}

/** The mode whose inks draw over a canvas of `background` while `mode` is in effect: the canvas's
 *  tone where it is the other mode, and null where the mode in effect reads best. A translucent
 *  background is read over the mode's own canvas. */
export function canvasInk(background: string, mode: ThemeMode): ThemeMode | null {
  const tone = canvasTone(background, BUILT_IN_THEMES[mode]['canvas.background'])
  return tone !== null && tone !== mode ? tone : null
}

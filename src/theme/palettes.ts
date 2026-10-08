// The built-in light and dark palettes: the only place in the package where a theme color is
// written as a literal. Every other module reads a role.
//
// These values are the package's own, chosen for a complete chart UI that holds up in both modes:
// a light ink of `rgb(15, 15, 15)` and a dark ink of `rgb(219, 219, 219)`, a dark panel ground of
// `rgb(31, 31, 31)`, a 6px panel radius, and floating-surface shadows of
// `rgba(0, 0, 0, 0.2) 0 2px 4px` in light and `rgba(0, 0, 0, 0.4)` in dark. This file is where
// they live.
//
// Readability is a gate, not a preference. Where a value cannot reach the WCAG 2.2 AA ratio the
// role's `contrast` rules require, on every ground the recipes draw it over, what stands here is
// the hue-preserving value that does, and `theme/contrast.test.ts` recomputes every ratio on each
// run. That is why light `status.positive` is not `rgb(8, 153, 129)`, which reads at 3.57 to 1 on
// white (dark mode keeps that value, which reads at 4.62 to 1 on the dark panel), and why the muted
// ink is `#636363` in light and `#9c9c9c` in dark rather than a mid grey of `rgb(140, 140, 140)`,
// which falls short of 4.5 to 1 over the dark selected fill a search or menu row wears. It is also
// why the dark match highlight is `#5280ff` rather than light mode's `#2962ff`, which reads at 3.36
// to 1 on the dark panel; light mode keeps `#2962ff`, which clears 4.5 to 1 on white. The accent
// is a mark and never words, and the focus ring keeps its value in each mode. The selected fill is
// a step of the neutral grey ramp, and the selection tint is a blue at an alpha. A field's edge is a
// step of the same ramp and steps once more under the pointer; the edge of a refused value is one
// red in both modes, which reads at the non-text ratio on white and on both dark surfaces.
//
// The illustration roles are the one set drawn from a cooler grey: an empty state's art is not a
// control, so it does not have to sit on the ramp the controls share.
//
// The series pair is the market's own, green up and red down in both modes, and it is the floor the
// chart's appearance ladder paints default candle bodies, borders and wicks from until a host or a
// viewer names their own. The brand pair in `overrides.ts` stays with what a host draws on top. A
// positive TEXT role and a rising SERIES are different jobs, so one does not displace the other.
//
// The motion roles are the same in both modes, because a mode changes how the chart looks, not how
// it moves, and this file is where every duration, timing function and motion scale the chart runs
// is written. A modal dialog opens over the base duration: its backdrop on the out timing, its box on
// the standard timing from the entrance scale.
//
// This module imports no runtime value, only its types. The build script loads it directly under
// Node's TypeScript stripping, which resolves no extensionless relative specifier.
import type { SemanticTheme, ThemeMode } from './schema'

/** The built-in light palette. */
export const LIGHT_THEME: SemanticTheme = {
  'canvas.background': '#ffffff',
  'canvas.paneBorder': '#ebebeb',

  'series.up': '#089981',
  'series.down': '#f23645',
  'series.neutral': '#787b86',

  'scale.grid': 'rgba(0, 0, 0, 0.06)',
  'scale.background': '#ffffff',
  'scale.border': '#e0e3eb',
  'scale.text': '#5b616e',
  'scale.crosshair': '#9598a1',
  'scale.crosshairLabelBackground': '#131722',
  'scale.crosshairLabelText': '#ffffff',
  'scale.sessionPreMarket': 'rgba(76, 152, 251, 0.06)',
  'scale.sessionExtended': 'rgba(76, 152, 251, 0.06)',
  'scale.sessionAfterHours': 'rgba(245, 166, 35, 0.06)',
  'scale.sessionClosed': 'rgba(0, 0, 0, 0.05)',

  'text.primary': '#0f0f0f',
  'text.secondary': '#4a4a4a',
  'text.muted': '#636363',
  'text.disabled': '#b8b8b8',
  'text.inverse': '#ffffff',
  'text.link': '#2962ff',
  'text.highlight': '#2962ff',
  'text.onCanvas': '#0f0f0f',
  'text.fontFamily': '-apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, Ubuntu, sans-serif',
  'text.fontSizeAxis': '13px',
  'text.fontSizeTitle': '14px',
  'text.fontSizeBase': '14px',
  'text.fontSizeSmall': '11px',
  'text.fontSizeMicro': '10px',

  'chrome.surface': '#ffffff',
  'chrome.surfaceRaised': '#ffffff',
  'chrome.border': '#ebebeb',
  'chrome.borderStrong': '#8c8c8c',
  'chrome.fieldBorder': '#dbdbdb',
  'chrome.caret': '#0f0f0f',
  'chrome.grip': '#b8b8b8',
  'chrome.scrollThumb': '#9c9c9c',
  'chrome.radius': '6px',
  'chrome.radiusLarge': '6px',

  'overlay.surface': '#ffffff',
  'overlay.separator': '#ebebeb',
  'overlay.shadow': '0 2px 4px rgba(0, 0, 0, 0.2)',
  'overlay.scrim': 'rgba(0, 0, 0, 0.35)',

  'state.accent': '#2962ff',
  'state.hover': '#f2f2f2',
  'state.hoverInk': '#0f0f0f',
  'state.pressed': '#ebebeb',
  'state.pressedHover': '#dbdbdb',
  'state.selected': '#ebebeb',
  'state.focusRing': '#2962ff',
  'state.markInk': '#ffffff',
  'state.selection': 'rgba(31, 86, 238, 0.18)',

  'control.on': '#2e2e2e',
  'control.onHover': '#4a4a4a',
  'control.onPressed': '#707070',
  'control.off': '#9c9c9c',
  'control.offHover': '#8c8c8c',
  'control.offPressed': '#b8b8b8',
  'control.mark': '#ffffff',
  'control.fieldEdge': '#dbdbdb',
  'control.fieldEdgeHover': '#a8a8a8',
  'control.fieldInvalid': '#f23645',
  'control.fieldFill': '#f2f2f2',

  'status.positive': '#067a67',
  'status.negative': '#cc2f3c',
  'status.warning': '#8a5a00',
  'status.info': '#1160c4',
  'status.loading': '#787b86',
  'status.sessionPreMarket': '#4c98fb',
  'status.sessionOpen': '#22c55e',
  'status.sessionExtended': '#4c98fb',
  'status.sessionAfterHours': '#f5a623',
  'status.sessionClosed': 'rgba(0, 0, 0, 0.35)',

  'illustration.ink': '#1e222d',
  'illustration.accent': '#2196f3',
  'illustration.accentInk': '#ffffff',

  'drawing.line': '#2962ff',
  'drawing.fill': 'rgba(41, 98, 255, 0.15)',
  'drawing.text': '#0f0f0f',
  'drawing.handle': '#ffffff',
  'drawing.selected': '#2962ff',

  'motion.durationFast': '90ms',
  'motion.durationBase': '150ms',
  'motion.durationModerate': '250ms',
  'motion.durationSlow': '350ms',
  'motion.durationSlower': '500ms',
  'motion.easingStandard': 'ease',
  'motion.easingOut': 'ease-out',
  'motion.easingLinear': 'linear',
  'motion.easingSpring': 'cubic-bezier(0.175, 0.885, 0.32, 1.275)',
  'motion.scaleEnter': '0.97',
}

/** The built-in dark palette. */
export const DARK_THEME: SemanticTheme = {
  'canvas.background': '#0f0f0f',
  'canvas.paneBorder': '#2e2e2e',

  'series.up': '#089981',
  'series.down': '#f23645',
  'series.neutral': '#787b86',

  'scale.grid': 'rgba(255, 255, 255, 0.035)',
  'scale.background': '#0f0f0f',
  'scale.border': '#2a2e39',
  'scale.text': '#9aa0aa',
  'scale.crosshair': '#758696',
  'scale.crosshairLabelBackground': '#dbdbdb',
  'scale.crosshairLabelText': '#0f0f0f',
  'scale.sessionPreMarket': 'rgba(76, 152, 251, 0.05)',
  'scale.sessionExtended': 'rgba(76, 152, 251, 0.05)',
  'scale.sessionAfterHours': 'rgba(245, 166, 35, 0.045)',
  'scale.sessionClosed': 'rgba(0, 0, 0, 0.22)',

  'text.primary': '#dbdbdb',
  'text.secondary': '#b8b8b8',
  'text.muted': '#9c9c9c',
  'text.disabled': '#575757',
  'text.inverse': '#0f0f0f',
  'text.link': '#5b9cf6',
  'text.highlight': '#5280ff',
  'text.onCanvas': '#dbdbdb',
  'text.fontFamily': '-apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, Ubuntu, sans-serif',
  'text.fontSizeAxis': '13px',
  'text.fontSizeTitle': '14px',
  'text.fontSizeBase': '14px',
  'text.fontSizeSmall': '11px',
  'text.fontSizeMicro': '10px',

  'chrome.surface': '#0f0f0f',
  'chrome.surfaceRaised': '#2e2e2e',
  'chrome.border': '#2e2e2e',
  'chrome.borderStrong': '#707070',
  'chrome.fieldBorder': '#636363',
  'chrome.caret': '#8c8c8c',
  'chrome.grip': '#575757',
  'chrome.scrollThumb': '#3d3d3d',
  'chrome.radius': '6px',
  'chrome.radiusLarge': '6px',

  'overlay.surface': '#1f1f1f',
  'overlay.separator': '#4a4a4a',
  'overlay.shadow': '0 2px 4px rgba(0, 0, 0, 0.4)',
  'overlay.scrim': 'rgba(0, 0, 0, 0.5)',

  'state.accent': '#2962ff',
  'state.hover': '#2e2e2e',
  'state.hoverInk': '#c9c9c9',
  'state.pressed': '#3d3d3d',
  'state.pressedHover': '#4a4a4a',
  'state.selected': '#333333',
  'state.focusRing': '#2962ff',
  'state.markInk': '#ffffff',
  'state.selection': 'rgba(82, 160, 252, 0.22)',

  'control.on': '#f2f2f2',
  'control.onHover': '#dbdbdb',
  'control.onPressed': '#8c8c8c',
  'control.off': '#636363',
  'control.offHover': '#707070',
  'control.offPressed': '#636363',
  'control.mark': '#2e2e2e',
  'control.fieldEdge': '#575757',
  'control.fieldEdgeHover': '#707070',
  'control.fieldInvalid': '#f23645',
  'control.fieldFill': '#2e2e2e',

  'status.positive': '#089981',
  'status.negative': '#f7525f',
  'status.warning': '#f5a623',
  'status.info': '#68a5ff',
  'status.loading': '#787b86',
  'status.sessionPreMarket': '#4c98fb',
  'status.sessionOpen': '#22c55e',
  'status.sessionExtended': '#4c98fb',
  'status.sessionAfterHours': '#f5a623',
  'status.sessionClosed': 'rgba(255, 255, 255, 0.35)',

  'illustration.ink': '#d1d4dc',
  'illustration.accent': '#1976d2',
  'illustration.accentInk': '#d1d4dc',

  'drawing.line': '#4c98fb',
  'drawing.fill': 'rgba(76, 152, 251, 0.15)',
  'drawing.text': '#dbdbdb',
  'drawing.handle': '#0f0f0f',
  'drawing.selected': '#4c98fb',

  'motion.durationFast': '90ms',
  'motion.durationBase': '150ms',
  'motion.durationModerate': '250ms',
  'motion.durationSlow': '350ms',
  'motion.durationSlower': '500ms',
  'motion.easingStandard': 'ease',
  'motion.easingOut': 'ease-out',
  'motion.easingLinear': 'linear',
  'motion.easingSpring': 'cubic-bezier(0.175, 0.885, 0.32, 1.275)',
  'motion.scaleEnter': '0.97',
}

/** Both built-in palettes, keyed by mode. */
export const BUILT_IN_THEMES: Readonly<Record<ThemeMode, SemanticTheme>> = Object.freeze({
  light: LIGHT_THEME,
  dark: DARK_THEME,
})

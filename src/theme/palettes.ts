// The built-in light and dark palettes: the only place in the package where a theme color is
// written as a literal. Every other module reads a role.
//
// Provenance. The neutral grounds and inks are derived from the signed live reference corpus in
// `docs/corpus/advanced-charts-styles/`, which records how a mature chart product renders one
// complete UI in both modes: light ink `rgb(15, 15, 15)` and dark ink `rgb(219, 219, 219)`, a dark
// panel ground of `rgb(31, 31, 31)`, a dark muted ink of `rgb(140, 140, 140)`, a 6px panel radius,
// and floating-surface shadows of `rgba(0, 0, 0, 0.2) 0 2px 4px` in light and `rgba(0, 0, 0, 0.4)`
// in dark. Those measurements are reference evidence, not source: Quick Charts owns its own values,
// and the corpus README records that boundary.
//
// Readability is a gate, not a preference. Where a measured reference value cannot reach the WCAG
// 2.2 AA ratio required by the role's `contrast` rule, the value here is the hue-preserving one
// that does, and `theme/contrast.test.ts` recomputes every ratio on each run. That is why light
// `status.positive` is not the corpus `rgb(8, 153, 129)`, which reads at 3.57 to 1 on white: dark
// mode keeps the measured value, which reads at 4.62 to 1 on the dark panel.
//
// The series pair is the documented brand pair from `overrides.ts`, unchanged. The corpus positive
// value describes a text role, not a series, so it does not displace it. Candle body, border, and
// wick colors are not theme roles at all: they belong to the separate chart appearance ladder.
//
// This module imports no runtime value, only its types. The build script loads it directly under
// Node's TypeScript stripping, which resolves no extensionless relative specifier.
import type { SemanticTheme, ThemeMode } from './schema'

/** The built-in light palette. */
export const LIGHT_THEME: SemanticTheme = {
  'canvas.background': '#ffffff',
  'canvas.paneBorder': '#e0e3eb',

  'series.up': '#4c98fb',
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
  'text.secondary': '#5b616e',
  'text.muted': '#6a6d78',
  'text.disabled': '#a3a6af',
  'text.inverse': '#ffffff',
  'text.link': '#1160c4',
  'text.onCanvas': '#5b616e',
  'text.fontFamily': '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  'text.fontSizeAxis': '13px',
  'text.fontSizeTitle': '14px',
  'text.fontSizeBase': '13px',
  'text.fontSizeSmall': '11px',
  'text.fontSizeMicro': '10px',

  'chrome.surface': '#ffffff',
  'chrome.surfaceRaised': '#f0f3fa',
  'chrome.border': '#e0e3eb',
  'chrome.borderStrong': '#8a8d96',
  'chrome.radius': '4px',
  'chrome.radiusLarge': '6px',

  'overlay.surface': '#ffffff',
  'overlay.border': '#e0e3eb',
  'overlay.separator': '#e0e3eb',
  'overlay.shadow': '0 2px 4px rgba(0, 0, 0, 0.2)',
  'overlay.scrim': 'rgba(0, 0, 0, 0.35)',

  'state.accent': '#2962ff',
  'state.hover': 'rgba(0, 0, 0, 0.06)',
  'state.pressed': 'rgba(0, 0, 0, 0.1)',
  'state.selected': 'rgba(41, 98, 255, 0.12)',
  'state.focusRing': '#2962ff',
  'state.selection': 'rgba(41, 98, 255, 0.18)',

  'status.positive': '#067a67',
  'status.negative': '#c62537',
  'status.warning': '#8a5a00',
  'status.info': '#1160c4',
  'status.loading': '#787b86',
  'status.sessionPreMarket': '#4c98fb',
  'status.sessionOpen': '#22c55e',
  'status.sessionExtended': '#4c98fb',
  'status.sessionAfterHours': '#f5a623',
  'status.sessionClosed': 'rgba(0, 0, 0, 0.35)',

  'drawing.line': '#2962ff',
  'drawing.fill': 'rgba(41, 98, 255, 0.15)',
  'drawing.text': '#0f0f0f',
  'drawing.handle': '#ffffff',
  'drawing.selected': '#2962ff',

  'motion.durationFast': '90ms',
  'motion.durationBase': '150ms',
}

/** The built-in dark palette. */
export const DARK_THEME: SemanticTheme = {
  'canvas.background': '#0f0f0f',
  'canvas.paneBorder': '#2a2e39',

  'series.up': '#4c98fb',
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
  'text.secondary': '#a3a9b4',
  'text.muted': '#8c8c8c',
  'text.disabled': '#5c5f66',
  'text.inverse': '#0f0f0f',
  'text.link': '#68a5ff',
  'text.onCanvas': '#9aa0aa',
  'text.fontFamily': '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  'text.fontSizeAxis': '13px',
  'text.fontSizeTitle': '14px',
  'text.fontSizeBase': '13px',
  'text.fontSizeSmall': '11px',
  'text.fontSizeMicro': '10px',

  'chrome.surface': '#1f1f1f',
  'chrome.surfaceRaised': '#2a2a2a',
  'chrome.border': '#2a2e39',
  'chrome.borderStrong': '#6b7280',
  'chrome.radius': '4px',
  'chrome.radiusLarge': '6px',

  'overlay.surface': '#1f1f1f',
  'overlay.border': '#2a2e39',
  'overlay.separator': '#2a2e39',
  'overlay.shadow': '0 2px 4px rgba(0, 0, 0, 0.4)',
  'overlay.scrim': 'rgba(0, 0, 0, 0.5)',

  'state.accent': '#4c98fb',
  'state.hover': 'rgba(255, 255, 255, 0.08)',
  'state.pressed': 'rgba(255, 255, 255, 0.12)',
  'state.selected': 'rgba(76, 152, 251, 0.16)',
  'state.focusRing': '#4c98fb',
  'state.selection': 'rgba(76, 152, 251, 0.22)',

  'status.positive': '#089981',
  'status.negative': '#ff5a68',
  'status.warning': '#f5a623',
  'status.info': '#68a5ff',
  'status.loading': '#787b86',
  'status.sessionPreMarket': '#4c98fb',
  'status.sessionOpen': '#22c55e',
  'status.sessionExtended': '#4c98fb',
  'status.sessionAfterHours': '#f5a623',
  'status.sessionClosed': 'rgba(255, 255, 255, 0.35)',

  'drawing.line': '#4c98fb',
  'drawing.fill': 'rgba(76, 152, 251, 0.15)',
  'drawing.text': '#dbdbdb',
  'drawing.handle': '#0f0f0f',
  'drawing.selected': '#4c98fb',

  'motion.durationFast': '90ms',
  'motion.durationBase': '150ms',
}

/** Both built-in palettes, keyed by mode. */
export const BUILT_IN_THEMES: Readonly<Record<ThemeMode, SemanticTheme>> = Object.freeze({
  light: LIGHT_THEME,
  dark: DARK_THEME,
})

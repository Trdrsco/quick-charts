// The semantic role inventory: the public, stable meanings a host themes Quick Charts through.
//
// A role is a purpose, not a shade position and not a selector. `text.muted` keeps its meaning when
// the component that renders it is rewritten, which is what makes it safe to publish. The private
// custom-property names, the component selectors, and the internal ramps the built-in palettes were
// picked from are implementation and may change.
//
// This inventory is data, so the compiler and the build script read the same list the manual does.
// `SemanticTheme` is derived from it, the built-in palettes are checked against it, the generated
// stylesheet declares one custom property per entry, and `theme-manifest.json` publishes it. A role
// that exists only in prose does not exist.
//
// This module deliberately has no import at all. The build script loads it directly under Node's
// TypeScript stripping, which resolves no extensionless relative specifier.

/** The two modes Quick Charts ships complete. A host switches between them at runtime; it does not
 *  add a third. A host that keeps named brand presets resolves each preset to a custom light or
 *  dark palette before passing it in. */
export type ThemeMode = 'light' | 'dark'

/** Both modes, in the order they appear in the generated stylesheet. */
export const THEME_MODES: readonly ThemeMode[] = ['light', 'dark']

/** What a role's value is written as. Every value is a CSS token string, so `length` is `'4px'` and
 *  `duration` is `'150ms'`; the kind says which tokens are valid, and validation enforces it. */
export type ThemeRoleKind = 'color' | 'length' | 'font' | 'duration' | 'shadow'

/** The grouping a role belongs to. Families organize the manual and the manifest; they are not part
 *  of a role's identity. */
export type ThemeRoleFamily = 'canvas' | 'series' | 'scale' | 'text' | 'chrome' | 'overlay' | 'state' | 'status' | 'drawing' | 'motion'

/** A readability requirement the palettes must meet: this role's value, read against the value of
 *  `over`, reaches `min` under the WCAG 2.2 contrast formula. Where `over` is a translucent tint
 *  such as the hover or selected fill, `on` names the opaque surface the tint is drawn on, and the
 *  tint is flattened onto it before measuring. Body text needs 4.5, a non-text indicator such as a
 *  focus ring needs 3. */
export interface ThemeContrastRule {
  over: string
  on?: string
  min: number
}

/** One entry of the inventory. */
export interface ThemeRole {
  /** The public id, `family.name`. Also the key of `SemanticTheme`. */
  id: string
  family: ThemeRoleFamily
  kind: ThemeRoleKind
  /** One sentence naming what the role means, published in the manifest and the manual. */
  description: string
  /** Present when the role carries readability requirements: one rule per ground the stylesheet's
   *  recipes draw it on. */
  contrast?: readonly ThemeContrastRule[]
}

/** The complete role inventory. Adding an entry is a minor API change and needs a value in both
 *  built-in palettes; removing one is breaking. */
export const THEME_ROLES = [
  // ── canvas: the chart plot area itself ──────────────────────────────────────────────────────
  { id: 'canvas.background', family: 'canvas', kind: 'color', description: 'The fill behind the plotted series.' },
  { id: 'canvas.paneBorder', family: 'canvas', kind: 'color', description: 'The divider between stacked panes and around the plot area.' },

  // ── series: direction, before any chart appearance override ─────────────────────────────────
  { id: 'series.up', family: 'series', kind: 'color', description: 'A rising value: up volume, a rising study tint, a positive series default.' },
  { id: 'series.down', family: 'series', kind: 'color', description: 'A falling value: down volume, a falling study tint, a negative series default.' },
  { id: 'series.neutral', family: 'series', kind: 'color', description: 'A series or level with no direction, such as a study level line.' },

  // ── scale: grid, axes, crosshair, and session shading ───────────────────────────────────────
  { id: 'scale.grid', family: 'scale', kind: 'color', description: 'The grid lines drawn across the plot area.' },
  { id: 'scale.background', family: 'scale', kind: 'color', description: 'The ground behind the price and time scales.' },
  { id: 'scale.border', family: 'scale', kind: 'color', description: 'The line separating a scale from the plot area.' },
  { id: 'scale.text', family: 'scale', kind: 'color', description: 'Tick labels on the price and time scales.', contrast: [{ over: 'scale.background', min: 4.5 }] },
  { id: 'scale.crosshair', family: 'scale', kind: 'color', description: 'The crosshair lines that follow the pointer.' },
  { id: 'scale.crosshairLabelBackground', family: 'scale', kind: 'color', description: 'The fill of the crosshair value label on a scale.' },
  {
    id: 'scale.crosshairLabelText',
    family: 'scale',
    kind: 'color',
    description: 'The value inside the crosshair label.',
    contrast: [{ over: 'scale.crosshairLabelBackground', min: 4.5 }],
  },
  { id: 'scale.sessionPreMarket', family: 'scale', kind: 'color', description: 'Shading over pre-market bars.' },
  { id: 'scale.sessionExtended', family: 'scale', kind: 'color', description: 'Shading over electronic-hours bars.' },
  { id: 'scale.sessionAfterHours', family: 'scale', kind: 'color', description: 'Shading over after-hours bars.' },
  { id: 'scale.sessionClosed', family: 'scale', kind: 'color', description: 'Shading over bars while the market is closed.' },

  // ── text: ink and the type roles canvas and DOM must agree on ───────────────────────────────
  // The ink roles are read on the plain surface and, inside a menu, picker or search row, on the
  // hover and selected tints over the floating surface; each ground the recipes draw is a rule.
  {
    id: 'text.primary',
    family: 'text',
    kind: 'color',
    description: 'Default ink for chart controls, menus, and dialogs.',
    contrast: [
      { over: 'chrome.surface', min: 4.5 },
      { over: 'state.selected', on: 'overlay.surface', min: 4.5 },
    ],
  },
  {
    id: 'text.secondary',
    family: 'text',
    kind: 'color',
    description: 'Supporting ink: descriptions, group headings, secondary values.',
    contrast: [
      { over: 'chrome.surface', min: 4.5 },
      { over: 'state.selected', on: 'overlay.surface', min: 4.5 },
      { over: 'state.hover', on: 'overlay.surface', min: 4.5 },
    ],
  },
  {
    id: 'text.muted',
    family: 'text',
    kind: 'color',
    description: 'The least emphasized readable ink, such as a keyboard hint.',
    contrast: [
      { over: 'chrome.surface', min: 4.5 },
      { over: 'state.selected', on: 'overlay.surface', min: 4.5 },
      { over: 'state.hover', on: 'overlay.surface', min: 4.5 },
    ],
  },
  { id: 'text.disabled', family: 'text', kind: 'color', description: 'Ink of a control that cannot be used. WCAG exempts an inactive control from a contrast minimum.' },
  {
    id: 'text.inverse',
    family: 'text',
    kind: 'color',
    description: 'Ink on a saturated accent or danger fill.',
    contrast: [
      { over: 'state.accent', min: 4.5 },
      { over: 'status.negative', min: 4.5 },
    ],
  },
  { id: 'text.link', family: 'text', kind: 'color', description: 'Ink of a text link inside chart chrome.', contrast: [{ over: 'chrome.surface', min: 4.5 }] },
  { id: 'text.onCanvas', family: 'text', kind: 'color', description: 'Ink drawn directly over the plot area, such as the legend.', contrast: [{ over: 'canvas.background', min: 4.5 }] },
  { id: 'text.fontFamily', family: 'text', kind: 'font', description: 'The font stack chart chrome and canvas text share. Quick Charts never downloads a font.' },
  { id: 'text.fontSizeAxis', family: 'text', kind: 'length', description: 'Size of scale and crosshair labels drawn into the canvas.' },
  { id: 'text.fontSizeTitle', family: 'text', kind: 'length', description: 'Size of a dialog or panel title.' },
  { id: 'text.fontSizeBase', family: 'text', kind: 'length', description: 'Size of ordinary control and menu text.' },
  { id: 'text.fontSizeSmall', family: 'text', kind: 'length', description: 'Size of dense control text, such as a legend row.' },
  { id: 'text.fontSizeMicro', family: 'text', kind: 'length', description: 'Size of the smallest chip and hint text.' },

  // ── chrome: the surfaces and borders of the chart's own controls ────────────────────────────
  { id: 'chrome.surface', family: 'chrome', kind: 'color', description: 'The fill of toolbars, rails, bars, and panels.' },
  { id: 'chrome.surfaceRaised', family: 'chrome', kind: 'color', description: 'The fill of a control sitting on a chrome surface, such as a button or field.' },
  { id: 'chrome.border', family: 'chrome', kind: 'color', description: 'The ordinary border of a control or panel.' },
  { id: 'chrome.borderStrong', family: 'chrome', kind: 'color', description: 'A border or divider that must stay visible at a glance.', contrast: [{ over: 'chrome.surface', min: 3 }] },
  { id: 'chrome.radius', family: 'chrome', kind: 'length', description: 'Corner radius of a control.' },
  { id: 'chrome.radiusLarge', family: 'chrome', kind: 'length', description: 'Corner radius of a panel, dialog, or menu.' },

  // ── overlay: menus, dialogs, popovers, and what sits behind them ────────────────────────────
  { id: 'overlay.surface', family: 'overlay', kind: 'color', description: 'The fill of a floating menu, dialog, or popover.' },
  { id: 'overlay.border', family: 'overlay', kind: 'color', description: 'The border of a floating surface.' },
  { id: 'overlay.separator', family: 'overlay', kind: 'color', description: 'The rule between groups inside a menu or panel.' },
  { id: 'overlay.shadow', family: 'overlay', kind: 'shadow', description: 'The elevation shadow of a floating surface.' },
  { id: 'overlay.scrim', family: 'overlay', kind: 'color', description: 'The backdrop that dims the chart behind a modal dialog.' },

  // ── state: hover, pressed, selected, focus, and selection ───────────────────────────────────
  // An active tool or pressed toggle writes the accent as INK over the selected tint, on a toolbar
  // and inside a dialog alike, so the accent is held to the text ratio on both.
  {
    id: 'state.accent',
    family: 'state',
    kind: 'color',
    description: 'The accent an active tool or a primary action wears.',
    contrast: [
      { over: 'state.selected', on: 'chrome.surface', min: 4.5 },
      { over: 'state.selected', on: 'overlay.surface', min: 4.5 },
    ],
  },
  { id: 'state.hover', family: 'state', kind: 'color', description: 'The fill a control takes under the pointer.' },
  { id: 'state.pressed', family: 'state', kind: 'color', description: 'The fill a control takes while the pointer is down.' },
  { id: 'state.selected', family: 'state', kind: 'color', description: 'The fill of a chosen row, tab, or tool.' },
  { id: 'state.focusRing', family: 'state', kind: 'color', description: 'The visible focus indicator, including the active pane ring.', contrast: [{ over: 'chrome.surface', min: 3 }] },
  { id: 'state.selection', family: 'state', kind: 'color', description: 'The tint over selected content.' },

  // ── status: feedback, including market session status ───────────────────────────────────────
  { id: 'status.positive', family: 'status', kind: 'color', description: 'A positive value or a successful outcome in chart chrome.', contrast: [{ over: 'chrome.surface', min: 4.5 }] },
  { id: 'status.negative', family: 'status', kind: 'color', description: 'A negative value or a failed outcome in chart chrome.', contrast: [{ over: 'chrome.surface', min: 4.5 }] },
  { id: 'status.warning', family: 'status', kind: 'color', description: 'A condition the reader should notice before acting.', contrast: [{ over: 'chrome.surface', min: 4.5 }] },
  { id: 'status.info', family: 'status', kind: 'color', description: 'An informational note in chart chrome.', contrast: [{ over: 'chrome.surface', min: 4.5 }] },
  { id: 'status.loading', family: 'status', kind: 'color', description: 'The indicator shown while the chart waits for data.' },
  { id: 'status.sessionPreMarket', family: 'status', kind: 'color', description: 'The session status marker for pre-market.' },
  { id: 'status.sessionOpen', family: 'status', kind: 'color', description: 'The session status marker while the market is open.' },
  { id: 'status.sessionExtended', family: 'status', kind: 'color', description: 'The session status marker for electronic hours.' },
  { id: 'status.sessionAfterHours', family: 'status', kind: 'color', description: 'The session status marker for after-hours.' },
  { id: 'status.sessionClosed', family: 'status', kind: 'color', description: 'The session status marker while the market is closed.' },

  // ── drawing: what a new drawing wears before a user styles it ───────────────────────────────
  { id: 'drawing.line', family: 'drawing', kind: 'color', description: 'The stroke of a newly placed drawing.' },
  { id: 'drawing.fill', family: 'drawing', kind: 'color', description: 'The fill of a newly placed drawing that has an area.' },
  { id: 'drawing.text', family: 'drawing', kind: 'color', description: 'The ink of a drawing label.' },
  { id: 'drawing.handle', family: 'drawing', kind: 'color', description: 'The center of a drawing selection handle.' },
  { id: 'drawing.selected', family: 'drawing', kind: 'color', description: 'The highlight of a selected drawing and its handles.' },

  // ── motion ──────────────────────────────────────────────────────────────────────────────────
  { id: 'motion.durationFast', family: 'motion', kind: 'duration', description: 'A state change the reader should not have to wait for, such as a hover.' },
  { id: 'motion.durationBase', family: 'motion', kind: 'duration', description: 'An ordinary transition, such as a menu opening.' },
] as const satisfies readonly ThemeRole[]

/** Every role id in the inventory. */
export type ThemeRoleId = (typeof THEME_ROLES)[number]['id']

/** One resolved mode: every role, concrete. Values are CSS tokens, so a length is `'4px'` and a
 *  duration is `'150ms'`. */
export type SemanticTheme = { readonly [Id in ThemeRoleId]: string }

/** What a host supplies: a partial palette for either mode, or both. An omitted role keeps the
 *  built-in value for that mode. */
export interface CustomThemes {
  light?: Partial<SemanticTheme>
  dark?: Partial<SemanticTheme>
}

/** The inventory keyed by id, for a lookup that does not scan. */
export const THEME_ROLE_BY_ID: Readonly<Record<string, ThemeRole>> = Object.freeze(
  Object.fromEntries(THEME_ROLES.map((role) => [role.id, role as ThemeRole])),
)

/** Every role id, sorted, which is the order the generated declarations use. */
export const THEME_ROLE_IDS: readonly string[] = Object.freeze(THEME_ROLES.map((r) => r.id).sort())

/** Whether a string names a role in the inventory. */
export function isThemeRoleId(id: string): id is ThemeRoleId {
  return Object.prototype.hasOwnProperty.call(THEME_ROLE_BY_ID, id)
}

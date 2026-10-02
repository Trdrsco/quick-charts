// The supported styling hooks: the class names a host may write a rule against, and what that rule
// may change.
//
// Every other class in the stylesheet is private implementation. A hook is a block-level surface,
// never a control inside one: a host restyles the toolbar's ground or moves the legend, and the
// chart keeps every control, state and behavior inside that surface as its own. The theme roles
// remain the door for color, type and radius; a hook is the door for the presentation around a
// surface that no role names, such as its spacing, border or placement inside the host's layout.
//
// Removing a hook, a state it publishes or a customization it allows is a breaking change. Adding
// one is minor. This module has no import, so the build script reads it under Node directly.

/** How a hook's state is announced: an attribute a host selector may read, never a class. */
export interface StyleHookState {
  attribute: string
  description: string
}

/** One supported hook. */
export interface StyleHook {
  /** The class name, without the dot. */
  className: string
  /** What the element is. */
  purpose: string
  /** The states the element announces through attributes. */
  states: readonly StyleHookState[]
  /** The presentation a host rule may change on it. Anything else is unsupported. */
  customization: readonly string[]
}

export const STYLE_HOOKS = [
  {
    className: 'qc-topbar',
    purpose: 'The top toolbar: symbol search, timeframe, chart style, indicators, layouts, replay and the widget menus.',
    states: [],
    customization: ['background-color', 'border', 'padding', 'gap', 'box-shadow'],
  },
  {
    className: 'qc-drawing-toolbar',
    purpose: 'The drawing toolbar beside the plot.',
    states: [{ attribute: 'aria-orientation', description: 'vertical beside the plot, horizontal in a host row.' }],
    customization: ['background-color', 'border', 'padding', 'gap', 'box-shadow'],
  },
  {
    className: 'qc-bottombar',
    purpose: 'The bottom bar: range shortcuts, the session clock and the timezone.',
    states: [],
    customization: ['background-color', 'border', 'padding', 'gap', 'box-shadow'],
  },
  {
    className: 'qc-legend',
    purpose: 'The legend over the plot: the symbol, its reading and each indicator row.',
    states: [],
    customization: ['background-color', 'border', 'border-radius', 'padding', 'box-shadow', 'inset'],
  },
  {
    className: 'qc-menu-panel',
    purpose: 'A floating menu opened from a toolbar control.',
    states: [{ attribute: 'hidden', description: 'present while the menu is closed.' }],
    customization: ['background-color', 'border', 'border-radius', 'padding', 'box-shadow'],
  },
  {
    className: 'qc-dialog',
    purpose: 'A modal dialog: settings, search, layouts and the drawing editors.',
    states: [{ attribute: 'data-role', description: 'which dialog this is, in the chart\'s own vocabulary.' }],
    customization: ['background-color', 'border', 'border-radius', 'padding', 'box-shadow', 'max-width'],
  },
] as const satisfies readonly StyleHook[]

/** Every hook class name. */
export const STYLE_HOOK_CLASSES: readonly string[] = STYLE_HOOKS.map((hook) => hook.className)

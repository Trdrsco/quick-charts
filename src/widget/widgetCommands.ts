// The widget-scoped built-ins: theme, language, fullscreen, image, and the layout's own verbs.
//
// They are commands for the same reason the chart's verbs are: a host toolbar, a keyboard binding
// and an operator adapter should reach them the same way, and the access policy should be able to
// refuse them once rather than at each door. The layout's save, rename, open, delete and detach are
// here too, so a saved-layouts menu is a consumer of the registry like any other surface, and a
// policy that forbids layout writes forbids them from every door.
import type { ChartI18n } from '../i18n'
import type { ResourceRef } from '../resources'
import type { ResourceRemoveOutcome } from '../openResource'
import { THEME_MODES, type ThemeMode } from '../theme/schema'
import type { ThemeController } from '../theme/controller'
import type { CommandRegistry, CommandSpec } from './commands'
import type { Emitter, WidgetEvents } from './events'
import type { Capabilities } from './options'
import type { LayoutSyncFlags } from './layout'
import type { LayoutChanges } from './layoutChanges'
import type { ChartWidget } from './create'
import type { OfferedLayouts } from './arrangements'

/** The viewer's layout autosave switch, read by the commands and shown by the chrome. */
export interface AutosavePreference {
  get(): boolean
  set(on: boolean): void
}

export interface WidgetCommandDeps {
  commands: CommandRegistry
  widget: ChartWidget
  theme: ThemeController
  i18n: ChartI18n
  capabilities(): Capabilities
  canSaveLayout(): boolean
  /** The layout's private maximize toggle, over its active tile. */
  toggleMaximize(): void
  /** The arrangements and sync switches the widget offers. */
  layouts: OfferedLayouts
  /** Start a new layout from one chart's content, on the arrangement the widget opens a one-chart
   *  layout on. */
  startLayout(content: string): void
  /** Ask a never-saved layout's name in the chrome's name dialog. False when no chrome took it, which
   *  leaves the save a no-op rather than a nameless write. */
  nameLayout(): boolean
  /** Raise the chrome's Layouts dialog. False when no chrome took it. */
  openLayouts(): boolean
  /** The layout owner's conditional removal, also used for a browser row that is not open. */
  removeLayout(ref: ResourceRef): Promise<ResourceRemoveOutcome>
  autosave: AutosavePreference
  /** Whether the open layout holds unwritten changes, and the autosave that writes them. */
  layoutChanges: LayoutChanges
  /** The widget's event emitter: a layout or image verb reports its outcome through it. */
  events: Emitter<WidgetEvents>
}

/** Register every widget-scoped built-in. Returns one unregister for all of them. */
export function registerWidgetCommands(deps: WidgetCommandDeps): () => void {
  const { commands, widget, theme, events } = deps
  const unregisters: (() => void)[] = []
  const add = (spec: CommandSpec): void => {
    unregisters.push(commands.register(spec))
  }
  const always = (): boolean => true

  // ── Theme. One command per built-in mode, plus the toggle a shortcut usually wants. ──────────
  for (const mode of THEME_MODES) {
    add({
      id: `widget.theme.${mode}`,
      scope: 'widget',
      label: mode === 'light' ? 'command.themeLight' : 'command.themeDark',
      available: () => theme.mode() !== mode,
      execute: () => theme.setMode(mode),
    })
  }
  add({
    id: 'widget.theme.toggle',
    scope: 'widget',
    label: 'command.themeToggle',
    available: always,
    execute: () => theme.setMode(theme.mode() === 'dark' ? 'light' : 'dark'),
  })
  add({
    id: 'widget.theme.set',
    scope: 'widget',
    label: 'command.themeSet',
    available: always,
    execute: (arg) => {
      if ((THEME_MODES as readonly string[]).includes(String(arg))) theme.setMode(arg as ThemeMode)
    },
  })

  // ── Language ────────────────────────────────────────────────────────────────────────────────
  add({
    id: 'widget.locale.set',
    scope: 'widget',
    label: 'command.localeSet',
    available: always,
    execute: (arg) => {
      if (typeof arg === 'string' && arg) void widget.setLocale(arg)
    },
  })

  // ── Chart-root fullscreen. Availability is the browser's answer, not a preference. ───────────
  add({
    id: 'widget.fullscreen.enter',
    scope: 'widget',
    label: 'command.fullscreenEnter',
    available: () => deps.capabilities().fullscreen && !widget.fullscreen.active(),
    execute: () => widget.fullscreen.enter(),
  })
  add({
    id: 'widget.fullscreen.exit',
    scope: 'widget',
    label: 'command.fullscreenExit',
    available: () => widget.fullscreen.active(),
    execute: () => widget.fullscreen.exit(),
  })
  add({
    id: 'widget.fullscreen.toggle',
    scope: 'widget',
    label: 'command.fullscreenToggle',
    shortcut: 'KeyF',
    available: () => deps.capabilities().fullscreen,
    execute: () => widget.fullscreen.toggle(),
  })

  // ── Client image. Copy is capability-gated on the clipboard; download always works. ──────────
  add({
    id: 'widget.image.capture',
    scope: 'widget',
    label: 'command.imageCapture',
    available: always,
    // The blob goes to whoever called `widget.image.capture()` directly; a command answers whether
    // it ran, not what it produced, so the capture here is a warm-up rather than a delivery.
    execute: () => void widget.image.capture(),
  })
  add({
    id: 'widget.image.download',
    scope: 'widget',
    label: 'command.imageDownload',
    available: always,
    execute: (arg) => widget.image.download(typeof arg === 'string' ? arg : undefined),
  })
  add({
    id: 'widget.image.copy',
    scope: 'widget',
    label: 'command.imageCopy',
    available: () => deps.capabilities().imageCopy,
    // A command answers whether it ran, not whether the browser took the image, so the outcome
    // reports through the `image` event: a refused copy falls back to a download and says so.
    execute: () =>
      widget.image
        .copy()
        .then(async (copied) => {
          if (copied) {
            events.emit('image', { kind: 'copied' })
            return
          }
          events.emit('image', { kind: 'copyFallback' })
          await widget.image.download()
        })
        .catch(() => events.emit('image', { kind: 'failed' })),
  })

  // ── Layout ──────────────────────────────────────────────────────────────────────────────────
  add({
    id: 'widget.layout.setActive',
    scope: 'widget',
    label: 'command.layoutActive',
    available: () => widget.charts().length > 1,
    execute: (arg) => {
      if (typeof arg === 'number') widget.layout.setActive(arg)
    },
  })
  // A sync flag is a standing preference for the layout, not an action on the charts open right
  // now: setting it while one chart is up is what decides how the next split behaves. Gating it on
  // a split already existing would leave every switch dead in the state a viewer is usually in. It
  // is unavailable only where the widget offers no switch to change.
  add({
    id: 'widget.layout.setSync',
    scope: 'widget',
    label: 'command.layoutSync',
    available: () => deps.layouts.sync.length > 0,
    execute: (arg) => {
      if (arg && typeof arg === 'object') widget.layout.setSync(arg as Partial<LayoutSyncFlags>)
    },
  })
  const split = (): boolean => widget.charts().length > 1
  const step = (delta: number): void => {
    const count = widget.charts().length
    if (count < 2) return
    widget.layout.setActive((widget.layout.active() + count + delta) % count)
  }
  add({
    id: 'widget.layout.activateNext',
    scope: 'widget',
    label: 'command.layoutActivateNext',
    shortcut: 'Tab',
    available: split,
    execute: () => step(1),
  })
  add({
    id: 'widget.layout.activatePrevious',
    scope: 'widget',
    label: 'command.layoutActivatePrevious',
    shortcut: 'Shift+Tab',
    available: split,
    execute: () => step(-1),
  })
  // The active tile fills the layout, or gives it back. One toggle, so the on-chart control, the
  // Alt gesture and the Alt+Enter chord are the same verb, and a single chart has nothing to fill.
  add({
    id: 'widget.layout.toggleMaximize',
    scope: 'widget',
    label: 'command.layoutMaximize',
    shortcut: 'Alt+Enter',
    available: split,
    execute: () => deps.toggleMaximize(),
  })
  // A widget that offers one arrangement has none to change to. An arrangement it does not offer is
  // ignored, as the layout's own setter ignores it.
  add({
    id: 'widget.layout.setArrangement',
    scope: 'widget',
    label: 'command.layoutArrangement',
    available: () => deps.layouts.arrangements.length > 1,
    execute: (arg) => {
      if (typeof arg === 'string' && arg) widget.layout.setArrangement(arg)
    },
  })

  // The layout owner publishes commits and refusals for API and command callers alike.
  const layouts = (): boolean => deps.capabilities().saveLoad.layouts
  const current = (): { ref: ResourceRef; name: string } | null => widget.layout.saveLoad.current()

  /** The ONE naming-and-saving controller every door runs through: the menu's Save row, the name
   *  dialog's verb, the autosave, a host call and the Ctrl/Cmd+S shortcut. A never-saved layout with
   *  no name given cannot be written, so it asks the name in the chrome's dialog instead of writing
   *  under a name nobody chose.
   *
   *  A write already on its way is not started again. Two presses in a row are one intent, and a
   *  second update of the same revision would either duplicate the write or lose to its own
   *  conflict; every door shares this guard because every door is this function. */
  let pending: { key: string; done: Promise<void> } | null = null
  const save = async (name: string | undefined, asNew: boolean): Promise<void> => {
    const target = name ?? current()?.name
    if (!target) {
      deps.nameLayout()
      return
    }
    const key = `${asNew ? 'copy' : 'update'}:${target}`
    if (pending?.key === key) return pending.done
    const done = widget.layout.saveLoad.save(target, { asNew }).then(() => undefined)
    const mine = { key, done }
    pending = mine
    try {
      await done
    } finally {
      if (pending === mine) pending = null
    }
  }
  add({
    id: 'widget.layout.save',
    scope: 'widget',
    label: 'command.layoutSave',
    // Ctrl+S, and Cmd+S on a Mac keyboard, which the dispatcher reads as the same chord. Bound on
    // the chart's own root, so a host IDE's save outside the chart is left alone.
    shortcut: 'Ctrl+KeyS',
    available: () => layouts() && deps.canSaveLayout(),
    execute: (arg) => {
      if (typeof arg === 'string') return save(arg, false)
      const at = arg as { name?: unknown; asNew?: unknown } | null | undefined
      return save(typeof at?.name === 'string' ? at.name : undefined, at?.asNew === true)
    },
  })
  add({
    id: 'widget.layout.rename',
    scope: 'widget',
    label: 'command.layoutRename',
    available: () => layouts() && deps.canSaveLayout() && current() !== null,
    execute: (arg) => (typeof arg === 'string' && arg ? save(arg, false) : undefined),
  })
  add({
    id: 'widget.layout.load',
    scope: 'widget',
    label: 'command.layoutLoad',
    available: layouts,
    execute: async (arg) => {
      if (typeof arg !== 'string' || !arg) return
      await widget.layout.saveLoad.load(arg)
    },
  })
  // The Open-layout dialog, from its menu row and from the period key. It lists what the store
  // holds, so a host that saves no layouts has nothing to open.
  add({
    id: 'widget.layout.open',
    scope: 'widget',
    label: 'command.layoutOpen',
    shortcut: 'Period',
    available: layouts,
    execute: () => {
      deps.openLayouts()
    },
  })
  add({
    id: 'widget.layout.delete',
    scope: 'widget',
    label: 'command.layoutDelete',
    available: layouts,
    execute: async (arg) => {
      const ref = arg as { id?: unknown; revision?: unknown } | null | undefined
      if (typeof ref?.id !== 'string' || typeof ref.revision !== 'string') return
      // Conditional on the revision the caller saw: a layout saved elsewhere since is refused rather
      // than deleted under someone.
      await deps.removeLayout({ id: ref.id, revision: ref.revision })
    },
  })
  /** A new layout by the name it is given: one chart on the market and interval the active chart
   *  shows, with none of the open layout's studies, comparisons, authored look or extension state,
   *  saved as a layout of its own. Drawings kept beside the chart in their own documents stay with
   *  their market; drawings kept in the chart's content start empty. The binding detaches FIRST, so
   *  nothing written to the tiles on the way can land on the layout that was open. Where the widget
   *  does not offer the single chart, the layout opens on the arrangement a one-chart layout falls
   *  back to, its other panes cloning the new chart. */
  const create = async (name: string): Promise<void> => {
    const content = JSON.parse(widget.activeChart().saveLoad.serialize().content) as Record<string, unknown>
    const fresh = JSON.stringify({ ...content, indicators: [], compares: [], appearance: {}, ext: {}, ...('drawings' in content ? { drawings: [] } : {}) })
    widget.layout.saveLoad.detach()
    deps.startLayout(fresh)
    await save(name, true)
  }
  add({
    id: 'widget.layout.create',
    scope: 'widget',
    label: 'command.layoutCreate',
    available: () => layouts() && deps.canSaveLayout(),
    execute: (arg) => (typeof arg === 'string' && arg.trim() ? create(arg.trim()) : undefined),
  })
  add({
    id: 'widget.layout.autosave',
    scope: 'widget',
    label: 'command.layoutAutosave',
    available: layouts,
    execute: (arg) => {
      if (typeof arg !== 'boolean') return
      deps.autosave.set(arg)
      // Switching it on catches a dirty layout up, from whichever door switched it.
      if (arg) deps.layoutChanges.catchUp()
    },
  })

  return () => {
    for (const unregister of unregisters) unregister()
    unregisters.length = 0
  }
}

// The widget-scoped built-ins: theme, language, fullscreen, image, and the layout's own verbs.
//
// They are commands for the same reason the chart's verbs are: a host toolbar, a keyboard binding
// and an operator adapter should reach them the same way, and the access policy should be able to
// refuse them once rather than at each door. The layout's save, rename, open, delete and detach are
// here too, so a saved-layouts menu is a consumer of the registry like any other surface, and a
// policy that forbids layout writes forbids them from every door.
import type { ChartI18n } from '../i18n'
import type { ChartSaveLoadAdapter, ResourceRef } from '../resources'
import { THEME_MODES, type ThemeMode } from '../theme/schema'
import type { ThemeController } from '../theme/controller'
import type { CommandRegistry, CommandSpec } from './commands'
import type { Emitter, WidgetEvents } from './events'
import type { Capabilities } from './options'
import type { LayoutSyncFlags } from './layout'
import type { ChartWidget } from './create'

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
  /** The host's saved-resource adapter, for the layouts family a delete reaches. */
  saveLoad: ChartSaveLoadAdapter | null
  autosave: AutosavePreference
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
  add({
    id: 'widget.layout.setSync',
    scope: 'widget',
    label: 'command.layoutSync',
    available: () => widget.charts().length > 1,
    execute: (arg) => {
      if (arg && typeof arg === 'object') widget.layout.setSync(arg as Partial<LayoutSyncFlags>)
    },
  })
  add({
    id: 'widget.layout.setArrangement',
    scope: 'widget',
    label: 'command.layoutArrangement',
    available: always,
    execute: (arg) => {
      if (typeof arg === 'string' && arg) widget.layout.setArrangement(arg)
    },
  })

  // ── The saved layout. Every verb reports through the event maps: `layout` for what it did,
  // `saveConflict` for a refusal, because a command answers whether it started, not how it ended.
  const layouts = (): boolean => deps.capabilities().saveLoad.layouts
  const current = (): { ref: ResourceRef; name: string } | null => widget.layout.saveLoad.current()
  const refuse = (currentRef: ResourceRef | null, message: string): void => events.emit('saveConflict', { family: 'layout', current: currentRef, message })

  /** Save under a name: an update of the open layout at its revision, or a create for a new name or
   *  a copy. A never-saved layout with no name given cannot be saved, and answers nothing. */
  const save = async (name: string | undefined, asNew: boolean): Promise<void> => {
    const target = name ?? current()?.name
    if (!target) return
    const outcome = await widget.layout.saveLoad.save(target, { asNew })
    if (outcome.kind === 'ok') events.emit('layout', { kind: 'saved', id: outcome.ref.id, name: target })
    else refuse(outcome.kind === 'conflict' ? outcome.current : null, outcome.message)
  }
  add({
    id: 'widget.layout.save',
    scope: 'widget',
    label: 'command.layoutSave',
    available: layouts,
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
    available: () => layouts() && current() !== null,
    execute: (arg) => (typeof arg === 'string' && arg ? save(arg, false) : undefined),
  })
  add({
    id: 'widget.layout.load',
    scope: 'widget',
    label: 'command.layoutLoad',
    available: layouts,
    execute: async (arg) => {
      if (typeof arg !== 'string' || !arg) return
      const outcome = await widget.layout.saveLoad.load(arg)
      if (outcome.kind === 'ok') events.emit('layout', { kind: 'loaded', id: outcome.ref.id, name: outcome.body.name })
      else refuse(null, outcome.message)
    },
  })
  add({
    id: 'widget.layout.delete',
    scope: 'widget',
    label: 'command.layoutDelete',
    available: layouts,
    execute: async (arg) => {
      const store = deps.saveLoad?.layouts
      const ref = arg as { id?: unknown; revision?: unknown } | null | undefined
      if (!store || typeof ref?.id !== 'string' || typeof ref.revision !== 'string') return
      // Conditional on the revision the caller saw: a layout saved elsewhere since is refused rather
      // than deleted under someone.
      const outcome = await store.remove({ id: ref.id, revision: ref.revision })
      if (outcome.kind === 'ok') {
        if (current()?.ref.id === ref.id) widget.layout.saveLoad.detach()
        events.emit('layout', { kind: 'removed', id: ref.id, name: null })
      } else refuse(outcome.kind === 'conflict' ? outcome.current : null, deps.i18n.t(outcome.kind === 'conflict' ? 'host.saveConflict' : 'host.saveNotFound'))
    },
  })
  add({
    id: 'widget.layout.detach',
    scope: 'widget',
    label: 'command.layoutDetach',
    available: () => current() !== null,
    execute: () => {
      widget.layout.saveLoad.detach()
      events.emit('layout', { kind: 'detached', id: null, name: null })
    },
  })
  add({
    id: 'widget.layout.autosave',
    scope: 'widget',
    label: 'command.layoutAutosave',
    available: layouts,
    execute: (arg) => {
      if (typeof arg === 'boolean') deps.autosave.set(arg)
    },
  })

  return () => {
    for (const unregister of unregisters) unregister()
    unregisters.length = 0
  }
}

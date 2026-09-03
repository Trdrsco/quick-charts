// The widget-scoped built-ins: theme, language, fullscreen and image.
//
// They are commands for the same reason the chart's verbs are: a host toolbar, a keyboard binding
// and an operator adapter should reach them the same way, and the access policy should be able to
// refuse them once rather than at each door.
import type { ChartI18n } from '../i18n'
import { THEME_MODES, type ThemeMode } from '../theme/schema'
import type { ThemeController } from '../theme/controller'
import type { CommandRegistry, CommandSpec } from './commands'
import type { Capabilities } from './options'
import type { LayoutSyncFlags } from './layout'
import type { ChartWidget } from './create'

export interface WidgetCommandDeps {
  commands: CommandRegistry
  widget: ChartWidget
  theme: ThemeController
  i18n: ChartI18n
  capabilities(): Capabilities
}

/** Register every widget-scoped built-in. Returns one unregister for all of them. */
export function registerWidgetCommands(deps: WidgetCommandDeps): () => void {
  const { commands, widget, theme } = deps
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
    execute: () => void widget.image.copy(),
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

  return () => {
    for (const unregister of unregisters) unregister()
    unregisters.length = 0
  }
}

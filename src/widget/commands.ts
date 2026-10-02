// The command registry: the one place a Quick Charts verb exists.
//
// Every built-in action the widget can take is registered here, and so is every action a host
// extension contributes. The context menu, the keyboard, a host's own toolbar and an automation
// adapter all read this list and run through this `execute`, so a command hidden by feature
// configuration or refused by access policy cannot be reached from any of them: it answers
// `denied` whichever door was used. There is no second path to a verb.
//
// Availability is computed, never stored. A spec's `available()` reads the live chart, and the
// registry layers the access policy over it, so a registry answer is true at the moment it is
// asked rather than at the moment something was registered.
import type { ChartMessageKey } from '../i18n'
import type { AccessPolicy } from './options'
import { commandPermitted } from './access'

/** Which handle a command acts on: the widget as a whole, or the active chart. */
export type CommandScope = 'widget' | 'chart'

/** One command. */
export interface CommandSpec {
  /** The stable public id, e.g. `chart.style.candles`. */
  id: string
  scope: CommandScope
  /** The catalog key the chart's own chrome labels the command with. */
  label: ChartMessageKey
  /** Literal text that wins over `label`. A host contribution names itself in its own words and
   *  owns its own translations, so it does not point at the chart's catalog. */
  labelText?: string
  /** The default shortcut, in `KeyboardEvent` terms (e.g. `Alt+KeyR`). */
  shortcut?: string
  /** Whether the command can run right now, from capability and chart state. */
  available(): boolean
  /** Whether the access policy refuses this argument, for a command whose one id spans many
   *  subjects (the tool to arm). A refused argument answers `denied`, as a refused id does. */
  refuses?(arg: unknown): boolean
  execute(arg?: unknown): void | Promise<void>
}

/** What running a command answers. A refusal is a value, never a throw: a menu row, a shortcut and
 *  an automation adapter all need to tell "nothing by that name" from "not allowed" without a try
 *  block. */
export type CommandResult =
  | { kind: 'ok' }
  | { kind: 'unavailable' }
  | { kind: 'denied' }
  | { kind: 'unknown' }
  | { kind: 'failed'; error: unknown }

/** The widget's command surface. */
export interface CommandRegistry {
  /** Add a command. Returns its unregister. A second registration of an id replaces the first,
   *  which is what lets a chart re-register its own verbs when its active handle changes. */
  register(spec: CommandSpec): () => void
  /** Every registered command, in registration order. Unavailable and denied commands are listed:
   *  a menu decides whether to draw a disabled row, and hiding one would leave the host guessing. */
  list(): readonly CommandSpec[]
  /** Whether `execute` would run this command right now. */
  available(id: string): boolean
  execute(id: string, arg?: unknown): CommandResult
  /** Remap a shortcut, or clear it with null. */
  setShortcut(id: string, shortcut: string | null): void
  /** Fires when the registered set or a shortcut changes, and when the host says its access policy
   *  may answer differently (`widget.refreshAccess()`), since what `available` answers may have
   *  moved with it. Returns the unsubscribe. */
  onChange(cb: () => void): () => void
}

/** The part of a command registry a package-owned control needs to judge and run an intent. Chart
 *  scopes keep one of these privately so an origin-bound control can address its chart even while
 *  another chart is active, without publishing a second command registry. */
export type CommandExecutor = Pick<CommandRegistry, 'available' | 'execute'>

/** What the registry needs from the planes around it. */
export interface CommandRegistryOptions {
  /** The host's access policy. A command the policy refuses answers `denied` and never runs. */
  access?: AccessPolicy
}

/** The registry plus the widget's own handle on it. `dispose` empties it and closes it: a held
 *  reference can then list nothing and run nothing, which is what makes a disposed widget inert
 *  rather than dangerous. */
export interface CommandRegistryHandle {
  registry: CommandRegistry
  /** Tell every listener that availability may have moved with nothing registered or remapped:
   *  the access policy answering differently. */
  changed(): void
  dispose(): void
}

/** One chart's registrations, including extension contributions. Only the active chart publishes
 *  chart-scoped specs to the shared registry; widget-scoped contributions keep shared behavior. */
export function createChartCommandScope(shared: CommandRegistry, options?: CommandRegistryOptions) {
  const entries = new Map<string, { spec: CommandSpec; off?: () => void }>()
  let active = false
  const deactivate = (): void => {
    active = false
    for (const entry of entries.values()) {
      entry.off?.()
      entry.off = undefined
    }
  }
  const registry: CommandRegistry = {
    ...shared,
    register(spec) {
      if (spec.scope !== 'chart') return shared.register(spec)
      entries.get(spec.id)?.off?.()
      const entry: { spec: CommandSpec; off?: () => void } = { spec }
      entries.set(spec.id, entry)
      if (active) entry.off = shared.register(spec)
      return () => {
        if (entries.get(spec.id) !== entry) return
        entry.off?.()
        entries.delete(spec.id)
      }
    },
  }
  const target: CommandExecutor = {
    available(id) {
      const spec = entries.get(id)?.spec
      return spec ? commandAvailable(spec, options?.access) : false
    },
    execute(id, arg) {
      const spec = entries.get(id)?.spec
      return spec ? executeCommand(spec, options?.access, arg) : { kind: 'unknown' }
    },
  }
  return {
    registry,
    target,
    activate() {
      if (active) return
      active = true
      for (const entry of entries.values()) entry.off = shared.register(entry.spec)
    },
    deactivate,
    dispose() {
      deactivate()
      entries.clear()
    },
  }
}

export function createCommandRegistry(options?: CommandRegistryOptions): CommandRegistryHandle {
  const specs = new Map<string, CommandSpec>()
  const registrations = new Map<string, symbol>()
  const shortcuts = new Map<string, string | null>()
  const listeners = new Set<() => void>()
  const access = options?.access
  let disposed = false

  const notify = (): void => {
    for (const cb of [...listeners]) cb()
  }
  const registry: CommandRegistry = {
    register(spec) {
      if (disposed) return () => undefined
      const registration = Symbol(spec.id)
      registrations.set(spec.id, registration)
      const shortcut = shortcuts.get(spec.id)
      specs.set(spec.id, shortcuts.has(spec.id) ? { ...spec, shortcut: shortcut ?? undefined } : spec)
      notify()
      return () => {
        if (registrations.get(spec.id) === registration) {
          registrations.delete(spec.id)
          specs.delete(spec.id)
          notify()
        }
      }
    },
    list: () => [...specs.values()],
    available(id) {
      const spec = specs.get(id)
      return spec ? commandAvailable(spec, access) : false
    },
    execute(id, arg) {
      const spec = specs.get(id)
      if (!spec) return { kind: 'unknown' }
      return executeCommand(spec, access, arg)
    },
    setShortcut(id, shortcut) {
      const spec = specs.get(id)
      if (!spec) return
      shortcuts.set(id, shortcut)
      specs.set(id, shortcut === null ? { ...spec, shortcut: undefined } : { ...spec, shortcut })
      notify()
    },
    onChange(cb) {
      listeners.add(cb)
      return () => {
        listeners.delete(cb)
      }
    },
  }

  return {
    registry,
    changed() {
      if (!disposed) notify()
    },
    dispose() {
      disposed = true
      specs.clear()
      registrations.clear()
      shortcuts.clear()
      listeners.clear()
    },
  }
}

// A command the policy refuses is denied wherever it is reached from.
function commandAvailable(spec: CommandSpec, access: AccessPolicy | undefined): boolean {
  if (!commandPermitted(access, spec.id)) return false
  try {
    return spec.available()
  } catch {
    return false
  }
}

function executeCommand(spec: CommandSpec, access: AccessPolicy | undefined, arg?: unknown): CommandResult {
  if (!commandPermitted(access, spec.id)) return { kind: 'denied' }
  try {
    if (spec.refuses?.(arg)) return { kind: 'denied' }
  } catch {
    return { kind: 'denied' }
  }
  let ready: boolean
  try {
    ready = spec.available()
  } catch (error) {
    return { kind: 'failed', error }
  }
  if (!ready) return { kind: 'unavailable' }
  try {
    const outcome = spec.execute(arg)
    // An async command reports the start it made; a rejection later is the host's to observe
    // through the promise it did not receive, so the rejection is swallowed rather than left
    // unhandled on the page.
    if (outcome && typeof (outcome as Promise<void>).catch === 'function') void (outcome as Promise<void>).catch(() => undefined)
    return { kind: 'ok' }
  } catch (error) {
    return { kind: 'failed', error }
  }
}

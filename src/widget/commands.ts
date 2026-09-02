// The command registry: the one place a Quick Charts verb exists.
//
// Every built-in action the widget can take is registered here, and so is every action a host
// extension contributes. The context menu, the keyboard, a host's own toolbar and an operator
// adapter all read this list and run through this `execute`, so a command hidden by feature
// configuration or refused by access policy cannot be reached from any of them: it answers
// `denied` whichever door was used. There is no second path to a verb.
//
// Availability is computed, never stored. A spec's `available()` reads the live chart, and the
// registry layers the access policy over it, so a registry answer is true at the moment it is
// asked rather than at the moment something was registered.
import type { ChartMessageKey } from '../i18n'
import type { AccessPolicy } from './options'

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
  execute(arg?: unknown): void | Promise<void>
}

/** What running a command answers. A refusal is a value, never a throw: a menu row, a shortcut and
 *  an operator all need to tell "nothing by that name" from "not allowed" without a try block. */
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
  /** Fires when the registered set or a shortcut changes. Returns the unsubscribe. */
  onChange(cb: () => void): () => void
}

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
  dispose(): void
}

export function createCommandRegistry(options?: CommandRegistryOptions): CommandRegistryHandle {
  const specs = new Map<string, CommandSpec>()
  const listeners = new Set<() => void>()
  const allow = options?.access?.command
  let disposed = false

  const notify = (): void => {
    for (const cb of [...listeners]) cb()
  }
  /** A command the policy refuses is denied wherever it is reached from. */
  const permitted = (id: string): boolean => {
    if (!allow) return true
    try {
      return allow(id) !== false
    } catch {
      return false // a policy that throws refuses; the chart never guesses in the host's favor
    }
  }

  const registry: CommandRegistry = {
    register(spec) {
      if (disposed) return () => undefined
      specs.set(spec.id, spec)
      notify()
      return () => {
        if (specs.get(spec.id) === spec) {
          specs.delete(spec.id)
          notify()
        }
      }
    },
    list: () => [...specs.values()],
    available(id) {
      const spec = specs.get(id)
      if (!spec || !permitted(id)) return false
      try {
        return spec.available()
      } catch {
        return false
      }
    },
    execute(id, arg) {
      const spec = specs.get(id)
      if (!spec) return { kind: 'unknown' }
      if (!permitted(id)) return { kind: 'denied' }
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
    },
    setShortcut(id, shortcut) {
      const spec = specs.get(id)
      if (!spec) return
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
    dispose() {
      disposed = true
      specs.clear()
      listeners.clear()
    },
  }
}

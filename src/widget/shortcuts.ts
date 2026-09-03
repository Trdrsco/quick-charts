// The keyboard: one dispatcher that resolves a key press to a command and runs it through the
// registry.
//
// This is what makes `CommandSpec.shortcut` and `setShortcut` mean something. A key does not reach
// a verb directly; it resolves to a command id and goes through the same `execute` a menu row uses,
// so the access policy and the feature flags gate the keyboard exactly as they gate the glass. A
// shortcut on a command that is unavailable or denied does nothing, and the key is left for the
// page.
//
// Shortcuts are written in `KeyboardEvent.code` terms with optional modifiers, e.g. `Alt+KeyR`,
// `Shift+ArrowLeft`, `Delete`. Codes rather than `key` values, so a shortcut means the same
// physical key on every keyboard layout.
import type { CommandRegistry } from './commands'

/** The modifiers a shortcut may name, in the order they are written. */
const MODIFIERS = ['Ctrl', 'Meta', 'Alt', 'Shift'] as const

/** Normalize one shortcut into a comparable token: modifiers in a fixed order, then the code. A
 *  shortcut a host writes as `Shift+Alt+KeyR` and one written `Alt+Shift+KeyR` are the same key. */
export function normalizeShortcut(shortcut: string): string | null {
  const parts = shortcut
    .split('+')
    .map((p) => p.trim())
    .filter(Boolean)
  const code = parts.pop()
  if (!code) return null
  const held = new Set(parts.map((p) => p.toLowerCase()))
  const prefix = MODIFIERS.filter((m) => held.has(m.toLowerCase()))
  // A modifier this dispatcher does not know is a shortcut it cannot honor; refusing it is better
  // than binding the key to something the host did not ask for.
  if (prefix.length !== parts.length) return null
  return [...prefix, code].join('+')
}

/** The token one key press resolves to. */
export function eventShortcut(event: KeyboardEvent): string {
  const prefix: string[] = []
  if (event.ctrlKey) prefix.push('Ctrl')
  if (event.metaKey) prefix.push('Meta')
  if (event.altKey) prefix.push('Alt')
  if (event.shiftKey) prefix.push('Shift')
  return [...prefix, event.code].join('+')
}

/** Whether the press belongs to something the viewer is typing into. A chart must never swallow a
 *  key aimed at a text field, including one inside its own chrome. */
function typing(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el || typeof el.tagName !== 'string') return false
  const tag = el.tagName.toUpperCase()
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true
}

export interface ShortcutsHandle {
  dispose(): void
}

export interface ShortcutsDeps {
  /** The element the listener binds to. The chart's own root, never the page: an embedded chart
   *  must not swallow the host's keys. */
  root: HTMLElement
  commands: CommandRegistry
}

/** Bind the keyboard to the registry. */
export function attachShortcuts(deps: ShortcutsDeps): ShortcutsHandle {
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.defaultPrevented || typing(event.target)) return
    const pressed = eventShortcut(event)
    // Later registrations win, which is what lets a host remap a built-in with `setShortcut`.
    let match: string | null = null
    for (const spec of deps.commands.list()) {
      if (!spec.shortcut) continue
      if (normalizeShortcut(spec.shortcut) === pressed) match = spec.id
    }
    if (match === null) return
    const outcome = deps.commands.execute(match)
    // A refused or unavailable verb leaves the key alone: the press was not ours to consume, and
    // eating it would make a disabled command feel like a broken keyboard.
    if (outcome.kind === 'ok') event.preventDefault()
  }

  // The root is focusable so a click into the chart gives it the keyboard without stealing focus
  // from the page on load.
  if (!deps.root.hasAttribute('tabindex')) deps.root.tabIndex = -1
  deps.root.addEventListener('keydown', onKeyDown)
  return {
    dispose() {
      deps.root.removeEventListener('keydown', onKeyDown)
    },
  }
}

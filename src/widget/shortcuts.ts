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
  // A row printed for a reader writes its chord the way a reader says it ("Shift + T", "Alt + A").
  // The letter and the digit are the only two places that spelling differs from the physical code,
  // so they are the only two translated: everything else must already be a code.
  const physical = /^[A-Za-z]$/.test(code) ? `Key${code.toUpperCase()}` : /^[0-9]$/.test(code) ? `Digit${code}` : code
  const prefix = MODIFIERS.filter((m) => held.has(m.toLowerCase()))
  // A modifier this dispatcher does not know is a shortcut it cannot honor; refusing it is better
  // than binding the key to something the host did not ask for.
  if (prefix.length !== parts.length) return null
  return [...prefix, physical].join('+')
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

/** Whether the press belongs to something the viewer is typing into, or to a surface that has taken
 *  the room. A chart must never swallow a key aimed at a text field, including one inside its own
 *  chrome, and a modal that holds focus owns the keyboard until it closes. */
function blocked(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el || typeof el.tagName !== 'string') return false
  const tag = el.tagName.toUpperCase()
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true) return true
  return typeof el.closest === 'function' && el.closest('[role="dialog"], [aria-modal="true"]') !== null
}

/** Whether the press is the page's own focus traversal. Tab is the one key a chart may claim only
 *  when there is nothing inside it to traverse from: a viewer tabbing along the toolbar must reach
 *  the next button, so a shortcut bound to Tab answers only when the press comes from the chart
 *  surface itself rather than from something focusable in its chrome. */
function traversing(event: KeyboardEvent): boolean {
  if (event.code !== 'Tab') return false
  const el = event.target as HTMLElement | null
  if (!el || typeof el.closest !== 'function') return false
  return el.closest('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])') !== null
}

/** The tokens one press may resolve to, in the order they are tried. A Command chord on a Mac
 *  keyboard also answers the Ctrl spelling of the same chord: `Ctrl+KeyS` is how a shortcut is
 *  written once and meant on both platforms, and a host that deliberately wrote `Meta+` still wins
 *  because the exact token is tried first. */
export function pressedTokens(event: KeyboardEvent): readonly string[] {
  const exact = eventShortcut(event)
  if (!event.metaKey || event.ctrlKey) return [exact]
  return [exact, exact.replace('Meta+', 'Ctrl+')]
}

export interface ShortcutsHandle {
  dispose(): void
}

export interface ShortcutsDeps {
  /** The element the listener binds to. The chart's own root, never the page: an embedded chart
   *  must not swallow the host's keys. */
  root: HTMLElement
  commands: CommandRegistry
  /** The contributed half of the keyboard: a press no built-in command claims is offered to the
   *  rows extensions contribute for the level under the POINTER, which is the only place a
   *  contributed action has a price to act on. Answers whether a row ran. */
  contributions?(pressed: string): boolean
}

/** Bind the keyboard to the registry. */
export function attachShortcuts(deps: ShortcutsDeps): ShortcutsHandle {
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.defaultPrevented || blocked(event.target) || traversing(event)) return
    const wanted = pressedTokens(event)
    // Later registrations win, which is what lets a host remap a built-in with `setShortcut`.
    let match: string | null = null
    for (const spec of deps.commands.list()) {
      if (!spec.shortcut) continue
      const token = normalizeShortcut(spec.shortcut)
      if (token !== null && wanted.includes(token)) match = spec.id
    }
    if (match === null) {
      // The chart's own verbs are asked first, so a host contribution can never shadow a built-in
      // key. What is left over reaches the contributed rows at the pointer's level.
      // A contribution is offered each spelling the press answers to, Cmd chords as their Ctrl twin.
      if (wanted.some((token) => deps.contributions?.(token) === true)) event.preventDefault()
      return
    }
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

/** A viewport point, as the last pointer move reported it. */
export interface ShortcutPoint {
  clientX: number
  clientY: number
}

/** One tiled chart as the keyboard sees it: its id and the box it occupies right now. */
export interface ShortcutTile {
  id: string
  rect: { left: number; top: number; right: number; bottom: number }
}

/** Which chart a pointer-level shortcut acts on: the tile the pointer is INSIDE, whether or not it
 *  is the layout's active tile, because the level a contributed row would name is read from that
 *  tile's own price scale and no other tile has it. The pointer outside every tile answers null and
 *  the press is left for the page: there is no level to act at, and silently retargeting the active
 *  tile would act at a price the viewer never pointed to. Later tiles win an overlap,
 *  which is the tile drawn on top. */
export function tileAtPoint(tiles: readonly ShortcutTile[], point: ShortcutPoint | null): string | null {
  if (!point) return null
  let hit: string | null = null
  for (const tile of tiles) {
    const r = tile.rect
    if (point.clientX >= r.left && point.clientX < r.right && point.clientY >= r.top && point.clientY < r.bottom) hit = tile.id
  }
  return hit
}

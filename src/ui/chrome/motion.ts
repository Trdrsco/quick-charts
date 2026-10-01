// How long the chrome keeps a leaving surface on screen: exactly as long as the stylesheet's
// transition runs, because both read the same duration role.
//
// The role's value is read from the widget root that carries the theme, where the widget writes a
// host's palette and where the stylesheet resolves every duration to zero under a reduced-motion
// preference. A surface outside any themed root has no stylesheet recipe to run, so it has no
// motion to wait for.
import { cssVarName, THEME_ROOT_SELECTOR } from '../../theme/css-contract'
import type { ThemeRoleId } from '../../theme/schema'

const DURATION = /^(\d+|\d*\.\d+)(ms|s)$/

/** A duration role's current value at an element, in milliseconds; zero when the element stands
 *  under no themed root or the value is not a duration. */
export function motionDurationMs(element: Element, role: ThemeRoleId): number {
  const root = element.closest(THEME_ROOT_SELECTOR)
  const view = element.ownerDocument.defaultView
  if (!root || !view) return 0
  const match = DURATION.exec(view.getComputedStyle(root).getPropertyValue(cssVarName(role)).trim())
  if (!match) return 0
  return Number(match[1]) * (match[2] === 's' ? 1000 : 1)
}

/** How long past a transition's own end the chrome waits for its end event before finishing the
 *  exit itself, for a hidden tab or a renderer that delivers no transition events. */
export const EXIT_EVENT_GRACE_MS = 50

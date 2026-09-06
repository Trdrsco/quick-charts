// The magnet, as a POLICY over the seam's snap.
//
// `magnetSnap` answers one question — which OHLC value does this point pull to — and it is pure
// geometry. The product decisions around it are separate and belong here: the toolbar's icon toggles
// between off and weak rather than cycling three states, the menu's two rows are latching (picking
// the mode that is already on releases the magnet, so there is no Off row to hunt for), and the
// button's face says strong or plain magnet rather than on or off.
import type { MagnetMode } from '../internal/drawings/index'
import type { ChartMessageKey } from '../i18n/en'

export type { MagnetMode }

/** The two modes the menu offers. Off is reached by toggling, never by picking. */
export const MAGNET_STRENGTHS: readonly Exclude<MagnetMode, 'off'>[] = ['weak', 'strong']

export const MAGNET_LABELS: Readonly<Record<Exclude<MagnetMode, 'off'>, ChartMessageKey>> = {
  weak: 'drawing.magnetWeak',
  strong: 'drawing.magnetStrong',
}

/** The toolbar button. It is a plain on/off switch over the LAST strength the trader chose, so a
 *  trader who set strong gets strong back when they turn the magnet on again. */
export function toggleMagnet(mode: MagnetMode, lastStrength: Exclude<MagnetMode, 'off'> = 'weak'): MagnetMode {
  return mode === 'off' ? lastStrength : 'off'
}

/** A menu row. Picking the active strength releases the magnet; picking the other switches to it
 *  without a trip through off. */
export function chooseMagnetStrength(mode: MagnetMode, strength: Exclude<MagnetMode, 'off'>): MagnetMode {
  return mode === strength ? 'off' : strength
}

/** Whether the magnet is pulling at all. */
export const magnetActive = (mode: MagnetMode): boolean => mode !== 'off'

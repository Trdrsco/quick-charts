// The chart's price-scale MODE vocabulary (regular / logarithmic / percentage / indexed-to-100).
// The renderer does all the math (lightweight-charts PriceScaleMode); this module owns the
// vocabulary and the enum mapping every host shares — where a host PERSISTS its choice is the
// host's business (the widget uses its ChartStorage; a richer host may key it per panel).
import { PriceScaleMode } from 'lightweight-charts'

export type ScaleMode = 'normal' | 'log' | 'percent' | 'indexed'

export const SCALE_MODES: readonly ScaleMode[] = ['normal', 'log', 'percent', 'indexed']

/** Settings-control chips, in render order. */
export const SCALE_MODE_OPTIONS: readonly { id: ScaleMode; label: string }[] = [
  { id: 'normal', label: 'Reg' },
  { id: 'log', label: 'Log' },
  { id: 'percent', label: '%' },
  { id: 'indexed', label: '100' },
]

export const PRICE_SCALE_MODE: Record<ScaleMode, PriceScaleMode> = {
  normal: PriceScaleMode.Normal,
  log: PriceScaleMode.Logarithmic,
  percent: PriceScaleMode.Percentage,
  indexed: PriceScaleMode.IndexedTo100,
}

/** A stored value is trusted only if it is still in the vocabulary — anything else (older builds,
 *  hand-edited storage) degrades to 'normal', never a crash or a silently-wrong axis. */
export function coerceScaleMode(raw: string | null | undefined): ScaleMode {
  return (SCALE_MODES as readonly string[]).includes(raw ?? '') ? (raw as ScaleMode) : 'normal'
}

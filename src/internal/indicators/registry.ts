// The built-in registry: the 23 definitions in the picker's order (moving averages, bands and
// channels, oscillators, volume). The count is release inventory: the chart's inventory test reads
// this literal, so an addition or removal changes it on purpose.
import {
  adxIndicator,
  atrIndicator,
  bollingerIndicator,
  cciIndicator,
  donchianIndicator,
  emaIndicator,
  hmaIndicator,
  keltnerIndicator,
  macdIndicator,
  mfiIndicator,
  momentumIndicator,
  obvIndicator,
  psarIndicator,
  rocIndicator,
  rsiIndicator,
  smaIndicator,
  stochasticIndicator,
  stochrsiIndicator,
  supertrendIndicator,
  volumeIndicator,
  vwapIndicator,
  vwmaIndicator,
  williamsIndicator,
} from './definitions'
import type { BuiltInIndicator } from './manifest'

export const BUILT_IN_INDICATORS: readonly BuiltInIndicator[] = [
  smaIndicator,
  emaIndicator,
  hmaIndicator,
  vwmaIndicator,
  bollingerIndicator,
  donchianIndicator,
  keltnerIndicator,
  supertrendIndicator,
  psarIndicator,
  rsiIndicator,
  macdIndicator,
  stochasticIndicator,
  stochrsiIndicator,
  adxIndicator,
  atrIndicator,
  cciIndicator,
  williamsIndicator,
  rocIndicator,
  momentumIndicator,
  volumeIndicator,
  vwapIndicator,
  obvIndicator,
  mfiIndicator,
]

const byId = new Map(BUILT_IN_INDICATORS.map((d) => [d.id, d]))

/** The built-in for a catalog id, or null for an id the registry does not hold (fail closed). */
export function builtInIndicator(id: string): BuiltInIndicator | null {
  return byId.get(id) ?? null
}

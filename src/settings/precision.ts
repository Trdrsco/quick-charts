// The price format a chart writes with under the viewer's precision setting.
//
// `default` keeps the symbol's own declared format. A count of decimals writes every price at that
// many places, and a fraction writes the sub-unit part as a counted fraction of that denominator
// (1/4 writes 30883'2). Either replaces the symbol's grid for writing and for the price scale's
// steps alike, so the axis, the legend, the countdown and the drawings keep agreeing through the
// chart's one formatter.
import type { PriceFormat } from '../symbology'
import type { ChartPricePrecision } from './schema'

/** The price format a precision setting writes with, over the symbol's own. */
export function formatAtPrecision(format: PriceFormat, precision: ChartPricePrecision): PriceFormat {
  if (precision === 'default') return format
  const fraction = /^1\/(\d+)$/.exec(precision)
  if (fraction) return { pricescale: Number(fraction[1]), minmov: 1, fractional: true }
  const decimals = Number(precision)
  if (!Number.isInteger(decimals) || decimals < 0) return format
  return { pricescale: 10 ** decimals, minmov: 1 }
}

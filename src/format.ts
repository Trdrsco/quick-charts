// The price formatter on its own: the `@trdrs/quickcharts/format` entry. A host surface that writes
// a price beside the chart, a native view or a server-rendered page among them, reads it the way
// the chart's axis does, fractional and variable-tick formats included, through the one formatter
// rather than a copy of it.
//
// Platform-neutral on purpose: nothing reachable from here names a window, a document or a DOM
// type, so the entry loads anywhere JavaScript runs.
export { createPriceFormatter } from './priceFormatter'
export type { NumericPunctuation, PriceFormatter, PriceFormatterOptions } from './priceFormatter'
export type { PriceFormat, TickBand } from './symbology'

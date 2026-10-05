// The symbol naming rule on its own: the `@trdrs/quickcharts/symbols` entry. A host that names a
// market in a view of its own, a native search list among them, writes it with the same faces the
// chart's toolbar, legend and search rows wear, from the same rule.
//
// Platform-neutral on purpose: nothing reachable from here names a window, a document or a DOM type,
// so the entry loads anywhere JavaScript runs.
export { bareTicker, symbolNames } from './symbolLabel'
export type { SymbolNames } from './symbolLabel'

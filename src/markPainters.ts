// The host's mark painters: what draws the artwork beside a thing the chart names.
//
// The chart ships no artwork and fetches none. A host that has logos lends a painter, and the
// chart calls it wherever it names that thing, so a market wears the same mark in the legend, in
// a search row and on an extension's notice, and the host implements it once. A host that lends none
// gets the neutral monogram the package draws itself. The marks a feed serves are a different
// thing entirely: those are notes about a moment, not artwork for a name.
//
// A host lends the three separately, because they answer about different things. Inside the chart
// they are ONE value, required at every hop that carries it: a surface asks for the value, not for
// a painter, and gets all three or none of them. Null is the whole of "the host lent none".

/** Paints a market's mark into a box the chart owns, and answers what takes it down again. */
export type SymbolMarkPainter = (request: { symbol: string; host: HTMLElement; size: number }) => (() => void) | void

/** Paints the mark of the venue a market lists on, the same way. */
export type VenueMarkPainter = (request: { exchange: string; host: HTMLElement; size: number }) => (() => void) | void

/** Paints the mark of a data source, where a row names a data source rather than a venue. */
export type DataSourceMarkPainter = (request: { dataSource: string; host: HTMLElement; size: number }) => (() => void) | void

/** Every painter the host lent, as the chart carries them: null where it lent none. */
export interface MarkPainters {
  readonly symbol: SymbolMarkPainter | null
  readonly venue: VenueMarkPainter | null
  readonly dataSource: DataSourceMarkPainter | null
}

/** The host's hooks, as an entry point takes them. Each is the host's to lend or withhold, and
 *  every entry point that paints marks takes exactly these, so a host writes them once and hands
 *  the same three to a chart and to a picker it opens away from one. */
export interface MarkPainterHooks {
  /** The host's mark for a market, called WHEREVER the chart names one: each chart's legend, the
   *  compare rows under it, every row of the symbol search and compare dialogs, and the market tag
   *  an extension's notice wears. It receives the element to paint into and the symbol it stands for,
   *  and returns a disposer that takes the mark down again.
   *
   *  One hook rather than one per surface, so a market wears the same mark everywhere it appears and
   *  a host implements it once. The chart ships no artwork and fetches none: absent this, every mark
   *  is the neutral monogram the package draws itself. */
  symbolMark?: SymbolMarkPainter
  /** The host's mark for the venue a market lists on, painted beside the venue's name in every row
   *  of the symbol search and compare dialogs. Like `symbolMark`, it receives the element to paint
   *  into and the size of the box, and returns a disposer; absent, a venue wears its initial on the
   *  neutral disc the package draws itself. */
  venueMark?: VenueMarkPainter
  /** The host's mark for the data source a row names where it names no venue, painted in that
   *  row's source cell the same way. Absent, a data source wears its initial on a neutral disc. */
  dataSourceMark?: DataSourceMarkPainter
}

/** The one place a host's optional hooks become the value the chart carries. Every entry point
 *  that takes the hooks resolves them here, once, and passes the answer down whole. */
export function resolveMarkPainters(hooks: MarkPainterHooks): MarkPainters {
  return {
    symbol: hooks.symbolMark ?? null,
    venue: hooks.venueMark ?? null,
    dataSource: hooks.dataSourceMark ?? null,
  }
}

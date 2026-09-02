// The manifest grammar a built-in definition is written in, and the definition shape itself.
// Declared here in the seam's own terms, structurally identical to the chart's IndicatorManifest,
// so this package imports nothing at runtime or in types: the chart bundles it and proves
// assignability at its own boundary (packages/chart/src/builtInIndicators.ts).
import type { IndicatorBar } from './types'

/** A declared numeric input: `int`/`float` bound by min/max, `enum` an index into `options`. */
export interface ManifestInput {
  readonly kind: 'int' | 'float' | 'enum'
  readonly default: number
  readonly min?: number
  readonly max?: number
  readonly options?: readonly string[]
}

/** A declared plot channel. `scale: 'volume'` pins the plot to the chart's own volume band. */
export interface ManifestPlot {
  readonly kind: 'line' | 'histogram' | 'area' | 'marker'
  readonly color?: string
  readonly lineWidth?: number
  readonly lineStyle?: 'solid' | 'dashed' | 'dotted'
  readonly dots?: boolean
  readonly up?: string
  readonly down?: string
  readonly base?: number
  readonly shape?: 'circle' | 'square' | 'triangle-up' | 'triangle-down' | 'arrow-up' | 'arrow-down' | 'cross'
  readonly location?: 'above' | 'below' | 'absolute'
  readonly text?: string
  readonly scale?: 'volume'
}

/** A declared static horizontal level. */
export interface ManifestLevel {
  readonly price: number
  readonly color?: string
  readonly lineStyle?: 'solid' | 'dashed' | 'dotted'
}

/** A declared band fill between two edges: plot keys, or level keys when no plot carries the name. */
export interface ManifestFill {
  readonly between: readonly [string, string]
  readonly color?: string
}

/** The four families the built-in catalog groups by, in the picker's order. */
export type IndicatorCategory = 'ma' | 'band' | 'osc' | 'vol'

/** A built-in's declarative manifest: identity, placement, category, and its inputs, plots,
 *  levels and fills. Every trader-visible word is elsewhere: names and descriptions are catalog
 *  keys on the definition, and `tag` is the locale-neutral short mark (SMA, RSI, %R). */
export interface IndicatorManifest {
  readonly id: string
  readonly tag: string
  readonly pane: 'overlay' | 'pane'
  readonly category: IndicatorCategory
  readonly needsVolume?: boolean
  readonly inputs: Readonly<Record<string, ManifestInput>>
  readonly plots: Readonly<Record<string, ManifestPlot>>
  readonly levels?: Readonly<Record<string, ManifestLevel>>
  readonly fills?: Readonly<Record<string, ManifestFill>>
}

/** Per-plot value channels aligned 1:1 to the bars, NaN through each plot's warm-up. */
export type PlotArrays = Readonly<Record<string, readonly number[]>>

/** One built-in indicator: the manifest, the pure compute over chart bars, and the catalog keys
 *  and labels the chart's chrome reads. Pure by contract: no DOM, no storage, no clock, no
 *  module-level state; the same bars and inputs always compute the same channels. */
export interface BuiltInIndicator {
  /** The catalog id and the instance `type` a host persists (`sma`, `rsi`). */
  readonly id: string
  /** The locale-neutral short mark a legend chip wears. */
  readonly tag: string
  readonly category: IndicatorCategory
  /** The chart catalog key of the display name (`indicator.smaName`). */
  readonly nameKey: string
  /** The chart catalog key of the one-line description (`indicator.smaDescription`). */
  readonly descriptionKey: string
  readonly manifest: IndicatorManifest
  /** Display labels for plot, level and fill keys in a settings surface ("basis" reads "Basis"). */
  readonly plotTitles: Readonly<Record<string, string>>
  /** Display labels for input keys where the label differs from the key ("period" reads "Length"). */
  readonly inputTitles: Readonly<Record<string, string>>
  /** The channels for every declared plot key over `bars`, with `inputs` complete over the
   *  manifest defaults. Reads bar times from `bars[i].t`. */
  compute(bars: readonly IndicatorBar[], inputs: Readonly<Record<string, number>>): PlotArrays
}

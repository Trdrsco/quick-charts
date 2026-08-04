// The indicator MODEL: a declarative manifest (typed inputs + declared plots/levels/fills), the
// render-agnostic plot spec built from it, per-instance style overrides, and the one walker that
// turns computed value channels into that spec. Types are self-contained on purpose — the same
// manifest grammar an external system publishes (the trdrs engine's script manifests satisfy these
// shapes structurally) works here without importing that system, keeping the package's dependency
// surface at the renderer alone. Compute stays OUTSIDE the model: a definition pairs a manifest
// with a compute the HOST supplies, so the package never owns indicator math.
import type { HistogramData, LineData, UTCTimestamp, WhitespaceData } from 'lightweight-charts'

/** A declared numeric input: `int`/`float` bound by min/max, `enum` an index into `options`. */
export interface ManifestInput {
  readonly kind: 'int' | 'float' | 'enum'
  readonly default: number
  readonly min?: number
  readonly max?: number
  readonly options?: readonly string[]
}

/** A declared plot channel. `area` fills toward `base`; `marker` draws an event glyph on bars with
 *  a finite value (`location` 'above'/'below' tracks the bar, 'absolute' anchors at the value). */
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
}

/** A declared static horizontal level. */
export interface ManifestLevel {
  readonly price: number
  readonly color?: string
  readonly lineStyle?: 'solid' | 'dashed' | 'dotted'
}

/** A declared band fill between two sibling plots. */
export interface ManifestFill {
  readonly between: readonly [string, string]
  readonly color?: string
}

/** The declarative indicator manifest: placement + declared inputs/plots/levels/fills, no code.
 *  Identity fields are optional — the walker renders from structure, not identity — so any
 *  wire-shaped manifest with `pane` and `plots` satisfies this type structurally. */
export interface IndicatorManifest {
  readonly id?: string
  readonly name?: string
  readonly pane: 'overlay' | 'pane'
  readonly needsVolume?: boolean
  readonly inputs?: Readonly<Record<string, ManifestInput>>
  readonly plots: Readonly<Record<string, ManifestPlot>>
  readonly levels?: Readonly<Record<string, ManifestLevel>>
  readonly fills?: Readonly<Record<string, ManifestFill>>
  readonly paints?: { readonly barColor?: boolean; readonly shade?: boolean }
}

export type PlotPoint = LineData<UTCTimestamp> | HistogramData<UTCTimestamp> | WhitespaceData<UTCTimestamp>

/** One built plot: a series-shaped data channel plus the styling the renderer applies. */
export interface IndicatorPlot {
  key: string
  type: 'line' | 'histogram' | 'area' | 'marker'
  color: string
  lineWidth?: number
  lineStyle?: 'solid' | 'dashed' | 'dotted'
  /** Render as standalone point markers with no connecting line. */
  dots?: boolean
  /** Area only: the level the fill extends toward. */
  base?: number
  /** Marker only: glyph + placement + optional short tag on event bars. */
  shape?: 'circle' | 'square' | 'triangle-up' | 'triangle-down' | 'arrow-up' | 'arrow-down' | 'cross'
  location?: 'above' | 'below' | 'absolute'
  text?: string
  /** False hides the plot's series (the series stays — removing it would misalign the entry). */
  visible?: boolean
  /** Render on a non-price scale — 'volume' pins the series to the chart's volume band. */
  scale?: 'volume'
  data: PlotPoint[]
}

/** A static horizontal reference line declared by the manifest (rendered as a price line). */
export interface IndicatorLevel {
  key: string
  price: number
  color?: string
  lineStyle?: 'solid' | 'dashed' | 'dotted'
}

/** A declared band fill between two sibling plots, with optional per-bar color overrides
 *  (null = skip that bar). A LEVEL-band fill carries its constant edges inline instead —
 *  `upperData`/`lowerData` outrank the plot-key lookup. */
export interface IndicatorFill {
  key: string
  /** Plot KEYS of the band edges (must exist in `plots`, unless inline data is carried). */
  upper: string
  lower: string
  color: string
  colors?: (string | null)[]
  upperData?: PlotPoint[]
  lowerData?: PlotPoint[]
}

/** The complete render-agnostic spec for one indicator instance over the loaded bars. */
export interface IndicatorPlots {
  /** overlay = main price scale · pane = the indicator's own bottom pane. */
  placement: 'overlay' | 'pane'
  title: string
  plots: IndicatorPlot[]
  /** Static levels (overbought/oversold, zero lines) attached to the group's first series. */
  levels?: IndicatorLevel[]
  /** Declared band fills painted between two plots' series. */
  fills?: IndicatorFill[]
  /** Per-bar pane background tint (sessions, regimes) — sparse, self-contained points. */
  shade?: { time: UTCTimestamp; color: string }[]
  /** Per-bar candle recolor (overlay indicators only) — merged into the main candle series. */
  barColors?: { time: UTCTimestamp; color: string }[]
  /** Decimal places for this indicator's value labels; absent = the chart default. */
  precision?: number
  /** The standard output toggles — absent flags default ON. */
  display?: { labelsOnPriceScale?: boolean; valuesInStatusLine?: boolean; inputsInStatusLine?: boolean }
  /** Set when the indicator can't be computed from the current feed (e.g. no volume) — no plots
   *  are drawn and the host may surface the note. */
  unavailable?: string
}

/** Per-instance settings layered above the manifest defaults. Absent keys mean "manifest default". */
export interface IndicatorOverrides {
  plots?: Record<string, { color?: string; up?: string; down?: string; lineWidth?: number; lineStyle?: 'solid' | 'dashed' | 'dotted'; visible?: boolean }>
  levels?: Record<string, { price?: number; color?: string; lineStyle?: 'solid' | 'dashed' | 'dotted'; visible?: boolean }>
  fills?: Record<string, { color?: string; visible?: boolean }>
  /** Decimal places for this indicator's value labels; absent = the chart default. */
  precision?: number
  /** Standard output toggles (all default ON). `hidden` keeps the instance (settings reachable,
   *  listings intact) but renders nothing until unhidden. */
  display?: { labelsOnPriceScale?: boolean; valuesInStatusLine?: boolean; inputsInStatusLine?: boolean; hidden?: boolean }
}

/** The one render-or-not read for the hidden toggle — every consumer asks this, so they can never
 *  disagree about what "hidden" means. */
export function indicatorHidden(ov: IndicatorOverrides | undefined): boolean {
  return ov?.display?.hidden === true
}

/** The manifest's default input values ({ period: 20, source: 0, … }). */
export function manifestInputDefaults(m: IndicatorManifest): Record<string, number> {
  return Object.fromEntries(Object.entries(m.inputs ?? {}).map(([k, spec]) => [k, spec.default]))
}

/** The effective color of a plot spec under an instance: override → declared → the instance's
 *  rotated color. A legend dot and a save-as-default snapshot both read THIS, so what the user
 *  sees is what persists. */
export function effectivePlotColor(m: IndicatorManifest, key: string, ov: IndicatorOverrides | undefined, instanceColor: string): string {
  return ov?.plots?.[key]?.color ?? m.plots[key]?.color ?? instanceColor
}

/** A manifest with an instance's STYLE overrides folded into its declared specs — colors, widths,
 *  line styles, histogram up/down, level price/color/style, fill colors. Applied BEFORE the plot
 *  walker so baked-at-build styling (histogram point colors) honors the overrides too. */
export function overriddenManifest<M extends IndicatorManifest>(m: M, ov?: IndicatorOverrides): M {
  if (!ov || (!ov.plots && !ov.levels && !ov.fills)) return m
  const plots = Object.fromEntries(
    Object.entries(m.plots).map(([key, spec]) => {
      const o = ov.plots?.[key]
      if (!o) return [key, spec]
      return [
        key,
        {
          ...spec,
          ...(o.color !== undefined ? { color: o.color } : {}),
          ...(o.up !== undefined ? { up: o.up } : {}),
          ...(o.down !== undefined ? { down: o.down } : {}),
          ...(o.lineWidth !== undefined ? { lineWidth: o.lineWidth } : {}),
          ...(o.lineStyle !== undefined ? { lineStyle: o.lineStyle } : {}),
        },
      ]
    }),
  )
  const levels = m.levels
    ? Object.fromEntries(
        Object.entries(m.levels).map(([key, spec]) => {
          const o = ov.levels?.[key]
          if (!o) return [key, spec]
          return [
            key,
            {
              ...spec,
              ...(o.price !== undefined ? { price: o.price } : {}),
              ...(o.color !== undefined ? { color: o.color } : {}),
              ...(o.lineStyle !== undefined ? { lineStyle: o.lineStyle } : {}),
            },
          ]
        }),
      )
    : undefined
  const fills = m.fills
    ? Object.fromEntries(
        Object.entries(m.fills).map(([key, spec]) => {
          const o = ov.fills?.[key]
          return [key, o?.color !== undefined ? { ...spec, color: o.color } : spec]
        }),
      )
    : undefined
  return { ...m, plots, ...(levels ? { levels } : {}), ...(fills ? { fills } : {}) }
}

/** Fold the instance's VISIBILITY overrides (plot eyes, hidden levels/fills) plus precision and
 *  display toggles into a built spec — the post-walk half of the override layering. */
export function applyPlotOverrides(built: IndicatorPlots, ov?: IndicatorOverrides): IndicatorPlots {
  const plots = built.plots.map((p) => {
    const visible = ov?.plots?.[p.key]?.visible
    return visible === undefined ? p : { ...p, visible }
  })
  const levels = built.levels?.filter((l) => ov?.levels?.[l.key]?.visible !== false)
  const fills = built.fills?.filter((f) => ov?.fills?.[f.key]?.visible !== false)
  return {
    ...built,
    plots,
    ...(levels !== undefined ? { levels } : {}),
    ...(fills !== undefined ? { fills } : {}),
    ...(ov?.precision !== undefined ? { precision: ov.precision } : {}),
    ...(ov?.display !== undefined ? { display: ov.display } : {}),
  }
}

const UP = '#26a69a'
const DOWN = '#f23645'

/** One computed run against a manifest: per-plot value channels aligned 1:1 to the bar times, plus
 *  the optional per-bar color/paint channels a richer compute may drive. */
export interface ManifestRun {
  manifest: IndicatorManifest
  plots: Readonly<Record<string, readonly (number | null)[]>>
  plotColors?: Readonly<Record<string, readonly (string | null)[]>>
  fillColors?: Readonly<Record<string, readonly (string | null)[]>>
  shadeColors?: readonly (string | null)[]
  barColors?: readonly (string | null)[]
}

/** Keeps the time axis intact, emitting whitespace where the value is null/NaN — a plot with gaps
 *  (warmup heads, conditional coloring) breaks cleanly instead of bridging. Per-bar color
 *  overrides ride the point when the compute drove them. */
function toGapped(values: readonly (number | null)[], times: readonly UTCTimestamp[], colors?: readonly (string | null)[]): PlotPoint[] {
  const out: PlotPoint[] = []
  for (let i = 0; i < values.length && i < times.length; i++) {
    const v = values[i]
    if (v != null && Number.isFinite(v)) {
      const c = colors?.[i]
      out.push(c ? { time: times[i]!, value: v, color: c } : { time: times[i]!, value: v })
    } else out.push({ time: times[i]! })
  }
  return out
}

function toHistogram(
  values: readonly (number | null)[],
  times: readonly UTCTimestamp[],
  up: string,
  down: string,
  colors?: readonly (string | null)[],
): PlotPoint[] {
  const out: PlotPoint[] = []
  for (let i = 0; i < values.length && i < times.length; i++) {
    const v = values[i]
    if (v != null && Number.isFinite(v)) out.push({ time: times[i]!, value: v, color: colors?.[i] ?? (v >= 0 ? up : down) })
  }
  return out
}

/** The ONE walker from a computed run to the render-agnostic spec — built-ins, user scripts, and
 *  widget definitions all render through this, so plot semantics can never drift between them.
 *  `fallbackColor` is the instance's rotated color, used by any plot channel that doesn't declare
 *  its own. */
export function buildManifestPlots(run: ManifestRun, times: readonly UTCTimestamp[], title: string, fallbackColor: string): IndicatorPlots {
  const manifest = run.manifest
  const plots: IndicatorPlot[] = Object.entries(manifest.plots).map(([key, spec]) => {
    const values = run.plots[key] ?? []
    const colors = run.plotColors?.[key]
    if (spec.kind === 'histogram') {
      return {
        key,
        type: 'histogram' as const,
        color: spec.color ?? fallbackColor,
        data: toHistogram(values, times, spec.up ?? UP, spec.down ?? DOWN, colors),
      }
    }
    if (spec.kind === 'area') {
      return {
        key,
        type: 'area' as const,
        color: spec.color ?? fallbackColor,
        base: spec.base ?? 0,
        data: toGapped(values, times, colors),
      }
    }
    if (spec.kind === 'marker') {
      return {
        key,
        type: 'marker' as const,
        color: spec.color ?? fallbackColor,
        shape: spec.shape ?? 'circle',
        location: spec.location ?? 'absolute',
        text: spec.text,
        data: toGapped(values, times, colors),
      }
    }
    return {
      key,
      type: 'line' as const,
      color: spec.color ?? fallbackColor,
      lineWidth: spec.lineWidth,
      lineStyle: spec.lineStyle,
      dots: spec.dots,
      data: toGapped(values, times, colors),
    }
  })
  const levels = Object.entries(manifest.levels ?? {}).map(([key, l]) => ({ key, price: l.price, color: l.color, lineStyle: l.lineStyle }))
  // Declared band fills: painted between the two edge plots' series; per-bar fill colors override
  // the spec color (null = that bar unfilled).
  const fills = Object.entries(manifest.fills ?? {}).map(([key, f]) => ({
    key,
    upper: f.between[0],
    lower: f.between[1],
    color: f.color ?? 'rgba(38, 166, 154, 0.13)',
    colors: run.fillColors?.[key] as (string | null)[] | undefined,
  }))
  // Sparse self-contained points for the pane shade + candle recolor channels.
  const toPoints = (arr: readonly (string | null)[] | undefined) => {
    if (!arr) return undefined
    const out: { time: UTCTimestamp; color: string }[] = []
    for (let i = 0; i < arr.length && i < times.length; i++) {
      const c = arr[i]
      if (c) out.push({ time: times[i]!, color: c })
    }
    return out.length ? out : undefined
  }
  const shade = toPoints(run.shadeColors)
  const barColors = manifest.pane === 'overlay' ? toPoints(run.barColors) : undefined
  return {
    placement: manifest.pane === 'pane' ? 'pane' : 'overlay',
    title,
    plots,
    ...(levels.length ? { levels } : {}),
    ...(fills.length ? { fills } : {}),
    ...(shade ? { shade } : {}),
    ...(barColors ? { barColors } : {}),
  }
}

/** The last finite y-value of a plot's data (the indicator's current reading), or null in warmup.
 *  Plot points are a union (line/histogram carry `value`; whitespace gaps don't), so read
 *  defensively. */
export function latestPlotValue(data: readonly unknown[] | undefined): number | null {
  if (!data) return null
  for (let i = data.length - 1; i >= 0; i--) {
    const v = (data[i] as { value?: unknown } | undefined)?.value
    if (typeof v === 'number' && Number.isFinite(v)) return v
  }
  return null
}

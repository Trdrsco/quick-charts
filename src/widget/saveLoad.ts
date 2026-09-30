// Save and load: the chart's own content format, and the open saved chart.
//
// The content blob is contractually OPAQUE to every backend, which is why it carries a version:
// the reader here is the only place an upgrade path can ever live. A save updates the open chart at
// the revision it was opened at, or creates when nothing is open or the host asks for a copy; a
// refusal comes back as a typed outcome with the catalog's copy for the case, and the chart never
// writes over a newer revision.
import type { SerializedDrawing } from '../internal/drawings/index'
import { ResourceAbortError, type ChartBody, type ChartMeta, type ChartSaveLoadAdapter } from '../resources'
import { openResourceController, ResourceRollbackError, type OpenResource, type ResourceLoadOutcome, type ResourceRemoveOutcome, type ResourceSaveOutcome } from '../openResource'
import type { ChartI18n } from '../i18n'
import type { IndicatorOverrides } from '../indicatorModel'
import { DEFAULT_OVERRIDES, type ChartOverrides } from '../overrides'
import { parseCssColor } from '../theme/color'
import type { ScaleMode } from '../scaleMode'
import type { IndicatorDefinition, IndicatorInstance } from './options'
import type { ChartStyleId } from './styles'

/** The save/load surface a host drives. */
export interface ChartSaveLoadApi {
  adapter: ChartSaveLoadAdapter | null
  /** Snapshot the chart's state as a name-less save: symbol and timeframe for the listing row, and
   *  the opaque, versioned content blob. A loaded chart restores its LOOK as well as its data. */
  serialize(): { symbol: string; timeframe: string; content: string }
  /** Apply a saved chart's content blob. Throws on an unrecognized content version. A blob that
   *  fails part-way puts the chart back on the content it held; where that fails too, the chart
   *  stops saving and `notSaving()` says so. */
  restore(content: string): void
  /** The open saved chart, or null while what is on screen is unsaved. */
  current(): OpenResource | null
  /** True while the chart holds content that could not be put back: a body failed part-way and so
   *  did the undo, so the screen is neither content. Saving is refused until a load lands, so a
   *  half-applied chart is never written over the last one that was whole. */
  notSaving(): boolean
  /** Save under `name`: an update of the open chart at its held revision, or a create when nothing
   *  is open or `asNew` asks for a copy. Answers `not-saving` while the chart is not saving; a copy
   *  is let through, because it creates a chart of its own and leaves the one this chart is bound to
   *  standing whole, but the chart still saves nowhere else. Rejects without an adapter. */
  save(name: string, opts?: { asNew?: boolean; signal?: AbortSignal }): Promise<ResourceSaveOutcome<ChartMeta>>
  /** Open a saved chart: its content is read and applied FIRST, and only a chart that took it
   *  becomes the open chart. Content this build cannot read comes back as `invalid`, an id the
   *  store does not hold as `not-found`, a store that could not be reached as `unavailable`, and a
   *  load abandoned before it landed as `cancelled`. On every one of them the chart on screen and
   *  its save binding are exactly as they were. */
  load(id: string, signal?: AbortSignal): Promise<ResourceLoadOutcome<ChartBody>>
  /** Delete the open chart at its held revision. What is on screen stays; its binding detaches. */
  remove(signal?: AbortSignal): Promise<ResourceRemoveOutcome>
  /** Forget the open chart without touching the store: the next save creates. */
  detach(): void
}

/** The chart's saved-content format. Bumping this is the only reason a reader below ever branches. */
export const CHART_CONTENT_VERSION = 4

/** The format whose `appearance` was the RESOLVED tree rather than the viewer's own choices. A
 *  reader still accepts it, and drops that one field; see the note on ChartContent.appearance. */
const RESOLVED_APPEARANCE_VERSION = 3

/** One indicator instance as the opaque blob carries it. The definition is named rather than
 *  stored because compute is executable code. The loading widget resolves that name against its
 *  own catalog before the instance reaches the renderer. */
export interface SavedIndicator {
  id: string
  definition: string
  inputs?: Record<string, number>
  color?: string
  title?: string
  overrides?: IndicatorOverrides
}

/** Whether the price axis frames itself from the data on screen, or holds the bounds the viewer
 *  stretched it to. It is a policy, not a pair of prices: the exact vertical bounds are a device's
 *  own view of the market and are never carried between machines. */
export type PriceAxisPolicy = 'auto' | 'manual'

/** A stored price-axis policy, or auto for a blob that states none. */
export const coercePriceAxisPolicy = (value: string | null | undefined): PriceAxisPolicy =>
  value === 'manual' ? 'manual' : 'auto'

/** Everything a saved chart carries. */
export interface ChartContent {
  symbol: string
  timeframe: string
  style: ChartStyleId
  scale: ScaleMode
  /** Auto or manual price framing. Independent of `scale`: a logarithmic axis can be either, and
   *  changing one never changes the other. */
  priceAxis: PriceAxisPolicy
  /** Indicator instances in legend order. An empty list clears the chart's mount-time seed. */
  indicators: readonly SavedIndicator[]
  /** The leaves the VIEWER authored, and only those: the runtime layer of the appearance ladder.
   *  The theme floor and the host's constructor partial resolve fresh on whichever chart the
   *  content lands on, so a chart saved in dark mode and reopened in light takes the light theme's
   *  colors for every leaf nobody named, and a host that rebrands sees its new brand rather than
   *  the old one written down as though a viewer had chosen it. An empty record is the honest
   *  statement that nothing was authored, not a missing field. */
  appearance: Partial<ChartOverrides['appearance']>
  compares: unknown
  /** The drawings on the chart, in COMBINED mode only. In separate mode this is absent and the
   *  drawings family is their only path: one drawing is stored in one place, whichever mode the
   *  host chose, so nothing here ever has to decide which copy is the newer one. */
  drawings?: readonly SerializedDrawing[]
  /** Extension state by extension id, so a chart saved with one set of extensions loads under
   *  another without either reading the other's state. */
  ext: Record<string, unknown>
}

/** Serialize one chart's content. Pure over its argument, so the format is testable without a
 *  chart. */
export function serializeChartContent(content: ChartContent): string {
  return JSON.stringify({
    v: CHART_CONTENT_VERSION,
    symbol: content.symbol,
    tf: content.timeframe,
    style: content.style,
    scale: content.scale,
    axis: content.priceAxis,
    indicators: content.indicators.map(savedIndicatorFields),
    appearance: content.appearance,
    compares: content.compares,
    ...(content.drawings ? { drawings: content.drawings } : {}),
    ext: content.ext,
  })
}

/** What a stored blob was read as. Fields the writer omitted arrive undefined, so the caller
 *  applies only what the blob actually stated. */
export interface ParsedChartContent {
  symbol?: string
  timeframe?: string
  style?: string
  scale?: string
  priceAxis?: string
  /** Required in v4. Missing or malformed instance state refuses the blob before anything moves. */
  indicators: SavedIndicator[]
  appearance?: Partial<ChartOverrides['appearance']>
  compares?: unknown
  drawings?: SerializedDrawing[]
  ext?: unknown
}

/** Read a stored blob. Throws on a version this build does not recognize, which is the contract:
 *  the blob is opaque to the backend, so refusing loudly is the only safe answer. */
export function parseChartContent(content: string): ParsedChartContent {
  const raw = JSON.parse(content) as Record<string, unknown>
  if (raw.v !== CHART_CONTENT_VERSION && raw.v !== RESOLVED_APPEARANCE_VERSION) {
    throw new Error(`unsupported chart content version ${String(raw.v)}`)
  }
  // A blob from the resolved-tree format states every appearance leaf whether or not anyone chose
  // it, so nothing in it tells a chosen color from an inherited one. Reading it as choices would
  // pin that chart's first render forever, which is the whole reason the format moved on; the rest
  // of the blob still restores.
  const appearance = raw.v === RESOLVED_APPEARANCE_VERSION ? undefined : raw.appearance
  return {
    symbol: typeof raw.symbol === 'string' && raw.symbol ? raw.symbol : undefined,
    timeframe: typeof raw.tf === 'string' && raw.tf ? raw.tf : undefined,
    style: typeof raw.style === 'string' ? raw.style : undefined,
    scale: typeof raw.scale === 'string' ? raw.scale : undefined,
    priceAxis: typeof raw.axis === 'string' ? raw.axis : undefined,
    indicators: raw.v === RESOLVED_APPEARANCE_VERSION ? [] : parseSavedIndicators(raw.indicators),
    appearance: appearance && typeof appearance === 'object' ? (appearance as Partial<ChartOverrides['appearance']>) : undefined,
    drawings: Array.isArray(raw.drawings) ? (raw.drawings as SerializedDrawing[]) : undefined,
    compares: raw.compares,
    ext: raw.ext,
  }
}

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)

function assertKeys(value: Record<string, unknown>, allowed: readonly string[], label: string): void {
  const permitted = new Set(allowed)
  if (Object.keys(value).some((key) => !permitted.has(key))) throw new Error(`chart content indicator ${label} has an unknown field`)
}

function finite(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`chart content indicator ${label} is not a finite number`)
  return value
}

function color(value: unknown, label: string): string {
  if (typeof value !== 'string' || !recoveryColor(value)) throw new Error(`chart content indicator ${label} is not a color`)
  return value
}

function optionalBoolean(value: unknown, label: string): boolean | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'boolean') throw new Error(`chart content indicator ${label} is not a boolean`)
  return value
}

function lineStyle(value: unknown, label: string): 'solid' | 'dashed' | 'dotted' | undefined {
  if (value === undefined) return undefined
  if (value !== 'solid' && value !== 'dashed' && value !== 'dotted') throw new Error(`chart content indicator ${label} is not a line style`)
  return value
}

function parseInputs(value: unknown): Record<string, number> {
  if (!record(value)) throw new Error('chart content indicator inputs are not a record')
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, finite(entry, `input ${key}`)]))
}

function parseNamedRecords<T>(
  value: unknown,
  label: string,
  read: (entry: Record<string, unknown>, key: string) => T,
): Record<string, T> {
  if (!record(value)) throw new Error(`chart content indicator ${label} are not a record`)
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => {
      if (!record(entry)) throw new Error(`chart content indicator ${label} ${key} is not a record`)
      return [key, read(entry, key)]
    }),
  )
}

function parseOverrides(value: unknown): IndicatorOverrides {
  if (!record(value)) throw new Error('chart content indicator overrides are not a record')
  assertKeys(value, ['plots', 'levels', 'fills', 'precision', 'display'], 'overrides')
  const overrides: IndicatorOverrides = {}
  if (value.plots !== undefined) {
    overrides.plots = parseNamedRecords(value.plots, 'plots', (entry, key) => {
      assertKeys(entry, ['color', 'up', 'down', 'lineWidth', 'lineStyle', 'visible'], `plot ${key}`)
      const out: NonNullable<IndicatorOverrides['plots']>[string] = {}
      if (entry.color !== undefined) out.color = color(entry.color, `plot ${key} color`)
      if (entry.up !== undefined) out.up = color(entry.up, `plot ${key} up color`)
      if (entry.down !== undefined) out.down = color(entry.down, `plot ${key} down color`)
      if (entry.lineWidth !== undefined) {
        const width = finite(entry.lineWidth, `plot ${key} line width`)
        if (width <= 0) throw new Error(`chart content indicator plot ${key} line width is not positive`)
        out.lineWidth = width
      }
      const style = lineStyle(entry.lineStyle, `plot ${key}`)
      if (style !== undefined) out.lineStyle = style
      const visible = optionalBoolean(entry.visible, `plot ${key} visibility`)
      if (visible !== undefined) out.visible = visible
      return out
    })
  }
  if (value.levels !== undefined) {
    overrides.levels = parseNamedRecords(value.levels, 'levels', (entry, key) => {
      assertKeys(entry, ['price', 'color', 'lineStyle', 'visible'], `level ${key}`)
      const out: NonNullable<IndicatorOverrides['levels']>[string] = {}
      if (entry.price !== undefined) out.price = finite(entry.price, `level ${key} price`)
      if (entry.color !== undefined) out.color = color(entry.color, `level ${key} color`)
      const style = lineStyle(entry.lineStyle, `level ${key}`)
      if (style !== undefined) out.lineStyle = style
      const visible = optionalBoolean(entry.visible, `level ${key} visibility`)
      if (visible !== undefined) out.visible = visible
      return out
    })
  }
  if (value.fills !== undefined) {
    overrides.fills = parseNamedRecords(value.fills, 'fills', (entry, key) => {
      assertKeys(entry, ['color', 'visible'], `fill ${key}`)
      const out: NonNullable<IndicatorOverrides['fills']>[string] = {}
      if (entry.color !== undefined) out.color = color(entry.color, `fill ${key} color`)
      const visible = optionalBoolean(entry.visible, `fill ${key} visibility`)
      if (visible !== undefined) out.visible = visible
      return out
    })
  }
  if (value.precision !== undefined) {
    const precision = finite(value.precision, 'precision')
    if (!Number.isInteger(precision) || precision < 0 || precision > 100) throw new Error('chart content indicator precision is outside the supported range')
    overrides.precision = precision
  }
  if (value.display !== undefined) {
    if (!record(value.display)) throw new Error('chart content indicator display is not a record')
    assertKeys(value.display, ['labelsOnPriceScale', 'valuesInStatusLine', 'inputsInStatusLine', 'hidden'], 'display')
    const display: NonNullable<IndicatorOverrides['display']> = {}
    for (const key of ['labelsOnPriceScale', 'valuesInStatusLine', 'inputsInStatusLine', 'hidden'] as const) {
      const parsed = optionalBoolean(value.display[key], `display ${key}`)
      if (parsed !== undefined) display[key] = parsed
    }
    overrides.display = display
  }
  return overrides
}

/** The record's fields in a fixed order, with nothing the instance did not state. */
function savedIndicatorFields(saved: SavedIndicator): SavedIndicator {
  return {
    id: saved.id,
    definition: saved.definition,
    ...(saved.inputs ? { inputs: saved.inputs } : {}),
    ...(saved.color !== undefined ? { color: saved.color } : {}),
    ...(saved.title !== undefined ? { title: saved.title } : {}),
    ...(saved.overrides ? { overrides: saved.overrides } : {}),
  }
}

/** Parse the complete instance list. Any malformed entry or duplicate id refuses the entire blob
 *  before the caller mutates chart state. Unknown definition ids remain an apply-time question. */
function parseSavedIndicators(value: unknown): SavedIndicator[] {
  if (!Array.isArray(value)) throw new Error('chart content indicators are not a list')
  const ids = new Set<string>()
  return value.map((entry) => {
    if (!record(entry)) throw new Error('chart content indicator entry is not a record')
    assertKeys(entry, ['id', 'definition', 'inputs', 'color', 'title', 'overrides'], 'entry')
    if (typeof entry.id !== 'string' || !entry.id || typeof entry.definition !== 'string' || !entry.definition)
      throw new Error('chart content indicator entry names no id or definition')
    if (ids.has(entry.id)) throw new Error(`chart content indicator id ${entry.id} is duplicated`)
    ids.add(entry.id)
    if (entry.title !== undefined && typeof entry.title !== 'string') throw new Error('chart content indicator title is not a string')
    return savedIndicatorFields({
      id: entry.id,
      definition: entry.definition,
      ...(entry.inputs !== undefined ? { inputs: parseInputs(entry.inputs) } : {}),
      ...(entry.color !== undefined ? { color: color(entry.color, 'color') } : {}),
      ...(entry.title !== undefined ? { title: entry.title } : {}),
      ...(entry.overrides !== undefined ? { overrides: parseOverrides(entry.overrides) } : {}),
    })
  })
}

/** Serialize one live instance. A definition without a manifest id cannot be resolved later and
 *  is deliberately absent from the blob; the live snapshot still preserves it for rollback. */
export function serializeIndicatorInstance(instance: IndicatorInstance): SavedIndicator | null {
  const definition = instance.definition.manifest.id
  if (!definition) return null
  return savedIndicatorFields({
    id: instance.id,
    definition,
    ...(instance.inputs ? { inputs: instance.inputs } : {}),
    ...(instance.color !== undefined ? { color: instance.color } : {}),
    ...(instance.title !== undefined ? { title: instance.title } : {}),
    ...(instance.overrides ? { overrides: instance.overrides } : {}),
  })
}

/** Resolve one saved record under the loading widget's catalog. */
export function restoreIndicatorInstance(
  saved: SavedIndicator,
  resolve: (definitionId: string) => IndicatorDefinition | undefined,
): IndicatorInstance | null {
  const definition = resolve(saved.definition)
  if (!definition) return null
  return {
    id: saved.id,
    definition,
    ...(saved.inputs ? { inputs: saved.inputs } : {}),
    ...(saved.color !== undefined ? { color: saved.color } : {}),
    ...(saved.title !== undefined ? { title: saved.title } : {}),
    ...(saved.overrides ? { overrides: saved.overrides } : {}),
  }
}

export interface SaveLoadDeps {
  adapter: ChartSaveLoadAdapter | null
  i18n: ChartI18n
  symbol(): string
  timeframe(): string
  content(): ChartContent
  /** False means an opaque owner applied without proving a complete serialized-state round trip. */
  apply(parsed: ParsedChartContent): boolean | void
  /** The drawing state a rollback has to put back ITSELF. In combined mode the content blob carries
   *  the drawings, so restoring the held blob restores them with everything else; in separate mode
   *  it carries none, and an apply that changed the drawings before it threw would otherwise
   *  survive the rollback. Absent where the blob covers them or the chart has no drawing layer. */
  heldDrawings?: {
    snapshot(): readonly SerializedDrawing[] | null
    restore(drawings: readonly SerializedDrawing[]): void
  }
  /** The exact live instances a rollback restores after the held blob. Unlike the blob this can
   *  retain a host definition with no manifest id. */
  heldIndicators?: {
    snapshot(): readonly IndicatorInstance[]
    restore(instances: readonly IndicatorInstance[]): void
  }
  disposed(): boolean
  /** Internal widget scope: hydration writes are not user edits. */
  beginHydration?: () => () => void
}

// Private to the content owners, never a method on the public chart handle. A receipt belongs
// to the exact successful restore generation and can only be committed by its containing load.
const recoveryReceipts = new WeakMap<ChartSaveLoadApi, () => (() => void) | undefined>()
export const chartRecoveryReceipt = (api: ChartSaveLoadApi): (() => void) | undefined => recoveryReceipts.get(api)?.()

/** Appearance accepts browser color syntax beyond the theme's measurable hex/rgb palette. Use
 *  the same CSS assignment the renderer consumes, without inserting a node or inheriting a
 *  fallback color when a malformed value was ignored. Context-dependent values cannot prove a
 *  complete saved look. Without a browser, only the portable parser can establish validity. */
function recoveryColor(value: string): boolean {
  if (typeof document === 'undefined') return parseCssColor(value) !== null
  if (/\b(?:var|env)\s*\(|\b(?:currentcolor|inherit|initial|unset|revert(?:-layer)?)\b/i.test(value)) return false
  const style = document.createElement('span').style
  style.color = value
  return style.color !== ''
}

export function createSaveLoadApi(deps: SaveLoadDeps): ChartSaveLoadApi {
  let generation = 0
  let complete = false
  const openChart = openResourceController<ChartMeta, ChartBody>({ store: () => deps.adapter?.charts ?? null, t: () => deps.i18n.t, committed: () => complete })
  const api: ChartSaveLoadApi = {
    adapter: deps.adapter,
    serialize: () => ({ symbol: deps.symbol(), timeframe: deps.timeframe(), content: serializeChartContent(deps.content()) }),
    current: () => openChart.current(),
    notSaving: () => openChart.notSaving(),
    detach: () => openChart.detach(),
    save: (name, opts) =>
      openChart.save({ name, symbol: deps.symbol(), timeframe: deps.timeframe(), content: serializeChartContent(deps.content()) }, opts),
    load: (id, signal) =>
      openChart.load(id, signal, (body) => {
        // A chart torn down while the store was answering has nothing to apply the content to, so
        // the load is cancelled rather than refused, and it binds nothing either way.
        if (deps.disposed()) throw new ResourceAbortError('the chart was disposed during the load')
        api.restore(body.content)
      }),
    remove: (signal) => openChart.remove(signal),
    restore(content) {
      if (deps.disposed()) return
      generation++
      complete = false
      // Read whole before anything moves: an unreadable blob throws here, with the chart untouched.
      const parsed = parseChartContent(content)
      // Everything an apply can move, snapshot before it moves: the blob covers the chart's own
      // content, and the drawing state rides beside it wherever the blob does not carry it.
      const heldContent = deps.content()
      const held = serializeChartContent(heldContent)
      const heldDrawings = deps.heldDrawings?.snapshot() ?? null
      const heldIndicators = deps.heldIndicators?.snapshot() ?? null
      const endHydration = deps.beginHydration?.()
      try {
        const ownersComplete = deps.apply(parsed) !== false
        complete =
          ownersComplete &&
          parsed.symbol !== undefined &&
          parsed.timeframe !== undefined &&
          parsed.style !== undefined &&
          parsed.scale !== undefined &&
          parsed.indicators !== undefined &&
          // Appearance in content is the AUTHORED layer, so an absent leaf is a leaf nobody chose
          // and the theme and host resolve it: absence proves recovery as surely as a value does,
          // and an empty record is a complete statement. What cannot certify recovery is a leaf
          // that is PRESENT and unusable, because the chart would silently keep the old value in
          // its place. Keys and types come from the canonical override owner, not a second schema.
          parsed.appearance !== undefined &&
          Object.entries(DEFAULT_OVERRIDES.appearance).every(([key, sample]) => {
            const value = (parsed.appearance as Record<string, unknown>)[key]
            if (value === undefined) return true
            return typeof sample === 'boolean'
              ? typeof value === 'boolean'
              : typeof value === 'string' && recoveryColor(value)
          }) &&
          // The content owner includes this field precisely in combined mode, even for an empty
          // drawing layer. Separate mode holds its drawings outside this blob and requires none.
          (heldContent.drawings === undefined || parsed.drawings !== undefined) &&
          parsed.compares !== undefined &&
          parsed.ext !== null && typeof parsed.ext === 'object' && !Array.isArray(parsed.ext)
      } catch (error) {
        // Reading the blob cannot prove every field of it lands, so a failure part-way puts the
        // chart back on the content it held. The caller still sees the original refusal.
        try {
          const ownersRestored = deps.apply(parseChartContent(held)) !== false
          if (heldIndicators) deps.heldIndicators!.restore(heldIndicators)
          // Last, because the held content lands the symbol the drawings belong to first.
          if (heldDrawings) deps.heldDrawings!.restore(heldDrawings)
          if (!ownersRestored) throw new Error('an opaque content owner could not certify rollback')
        } catch (rollback) {
          // The chart took neither content whole. That is a different answer from a clean refusal
          // and it is reported as one, rather than left for the trader to notice; and until the
          // chart holds a whole content again, nothing it shows is written anywhere. Set here
          // rather than only on the load path, because a host that applies a blob itself leaves the
          // screen in exactly the same place.
          openChart.stopSaving()
          throw new ResourceRollbackError(error, rollback)
        }
        throw error
      } finally {
        endHydration?.()
      }
    },
  }
  recoveryReceipts.set(api, () => {
    if (!complete) return undefined
    const at = generation
    return () => {
      if (at === generation && !deps.disposed()) openChart.recoverInParent()
    }
  })
  return api
}

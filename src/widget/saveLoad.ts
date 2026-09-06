// Save and load: the chart's own content format, and the open saved chart.
//
// The content blob is contractually OPAQUE to every backend, which is why it carries a version:
// the reader here is the only place an upgrade path can ever live. A save updates the open chart at
// the revision it was opened at, or creates when nothing is open or the host asks for a copy; a
// refusal comes back as a typed outcome with the catalog's copy for the case, and the chart never
// writes over a newer revision.
import type { SerializedDrawing } from '../internal/drawings/index'
import type { ChartBody, ChartMeta, ChartSaveLoadAdapter } from '../resources'
import { openResourceController, type OpenResource, type ResourceLoadOutcome, type ResourceRemoveOutcome, type ResourceSaveOutcome } from '../openResource'
import type { ChartI18n } from '../i18n'
import type { ChartOverrides } from '../overrides'
import type { ScaleMode } from '../scaleMode'
import type { ChartStyleId } from './styles'

/** The save/load surface a host drives. */
export interface ChartSaveLoadApi {
  adapter: ChartSaveLoadAdapter | null
  /** Snapshot the chart's state as a name-less save: symbol and timeframe for the listing row, and
   *  the opaque, versioned content blob. A loaded chart restores its LOOK as well as its data. */
  serialize(): { symbol: string; timeframe: string; content: string }
  /** Apply a saved chart's content blob. Throws on an unrecognized content version. */
  restore(content: string): void
  /** The open saved chart, or null while what is on screen is unsaved. */
  current(): OpenResource | null
  /** Save under `name`: an update of the open chart at its held revision, or a create when nothing
   *  is open or `asNew` asks for a copy. Rejects without an adapter. */
  save(name: string, opts?: { asNew?: boolean; signal?: AbortSignal }): Promise<ResourceSaveOutcome<ChartMeta>>
  /** Open a saved chart: its content is applied and it becomes the open chart. */
  load(id: string, signal?: AbortSignal): Promise<ResourceLoadOutcome<ChartBody>>
  /** Delete the open chart at its held revision. What is on screen stays; its binding detaches. */
  remove(signal?: AbortSignal): Promise<ResourceRemoveOutcome>
  /** Forget the open chart without touching the store: the next save creates. */
  detach(): void
}

/** The chart's saved-content format. Bumping this is the only reason a reader below ever branches. */
export const CHART_CONTENT_VERSION = 3

/** Everything a saved chart carries. */
export interface ChartContent {
  symbol: string
  timeframe: string
  style: ChartStyleId
  scale: ScaleMode
  hidden: readonly string[]
  appearance: ChartOverrides['appearance']
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
    hidden: [...content.hidden],
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
  hidden?: string[]
  appearance?: Partial<ChartOverrides['appearance']>
  compares?: unknown
  drawings?: SerializedDrawing[]
  ext?: unknown
}

/** Read a stored blob. Throws on a version this build does not recognize, which is the contract:
 *  the blob is opaque to the backend, so refusing loudly is the only safe answer. */
export function parseChartContent(content: string): ParsedChartContent {
  const raw = JSON.parse(content) as Record<string, unknown>
  if (raw.v !== CHART_CONTENT_VERSION) throw new Error(`unsupported chart content version ${String(raw.v)}`)
  return {
    symbol: typeof raw.symbol === 'string' && raw.symbol ? raw.symbol : undefined,
    timeframe: typeof raw.tf === 'string' && raw.tf ? raw.tf : undefined,
    style: typeof raw.style === 'string' ? raw.style : undefined,
    scale: typeof raw.scale === 'string' ? raw.scale : undefined,
    hidden: Array.isArray(raw.hidden) ? raw.hidden.filter((v): v is string => typeof v === 'string') : undefined,
    appearance: raw.appearance && typeof raw.appearance === 'object' ? (raw.appearance as Partial<ChartOverrides['appearance']>) : undefined,
    drawings: Array.isArray(raw.drawings) ? (raw.drawings as SerializedDrawing[]) : undefined,
    compares: raw.compares,
    ext: raw.ext,
  }
}

export interface SaveLoadDeps {
  adapter: ChartSaveLoadAdapter | null
  i18n: ChartI18n
  symbol(): string
  timeframe(): string
  content(): ChartContent
  apply(parsed: ParsedChartContent): void
  disposed(): boolean
}

export function createSaveLoadApi(deps: SaveLoadDeps): ChartSaveLoadApi {
  const openChart = openResourceController<ChartMeta, ChartBody>({ store: () => deps.adapter?.charts ?? null, t: () => deps.i18n.t })
  const api: ChartSaveLoadApi = {
    adapter: deps.adapter,
    serialize: () => ({ symbol: deps.symbol(), timeframe: deps.timeframe(), content: serializeChartContent(deps.content()) }),
    current: () => openChart.current(),
    detach: () => openChart.detach(),
    save: (name, opts) =>
      openChart.save({ name, symbol: deps.symbol(), timeframe: deps.timeframe(), content: serializeChartContent(deps.content()) }, opts),
    async load(id, signal) {
      const outcome = await openChart.load(id, signal)
      if (outcome.kind === 'ok' && !deps.disposed()) api.restore(outcome.body.content)
      return outcome
    },
    remove: (signal) => openChart.remove(signal),
    restore(content) {
      if (deps.disposed()) return
      deps.apply(parseChartContent(content))
    },
  }
  return api
}

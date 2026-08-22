// The save/load seam — the TYPED, entity-aware persistence adapter beside the flat ChartStorage KV.
// A host that wants named charts, symbol-scoped drawings, or named templates implements THIS and
// plugs it in (`ChartWidgetOptions.saveLoad`), exactly the posture TradingView's save_load_adapter
// set: the chart consumes the interface, the backend is the host's. The trdrs engine is the
// reference implementation, never a dependency — the default here layers the same entities onto a
// plain ChartStorage so a host with no backend still gets working local save/load.
//
// Content values (`ChartSaveData.content`, drawing state, template content) are contractually
// OPAQUE to the adapter — no parsing, no per-entity logic — so the chart can evolve its formats
// freely. The corollary is that every content format must carry its own client-side upgrade path
// (a version stamp the reader migrates from), because no backend will ever migrate a blob for us.
import type { ChartStorage } from './storage'

/** A saved chart's listing row — everything a load dialog shows without fetching content. */
export interface ChartMeta {
  id: string
  name: string
  symbol: string
  timeframe: string
  /** Last save, ms since epoch (server-stamped by real backends). */
  updatedAt: number
}

/** What a save carries. `content` is the chart's own serialized state, opaque to the adapter. */
export interface ChartSaveData {
  name: string
  symbol: string
  timeframe: string
  content: string
}

/** Where a drawings document lives. `symbol` alone is the shared scope — the same lines on every
 *  chart of that symbol (the TV `GloballyShared` default); `chartId` binds a copy to one saved
 *  chart instead. */
export interface DrawingScope {
  symbol: string
  chartId?: string
}

export type TemplateKind = 'study' | 'drawing' | 'palette'

/** A named template's listing row. `tool` scopes DRAWING templates to their tool (a trend-line
 *  template is meaningless on a rectangle); study and palette templates carry no tool. */
export interface TemplateMeta {
  name: string
  tool?: string
  updatedAt: number
}

/** Named-template CRUD for one kind. Saving an existing (name, tool) overwrites it. */
export interface TemplateStore {
  list(): Promise<TemplateMeta[]>
  save(name: string, content: string, tool?: string): Promise<void>
  load(name: string, tool?: string): Promise<string | null>
  remove(name: string, tool?: string): Promise<void>
}

/** The full adapter a host implements. Entity methods may reject (a real backend can fail); the
 *  chart surfaces those failures instead of guessing. `settings` is the flat KV the widget's own
 *  sticky state flows through — it subsumes a separately-supplied ChartStorage. */
export interface ChartSaveLoadAdapter {
  /** Saved-chart listing, meta only — content loads by id. */
  listCharts(): Promise<ChartMeta[]>
  /** Create (no `id`) or overwrite (`id` given) a saved chart; resolves with the chart's id. */
  saveChart(data: ChartSaveData, id?: string): Promise<string>
  /** A saved chart's content blob. Rejects when the id is unknown. */
  loadChart(id: string): Promise<string>
  removeChart(id: string): Promise<void>
  /** Persist / fetch a drawings document for a scope. `null` = nothing stored there yet. */
  saveDrawings(scope: DrawingScope, state: string): Promise<void>
  loadDrawings(scope: DrawingScope): Promise<string | null>
  templates(kind: TemplateKind): TemplateStore
  settings: ChartStorage
}

/* ── The default: the entities layered on a plain ChartStorage ─────────────────────────────────
   One index document per entity family plus one key per content blob, so listing never loads
   content and removing a chart cannot orphan its meta. Keys embed user text (names, symbols)
   encoded, because a ChartStorage backend only promises opaque STRING keys. */

const CHARTS_INDEX_KEY = 'trdrs.chart.saveload.charts.v1'
const chartContentKey = (id: string) => `trdrs.chart.saveload.chart.v1:${id}`
const drawingsKey = (scope: DrawingScope) =>
  `trdrs.chart.saveload.drawings.v1:${encodeURIComponent(scope.symbol)}${scope.chartId ? `:${encodeURIComponent(scope.chartId)}` : ''}`
const templatesKey = (kind: TemplateKind) => `trdrs.chart.saveload.templates.v1:${kind}`
/** Composite template key inside a kind's document — NUL-joined so a tool name containing any
 *  printable separator can never collide with a template name. */
const templateEntryKey = (name: string, tool?: string) => (tool ? `${tool}\u0000${name}` : name)

interface TemplateEntry {
  content: string
  updatedAt: number
}

function readJson<T>(kv: ChartStorage, key: string, fallback: T): T {
  try {
    const raw = kv.get(key)
    return raw == null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

/** The default ChartSaveLoadAdapter: every entity stored through the given ChartStorage. With the
 *  browser-localStorage store this is per-device persistence — the same reach the widget always
 *  had — which is exactly why absence of a host adapter changes nothing. */
export function storageSaveLoadAdapter(kv: ChartStorage): ChartSaveLoadAdapter {
  const readIndex = (): ChartMeta[] => {
    const parsed = readJson<unknown>(kv, CHARTS_INDEX_KEY, [])
    return Array.isArray(parsed)
      ? parsed.filter(
          (r): r is ChartMeta =>
            typeof r === 'object' &&
            r !== null &&
            typeof (r as ChartMeta).id === 'string' &&
            typeof (r as ChartMeta).name === 'string' &&
            typeof (r as ChartMeta).symbol === 'string' &&
            typeof (r as ChartMeta).timeframe === 'string' &&
            typeof (r as ChartMeta).updatedAt === 'number',
        )
      : []
  }
  const writeIndex = (rows: ChartMeta[]): void => kv.set(CHARTS_INDEX_KEY, JSON.stringify(rows))

  return {
    listCharts: () => Promise.resolve(readIndex()),
    saveChart: (data, id) => {
      const rows = readIndex()
      const finalId = id ?? (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`)
      const meta: ChartMeta = { id: finalId, name: data.name, symbol: data.symbol, timeframe: data.timeframe, updatedAt: Date.now() }
      const at = rows.findIndex((r) => r.id === finalId)
      if (at >= 0) rows[at] = meta
      else rows.push(meta)
      kv.set(chartContentKey(finalId), data.content)
      writeIndex(rows)
      return Promise.resolve(finalId)
    },
    loadChart: (id) => {
      const content = kv.get(chartContentKey(id))
      return content == null ? Promise.reject(new Error(`no saved chart '${id}'`)) : Promise.resolve(content)
    },
    removeChart: (id) => {
      kv.remove(chartContentKey(id))
      writeIndex(readIndex().filter((r) => r.id !== id))
      return Promise.resolve()
    },
    saveDrawings: (scope, state) => {
      kv.set(drawingsKey(scope), state)
      return Promise.resolve()
    },
    loadDrawings: (scope) => Promise.resolve(kv.get(drawingsKey(scope))),
    templates: (kind) => {
      const key = templatesKey(kind)
      const read = (): Record<string, TemplateEntry> => {
        const parsed = readJson<unknown>(kv, key, {})
        return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, TemplateEntry>) : {}
      }
      return {
        list: () =>
          Promise.resolve(
            Object.entries(read()).map(([entry, v]) => {
              const nul = entry.indexOf('\u0000')
              return nul >= 0
                ? { name: entry.slice(nul + 1), tool: entry.slice(0, nul), updatedAt: v.updatedAt }
                : { name: entry, updatedAt: v.updatedAt }
            }),
          ),
        save: (name, content, tool) => {
          const doc = read()
          doc[templateEntryKey(name, tool)] = { content, updatedAt: Date.now() }
          kv.set(key, JSON.stringify(doc))
          return Promise.resolve()
        },
        load: (name, tool) => Promise.resolve(read()[templateEntryKey(name, tool)]?.content ?? null),
        remove: (name, tool) => {
          const doc = read()
          delete doc[templateEntryKey(name, tool)]
          kv.set(key, JSON.stringify(doc))
          return Promise.resolve()
        },
      }
    },
    settings: kv,
  }
}

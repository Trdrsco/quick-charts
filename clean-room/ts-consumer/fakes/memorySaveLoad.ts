// In-memory persistence a consumer owns outright: a ChartStorage for flat viewer preferences and a
// ChartSaveLoadAdapter over the revisioned resource contract for saved charts, layouts, drawing
// documents and templates. Nothing persists past the page and nothing reaches a
// server, which is the clean-room point. Written
// against the shipped d.ts, not the package's own memorySaveLoadAdapter, so the contract is proven
// implementable from outside: every listing row carries its ref, every write is conditional on
// the revision it quotes, and a stale write answers a typed conflict rather than overwriting.
import type {
  ChartBody,
  ChartMeta,
  ChartSaveLoadAdapter,
  ChartStorage,
  DrawingResourceContext,
  DrawingsBody,
  DrawingsMeta,
  LayoutBody,
  LayoutMeta,
  ResourceRef,
  ResourceStore,
  TemplateBody,
  TemplateKind,
  TemplateMeta,
  WriteOutcome,
} from 'quickcharts'
import { drawingContextKey } from 'quickcharts'

/** A ChartStorage over a Map. Never throws: an absent key reads as null, and every write lands. */
export function memoryStorage(seed?: Record<string, string>): ChartStorage {
  const map = new Map<string, string>(seed ? Object.entries(seed) : [])
  return {
    get: (key) => map.get(key) ?? null,
    set: (key, value) => void map.set(key, value),
    remove: (key) => void map.delete(key),
    keys: () => [...map.keys()],
  }
}

interface Row<Body> {
  ref: ResourceRef
  body: Body
  updatedAt: number
}

/** One family: a Map of rows keyed by id, revisions counted per store, conflicts on a stale ref.
 *  `metaOf` shapes the listing row; `collides` names a sibling a create must not duplicate (a
 *  drawings scope holds one document; a template name is unique per tool). */
function memoryStore<Meta, Body>(deps: {
  clock: () => number
  metaOf: (row: Row<Body>) => Meta
  collides?: (rows: Row<Body>[], body: Body) => Row<Body> | undefined
}): ResourceStore<Meta, Body> {
  const rows = new Map<string, Row<Body>>()
  let ids = 0
  let revisions = 0
  const nextRef = (id: string): ResourceRef => ({ id, revision: `r${++revisions}` })
  const rejectIfAborted = (signal?: AbortSignal): void => {
    if (signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' })
  }
  return {
    async list(signal) {
      rejectIfAborted(signal)
      return [...rows.values()].sort((a, b) => b.updatedAt - a.updatedAt).map(deps.metaOf)
    },
    async load(id, signal) {
      rejectIfAborted(signal)
      const row = rows.get(id)
      return row ? { ref: { ...row.ref }, body: row.body } : null
    },
    async create(body, signal): Promise<WriteOutcome<Meta>> {
      rejectIfAborted(signal)
      const sibling = deps.collides?.([...rows.values()], body)
      if (sibling) return { kind: 'conflict', current: { ...sibling.ref } }
      const row: Row<Body> = { ref: nextRef(`id-${++ids}`), body, updatedAt: deps.clock() }
      rows.set(row.ref.id, row)
      return { kind: 'ok', ref: { ...row.ref }, value: deps.metaOf(row) }
    },
    async update(ref, body, signal): Promise<WriteOutcome<Meta>> {
      rejectIfAborted(signal)
      const row = rows.get(ref.id)
      if (!row) return { kind: 'not-found' }
      if (row.ref.revision !== ref.revision) return { kind: 'conflict', current: { ...row.ref } }
      row.ref = nextRef(ref.id)
      row.body = body
      row.updatedAt = deps.clock()
      return { kind: 'ok', ref: { ...row.ref }, value: deps.metaOf(row) }
    },
    async remove(ref, signal): Promise<WriteOutcome<void>> {
      rejectIfAborted(signal)
      const row = rows.get(ref.id)
      if (!row) return { kind: 'not-found' }
      if (row.ref.revision !== ref.revision) return { kind: 'conflict', current: { ...row.ref } }
      rows.delete(ref.id)
      return { kind: 'ok', ref: { ...row.ref } }
    },
  }
}

export interface MemorySaveLoadOptions {
  /** The clock for updatedAt stamps, epoch milliseconds. */
  clock?: () => number
}

export function memorySaveLoad(options: MemorySaveLoadOptions = {}): ChartSaveLoadAdapter {
  const clock = options.clock ?? (() => Date.now())
  const drawingStores = new Map<string, ResourceStore<DrawingsMeta, DrawingsBody>>()
  const templateStores = new Map<TemplateKind, ResourceStore<TemplateMeta, TemplateBody>>()
  return {
    charts: memoryStore<ChartMeta, ChartBody>({
      clock,
      metaOf: (r) => ({ ...r.ref, name: r.body.name, symbol: r.body.symbol, timeframe: r.body.timeframe, updatedAt: r.updatedAt }),
    }),
    layouts: memoryStore<LayoutMeta, LayoutBody>({ clock, metaOf: (r) => ({ ...r.ref, name: r.body.name, updatedAt: r.updatedAt }) }),
    drawings(context: DrawingResourceContext) {
      const key = drawingContextKey(context)
      let store = drawingStores.get(key)
      if (!store) {
        // A context holds ONE document: a second create answers the first document's ref.
        store = memoryStore<DrawingsMeta, DrawingsBody>({ clock, metaOf: (r) => ({ ...r.ref, updatedAt: r.updatedAt }), collides: (rows) => rows[0] })
        drawingStores.set(key, store)
      }
      return store
    },
    templates(kind) {
      let store = templateStores.get(kind)
      if (!store) {
        store = memoryStore<TemplateMeta, TemplateBody>({
          clock,
          metaOf: (r) => (r.body.tool === undefined ? { ...r.ref, name: r.body.name, updatedAt: r.updatedAt } : { ...r.ref, name: r.body.name, tool: r.body.tool, updatedAt: r.updatedAt }),
          collides: (rows, body) => rows.find((r) => r.body.name === body.name && r.body.tool === body.tool),
        })
        templateStores.set(kind, store)
      }
      return store
    },
  }
}

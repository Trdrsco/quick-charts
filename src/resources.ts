// SAVED RESOURCES — the revisioned, async persistence contract for the entities a chart names and
// a user can lose: saved charts, layouts, drawing documents, and templates.
//
// The contract exists because a saved chart is shared, mutable, remote state. Two tabs, two
// devices, or one slow save and one fast one all end at the same question: whose version wins?
// A store that answers "the last write" silently destroys work. So every read hands back a
// `ResourceRef` (a stable id plus an opaque revision token), every write states the revision it
// believes it is replacing, and a write against a stale revision comes back as a typed `conflict`
// carrying the current ref. The chart never resolves that by overwriting; it surfaces it.
//
// Three rules the shape enforces:
//   - The revision is OPAQUE. It is a token the host minted and the chart only ever echoes back.
//     No ordering, no arithmetic, no timestamp parsing; a host is free to use an ETag, a counter,
//     or a content hash.
//   - Every call takes an `AbortSignal`. A symbol switch, a closed dialog, or a fast retype must be
//     able to abandon in-flight work, and a late answer to an abandoned ask must never land.
//   - A successful write RETURNS the stored revision, so the caller's next write is conditional on
//     what the store actually holds rather than on what it hoped it wrote.
//
// A chart's, a layout's and a template's body is contractually OPAQUE to the store: no parsing, no
// per-entity logic, so the chart can evolve those formats freely. The drawings family is the one
// deliberate exception: its body is the structured document in `drawings/document.ts`, because
// deletion tombstones, ordered groups and per-drawing ownership have to survive a merge between two
// surfaces, and a merge cannot be performed over a string. Each drawing's own state stays opaque
// inside its entry.
//
// Flat viewer preferences that need no entity identity are NOT here; they stay on `ChartStorage`,
// the small settings port beside this one.
import type { DrawingResourceContext, DrawingsBody } from './drawings/document'
import { drawingContextKey } from './drawings/document'

/** A resource's identity plus the exact version this reader saw. A write quotes it back. */
export interface ResourceRef {
  id: string
  /** Opaque to the chart: minted by the store, compared only for equality. */
  revision: string
}

/** What a write did. `ok` carries the ref the store now holds (and, where the store computes one,
 *  the resulting metadata); `conflict` carries the ref that beat this write, so a caller can reload
 *  and re-decide; `not-found` means the id is gone. */
export type WriteOutcome<T = void> =
  | { kind: 'ok'; ref: ResourceRef; value?: T }
  | { kind: 'conflict'; current: ResourceRef }
  | { kind: 'not-found' }

/** One family of resources. `Meta` is the listing row a picker shows without fetching content
 *  (it carries the row's ref, so a picker can delete or open a row without a second read); `Body`
 *  is the stored document. */
export interface ResourceStore<Meta, Body> {
  /** Listing rows, metadata only. */
  list(signal?: AbortSignal): Promise<Meta[]>
  /** The stored document and the revision it was read at, or null when the id is unknown. */
  load(id: string, signal?: AbortSignal): Promise<{ ref: ResourceRef; body: Body } | null>
  /** Store a new document. The store mints the id; a create conflicts only where the store keys a
   *  document by identity and one already stands there (a drawings context that holds a document, a
   *  name already taken), and then it answers the ref that stands. */
  create(body: Body, signal?: AbortSignal): Promise<WriteOutcome<Meta>>
  /** Replace the document at `ref.id`, but only while it still stands at `ref.revision`. */
  update(ref: ResourceRef, body: Body, signal?: AbortSignal): Promise<WriteOutcome<Meta>>
  /** Delete the document at `ref.id`, but only while it still stands at `ref.revision`. */
  remove(ref: ResourceRef, signal?: AbortSignal): Promise<WriteOutcome<void>>
}

/** A saved chart's listing row. */
export interface ChartMeta extends ResourceRef {
  name: string
  symbol: string
  timeframe: string
  /** Last save, ms since epoch (server-stamped by real backends). */
  updatedAt: number
}

/** A saved chart. `content` is the chart's own serialized state, opaque to the store. */
export interface ChartBody {
  name: string
  symbol: string
  timeframe: string
  content: string
}

/** A saved multi-chart layout's listing row. */
export interface LayoutMeta extends ResourceRef {
  name: string
  updatedAt: number
}

export interface LayoutBody {
  name: string
  content: string
}

/** A drawings document's listing row. A context holds at most one, so `list` returns zero rows or
 *  one, and the ref is the store's handle on it. */
export interface DrawingsMeta extends ResourceRef {
  updatedAt: number
}

export type TemplateKind = 'study' | 'drawing' | 'palette'

/** A named template's listing row. `tool` scopes DRAWING templates to their tool (a trend-line
 *  template is meaningless on a rectangle); study and palette templates carry no tool. */
export interface TemplateMeta extends ResourceRef {
  name: string
  tool?: string
  updatedAt: number
}

export interface TemplateBody {
  name: string
  tool?: string
  content: string
}

/** The adapter a host implements: four resource families over one revisioned contract. Viewer
 *  settings are deliberately absent; they belong to `ChartStorage`. */
export interface ChartSaveLoadAdapter {
  charts: ResourceStore<ChartMeta, ChartBody>
  layouts: ResourceStore<LayoutMeta, LayoutBody>
  /** The store for one drawing-resource context. Calling with an equal context returns an
   *  equivalent store; `drawingContextKey` is the canonical way to compare two. */
  drawings(context: DrawingResourceContext): ResourceStore<DrawingsMeta, DrawingsBody>
  templates(kind: TemplateKind): ResourceStore<TemplateMeta, TemplateBody>
}

/** The error every store rejects with when its signal aborts. `name` is 'AbortError', which is what
 *  callers branch on, and what `DOMException` uses, so a host may reject with either. */
export class ResourceAbortError extends Error {
  override readonly name = 'AbortError'
  constructor(message = 'the resource operation was aborted') {
    super(message)
  }
}

/* ── The in-memory reference implementation ────────────────────────────────────────────────────
   The shape's own proof and the fixture every consumer test mounts: revisions on every write,
   conflicts on a stale ref, not-found on a vanished id, and an abort that lands before any state
   changes. It persists nothing, so it is also the right adapter for SSR, an ephemeral embed, and
   the clean-room consumer. */

interface Record_<Body> {
  id: string
  revision: string
  body: Body
  updatedAt: number
}

/** An aborted signal REJECTS the returned promise rather than throwing out of the call, so every
 *  caller handles abandonment on one path. */
const aborted = (signal: AbortSignal | undefined): Promise<never> | null =>
  signal?.aborted ? Promise.reject(new ResourceAbortError()) : null

const newId = (): string =>
  typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

/** Options for {@link memorySaveLoadAdapter}: a clock, so a test can pin `updatedAt`. */
export interface MemoryResourcesOptions {
  now?: () => number
}

function memoryStore<Meta, Body>(
  metaOf: (record: Record_<Body>) => Meta,
  now: () => number,
): ResourceStore<Meta, Body> {
  const rows = new Map<string, Record_<Body>>()
  let counter = 0
  const nextRevision = (): string => `rev-${++counter}`
  const refOf = (record: Record_<Body>): ResourceRef => ({ id: record.id, revision: record.revision })

  return {
    list(signal) {
      return aborted(signal) ?? Promise.resolve([...rows.values()].map(metaOf))
    },
    load(id, signal) {
      const stop = aborted(signal)
      if (stop) return stop
      const record = rows.get(id)
      return Promise.resolve(record ? { ref: refOf(record), body: record.body } : null)
    },
    create(body, signal) {
      const stop = aborted(signal)
      if (stop) return stop
      const record: Record_<Body> = { id: newId(), revision: nextRevision(), body, updatedAt: now() }
      rows.set(record.id, record)
      const outcome: WriteOutcome<Meta> = { kind: 'ok', ref: refOf(record), value: metaOf(record) }
      return Promise.resolve(outcome)
    },
    update(ref, body, signal) {
      const stop = aborted(signal)
      if (stop) return stop
      const record = rows.get(ref.id)
      if (!record) return Promise.resolve<WriteOutcome<Meta>>({ kind: 'not-found' })
      if (record.revision !== ref.revision) return Promise.resolve<WriteOutcome<Meta>>({ kind: 'conflict', current: refOf(record) })
      record.body = body
      record.revision = nextRevision()
      record.updatedAt = now()
      const outcome: WriteOutcome<Meta> = { kind: 'ok', ref: refOf(record), value: metaOf(record) }
      return Promise.resolve(outcome)
    },
    remove(ref, signal) {
      const stop = aborted(signal)
      if (stop) return stop
      const record = rows.get(ref.id)
      if (!record) return Promise.resolve<WriteOutcome<void>>({ kind: 'not-found' })
      if (record.revision !== ref.revision) return Promise.resolve<WriteOutcome<void>>({ kind: 'conflict', current: refOf(record) })
      rows.delete(ref.id)
      return Promise.resolve<WriteOutcome<void>>({ kind: 'ok', ref: refOf(record) })
    },
  }
}

/** An in-memory {@link ChartSaveLoadAdapter}. Each drawing context and each template kind gets its
 *  own store, created on first ask and kept, so two calls for one context see the same document. */
export function memorySaveLoadAdapter(options?: MemoryResourcesOptions): ChartSaveLoadAdapter {
  const now = options?.now ?? (() => Date.now())
  const drawingStores = new Map<string, ResourceStore<DrawingsMeta, DrawingsBody>>()
  const templateStores = new Map<TemplateKind, ResourceStore<TemplateMeta, TemplateBody>>()

  return {
    charts: memoryStore<ChartMeta, ChartBody>(
      (r) => ({ id: r.id, revision: r.revision, name: r.body.name, symbol: r.body.symbol, timeframe: r.body.timeframe, updatedAt: r.updatedAt }),
      now,
    ),
    layouts: memoryStore<LayoutMeta, LayoutBody>((r) => ({ id: r.id, revision: r.revision, name: r.body.name, updatedAt: r.updatedAt }), now),
    drawings(context) {
      const key = drawingContextKey(context)
      let store = drawingStores.get(key)
      if (!store) {
        store = memoryStore<DrawingsMeta, DrawingsBody>((r) => ({ id: r.id, revision: r.revision, updatedAt: r.updatedAt }), now)
        drawingStores.set(key, store)
      }
      return store
    },
    templates(kind) {
      let store = templateStores.get(kind)
      if (!store) {
        store = memoryStore<TemplateMeta, TemplateBody>(
          (r) => ({ id: r.id, revision: r.revision, name: r.body.name, ...(r.body.tool === undefined ? {} : { tool: r.body.tool }), updatedAt: r.updatedAt }),
          now,
        )
        templateStores.set(kind, store)
      }
      return store
    },
  }
}

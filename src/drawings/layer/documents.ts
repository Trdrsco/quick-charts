// The drawings documents: ONE revisioned document per symbol, in the drawing-resource context the
// layer was attached with.
//
// The context decides who shares the document (this chart alone, every chart of the layout, or
// every chart of the symbol), so this module never has to guess: it reads its context's document
// once per symbol activation, writes it back at the ref it was read at, and never writes over a
// newer revision. A refused write MERGES the stored document over this layer's own (the other
// surface's rows and both sides' tombstones win, this layer's additions follow), re-imports the
// merge when the symbol is still up, adopts the ref that stands, and writes once more; the host
// hears the conflict either way.
//
// Without a document port the layer keeps its documents in memory for the page. That is the
// COMBINED mode: the chart's own save carries the drawings, and nothing here writes anywhere.
//
// Writes are debounced onto idle time (an image-bearing document stringifies megabytes, never
// inside a pointer gesture) and flushed on pagehide and destroy so a scheduled write survives the
// tab closing under it.
import type { SerializedDrawing } from '@trdrs/chart-drawings'
import type { DrawingEntry, DrawingResourceContext, DrawingsBody } from '../document'
import { DRAWING_CONTEXT_VERSION, drawingBuried, emptyDrawingDocument, liveDrawingEntries, mergeDrawingDocuments, parseDrawingDocument, reviseDrawingDocument } from '../document'
import type { DrawingsMeta, ResourceRef, ResourceStore } from '../../resources'
import { ownsDrawing } from './scope'

/** Where a layer's separate-drawing documents live: which context a symbol's document is keyed by,
 *  and the store for that context. Both together or neither, so a layer is never half-configured. */
export interface DrawingDocumentPort {
  context(symbol: string): DrawingResourceContext
  store(context: DrawingResourceContext): ResourceStore<DrawingsMeta, DrawingsBody>
}

/** What the layer draws on, as an entry records it: the source that owns a drawing and the pane it
 *  is drawn in. One layer draws in one pane over one source, which is why a restore can refuse a
 *  row that names another one instead of quietly moving the drawing somewhere it fits. */
export interface DrawingOwner {
  source: string
  pane: string
}

export interface DocumentsDeps {
  /** Absent: combined mode. The documents last the page and no store is ever called. */
  port?: DrawingDocumentPort
  owner: DrawingOwner
  /** This chart's identity for rows bound to one chart inside a SHARED document. */
  chartId?: string
  /** The symbol currently on screen. */
  current(): string
  /** The stored document for the current symbol landed (a hydration or a merge): repaint from it. */
  onDocument(symbol: string, list: SerializedDrawing[]): void
  onConflict(info: { symbol: string; current: ResourceRef | null }): void
}

export interface Documents {
  /** The context a symbol's document is keyed by, or null in combined mode. */
  contextFor(symbol: string): DrawingResourceContext | null
  /** The rows this chart shows for a symbol: the document's live entries this layer draws. */
  listFor(symbol: string): SerializedDrawing[]
  /** The whole working document for a symbol, as this layer holds it. */
  documentFor(symbol: string): DrawingsBody
  /** Replace the cache for a symbol from the screen's export. Every live row this layer does not
   *  draw is kept untouched, so a write never erases another chart's or another pane's work, and
   *  rows that vanished from the screen are buried, so a deletion survives the next merge. */
  sync(symbol: string, exported: readonly SerializedDrawing[]): void
  /** Read a symbol's stored document once, into the cache. */
  hydrate(symbol: string): void
  /** Read the stored document straight from the store, without touching the cache. Null in
   *  combined mode. Named `read`, never `fetch`: nothing in the package may read as a network
   *  call, and the packed-artifact scan holds that line. */
  read(symbol: string, signal?: AbortSignal): Promise<{ ref: ResourceRef | null; document: DrawingsBody } | null>
  /** Take a document as this layer's own for a symbol, at the ref it was read at. */
  adopt(symbol: string, document: DrawingsBody, ref: ResourceRef | null): void
  /** Schedule a write of a symbol's document. */
  persist(symbol: string): void
  /** Write anything scheduled now. */
  flush(): void
  /** The current request generation. A caller that awaits anything captures this first and drops
   *  its answer when the number has moved. */
  generation(): number
  /** A symbol switched away: in-flight reads aimed at the old one stop counting. */
  bumpEpoch(): void
  destroy(): void
}

/** A serialized drawing as a document entry: the envelope a restore validates, with the drawing
 *  itself carried opaquely inside it. */
const entryOf = (row: SerializedDrawing, owner: DrawingOwner): DrawingEntry => ({
  id: row.id,
  source: owner.source,
  pane: owner.pane,
  type: row.type,
  state: row,
})

/** The drawing inside an entry, when the entry carries one this build can read. */
export const drawingOf = (entry: DrawingEntry): SerializedDrawing | null => {
  const state = entry.state
  if (typeof state !== 'object' || state === null) return null
  const row = state as SerializedDrawing
  return typeof row.id === 'string' && typeof row.type === 'string' ? row : null
}

export function createDocuments(deps: DocumentsDeps): Documents {
  const { port, owner, chartId } = deps
  /** The working document per symbol. */
  const docs = new Map<string, DrawingsBody>()
  /** The ref each stored document was last seen at (null = known absent, absent = not read yet). */
  const refs = new Map<string, ResourceRef | null>()
  /** Symbols the trader edited this session: a hydration landing after an edit never replaces
   *  in-hand work. */
  const touched = new Set<string>()
  const pending = new Set<string>()
  let epoch = 0
  let destroyed = false
  let writeChain: Promise<void> = Promise.resolve()
  let timer: ReturnType<typeof setTimeout> | null = null
  let idle: number | null = null

  const contextFor = (symbol: string): DrawingResourceContext | null => port?.context(symbol) ?? null

  const documentFor = (symbol: string): DrawingsBody => {
    const held = docs.get(symbol)
    if (held) return held
    // In combined mode there is no context to key by, and the document never leaves this page; the
    // symbol-global shape is the honest description of a document nobody else can see.
    const fresh = emptyDrawingDocument(contextFor(symbol) ?? { version: DRAWING_CONTEXT_VERSION, kind: 'symbol-global', symbol })
    docs.set(symbol, fresh)
    return fresh
  }

  const owned = (entry: DrawingEntry): boolean => {
    const row = drawingOf(entry)
    return row ? ownsDrawing(row, chartId) : false
  }

  /** Whether this layer PAINTS an entry: it is this chart's, it is drawn on the source and pane
   *  this layer draws, its state is a drawing this build can read, and its group still exists.
   *  Anything else is somebody else's row in a document this layer merely shares, which is why the
   *  same question decides both what the layer shows and what a save may replace. */
  const drawnHere = (document: DrawingsBody, entry: DrawingEntry): boolean =>
    owned(entry) &&
    entry.source === owner.source &&
    entry.pane === owner.pane &&
    !(entry.group !== undefined && drawingBuried(document, 'group', entry.group))

  const listFor = (symbol: string): SerializedDrawing[] => {
    const document = documentFor(symbol)
    return liveDrawingEntries(document)
      .filter((entry) => drawnHere(document, entry))
      .map(drawingOf)
      .filter((row): row is SerializedDrawing => row !== null)
  }

  /** Replace what this layer draws and keep everything else exactly as the document states it.
   *
   *  The kept rows are the point: a study pane's drawing, another chart's row inside a shared
   *  document, a row this build cannot read, and a row whose group was deleted are all live
   *  entries this layer never had on screen. Dropping them here would bury them, because a save
   *  states the whole document and every id it no longer lists is a deletion. So they are carried
   *  through in the document's own order, with the group each one states, and only the rows this
   *  layer draws are replaced by the export. */
  const sync = (symbol: string, exported: readonly SerializedDrawing[]): void => {
    const document = documentFor(symbol)
    const live = new Set(liveDrawingEntries(document).map((entry) => entry.id))
    const kept: DrawingEntry[] = []
    const seen = new Set<string>()
    for (const entry of document.entries) {
      if (!live.has(entry.id) || seen.has(entry.id)) continue
      seen.add(entry.id)
      if (!drawnHere(document, entry)) kept.push(entry)
    }
    docs.set(symbol, reviseDrawingDocument(document, { entries: [...kept, ...exported.map((row) => entryOf(row, owner))] }))
  }

  const storeFor = (symbol: string): ResourceStore<DrawingsMeta, DrawingsBody> | null => {
    const context = contextFor(symbol)
    return context && port ? port.store(context) : null
  }

  /** Write a symbol's document at the ref it is held at: an update at that ref, a create when none
   *  is stored. A refused write merges and writes once more.
   *
   *  A document with nothing live in it is still written when it buries something: the tombstones
   *  ARE its value, and deleting the row would let another surface's copy put every deleted
   *  drawing back on its next merge. */
  const upload = (symbol: string, retry: boolean): void => {
    const store = storeFor(symbol)
    if (!store) return
    writeChain = writeChain
      .then(async () => {
        const ref = refs.get(symbol)
        if (ref === undefined) return // not hydrated yet: the hydration that lands uploads a touched symbol
        const document = documentFor(symbol)
        if (!ref && document.entries.length === 0 && document.groups.length === 0 && document.tombstones.length === 0) return
        const outcome = ref ? await store.update(ref, document) : await store.create(document)
        if (outcome.kind === 'ok') refs.set(symbol, outcome.ref)
        else if (outcome.kind === 'conflict') await adopt(symbol, outcome.current, retry)
        else {
          // The document was deleted under this layer. What is on screen is the only copy left, so
          // the next write creates it again, and the host is told the write was refused.
          refs.set(symbol, null)
          deps.onConflict({ symbol, current: null })
        }
      })
      .catch(() => {
        /* transport failure: the cache holds the truth and the next edit retries */
      })
  }

  /** A refused write: take the stored document in, merge this layer's over it, repaint when the
   *  symbol is up, and write the merge once at the ref that stands. */
  const adopt = async (symbol: string, current: ResourceRef, retry: boolean): Promise<void> => {
    refs.set(symbol, current)
    const store = storeFor(symbol)
    const context = contextFor(symbol)
    if (!store || !context) return
    const found = await store.load(current.id)
    if (destroyed) return
    const stored = found ? parseDrawingDocument(found.body, context) : emptyDrawingDocument(context)
    if (found) refs.set(symbol, found.ref)
    docs.set(symbol, mergeDrawingDocuments(stored, documentFor(symbol)))
    deps.onConflict({ symbol, current })
    if (deps.current() === symbol) deps.onDocument(symbol, listFor(symbol))
    if (retry) upload(symbol, false)
  }

  const read = async (symbol: string, signal?: AbortSignal): Promise<{ ref: ResourceRef | null; document: DrawingsBody } | null> => {
    const store = storeFor(symbol)
    const context = contextFor(symbol)
    if (!store || !context) return null
    const row = (await store.list(signal))[0]
    const found = row ? await store.load(row.id, signal) : null
    return { ref: found ? found.ref : null, document: found ? parseDrawingDocument(found.body, context) : emptyDrawingDocument(context) }
  }

  const hydrate = (symbol: string): void => {
    if (!port || refs.has(symbol)) return
    const myEpoch = epoch
    void (async () => {
      try {
        const found = await read(symbol)
        if (destroyed || !found) return
        refs.set(symbol, found.ref)
        if (touched.has(symbol)) {
          upload(symbol, true)
          return
        }
        if (!found.ref) return
        docs.set(symbol, found.document)
        if (myEpoch === epoch && deps.current() === symbol) deps.onDocument(symbol, listFor(symbol))
      } catch {
        /* the layer keeps what it has; the next activation asks again */
      }
    })()
  }

  const writeNow = (): void => {
    if (idle !== null && typeof cancelIdleCallback === 'function') cancelIdleCallback(idle)
    if (timer !== null) clearTimeout(timer)
    idle = null
    timer = null
    const symbols = [...pending]
    pending.clear()
    for (const symbol of symbols) upload(symbol, true)
  }

  const persist = (symbol: string): void => {
    touched.add(symbol)
    pending.add(symbol)
    if (idle !== null || timer !== null) return
    if (typeof requestIdleCallback === 'function') idle = requestIdleCallback(writeNow, { timeout: 1000 })
    else timer = setTimeout(writeNow, 200)
  }

  const flush = (): void => {
    if (pending.size) writeNow()
  }
  window.addEventListener('pagehide', flush)

  return {
    contextFor,
    listFor,
    documentFor,
    sync,
    hydrate,
    read,
    adopt(symbol, document, ref) {
      docs.set(symbol, document)
      refs.set(symbol, ref)
    },
    persist,
    flush,
    generation: () => epoch,
    bumpEpoch: () => {
      epoch++
    },
    destroy() {
      flush()
      destroyed = true
      window.removeEventListener('pagehide', flush)
    },
  }
}

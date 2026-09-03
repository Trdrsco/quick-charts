// The drawings documents: one revisioned document per symbol in the host's drawings family, plus
// one chart-bound document per symbol when drawings are bound to this chart.
//
// Each document is read once per symbol activation, written through at the revision it was read
// at, and never written over a newer revision. A refused write MERGES the stored document over
// this layer's own list (the other surface's rows win, this layer's additions follow), re-imports
// the merge when the symbol is still up, adopts the current ref, and writes once more; the host
// hears the conflict either way. Without a resource port the documents last the page in memory.
//
// Writes are debounced onto idle time (an image-bearing document stringifies megabytes, never
// inside a pointer gesture) and flushed on pagehide and destroy so a scheduled write survives the
// tab closing under it.
import type { SerializedDrawing } from '@trdrs/chart-drawings'
import type { DrawingsBody, DrawingsMeta, ResourceRef, ResourceStore } from '../../resources'
import { mergeStoredDrawings, ownsDrawing } from './scope'

/** Which of a symbol's two documents a row belongs in. */
export type DocumentKind = 'shared' | 'local'

export interface DocumentsDeps {
  resources?: (scope: { symbol: string; chartId?: string }) => ResourceStore<DrawingsMeta, DrawingsBody>
  chartId?: string
  /** The symbol currently on screen. */
  current(): string
  /** The stored document for the current symbol landed (a hydration or a merge): repaint from it. */
  onDocument(symbol: string, list: SerializedDrawing[]): void
  onConflict(info: { symbol: string; current: ResourceRef | null }): void
}

export interface Documents {
  /** The cached rows this chart shows for a symbol, both documents together. */
  listFor(symbol: string): SerializedDrawing[]
  /** Replace the cache for a symbol from the screen's export, splitting rows by scope. Foreign
   *  rows the shared document held are kept, so a write never erases another chart's work. */
  sync(symbol: string, exported: readonly SerializedDrawing[]): void
  /** Read a symbol's stored documents once. */
  hydrate(symbol: string): void
  /** Schedule a write of the current symbol's documents. */
  persist(symbol: string): void
  /** Write anything scheduled now. */
  flush(): void
  /** A symbol switched away: drop in-flight hydrations aimed at the old one. */
  bumpEpoch(): void
  destroy(): void
}

const parseList = (content: string): SerializedDrawing[] => {
  try {
    const parsed: unknown = JSON.parse(content)
    return Array.isArray(parsed) ? (parsed as SerializedDrawing[]) : []
  } catch {
    return []
  }
}

export function createDocuments(deps: DocumentsDeps): Documents {
  const { chartId } = deps
  const storeFor = deps.resources
    ? (symbol: string, kind: DocumentKind) => deps.resources!(kind === 'local' ? { symbol, chartId } : { symbol })
    : null
  /** Every symbol's cached rows per document. */
  const docs: Record<DocumentKind, Record<string, SerializedDrawing[]>> = { shared: {}, local: {} }
  /** The ref each stored document was last seen at (null = known absent). */
  const refs: Record<DocumentKind, Map<string, ResourceRef | null>> = { shared: new Map(), local: new Map() }
  /** Symbols the trader edited this session: a hydration landing after an edit never replaces
   *  in-hand work. */
  const touched = new Set<string>()
  const pending = new Set<string>()
  let epoch = 0
  let destroyed = false
  let writeChain: Promise<void> = Promise.resolve()
  let timer: ReturnType<typeof setTimeout> | null = null
  let idle: number | null = null

  const kinds = (): DocumentKind[] => (chartId ? ['shared', 'local'] : ['shared'])

  const rowsOf = (symbol: string, kind: DocumentKind): SerializedDrawing[] => docs[kind][symbol] ?? []

  const listFor = (symbol: string): SerializedDrawing[] =>
    [...rowsOf(symbol, 'shared').filter((row) => ownsDrawing(row, chartId)), ...rowsOf(symbol, 'local')]

  const setRows = (symbol: string, kind: DocumentKind, rows: SerializedDrawing[]): void => {
    if (rows.length) docs[kind][symbol] = rows
    else delete docs[kind][symbol]
  }

  const sync = (symbol: string, exported: readonly SerializedDrawing[]): void => {
    const foreign = rowsOf(symbol, 'shared').filter((row) => !ownsDrawing(row, chartId))
    const shared = exported.filter((row) => row.scope === undefined)
    const local = chartId ? exported.filter((row) => row.scope === chartId) : []
    setRows(symbol, 'shared', [...foreign, ...shared])
    if (chartId) setRows(symbol, 'local', local)
  }

  /** Write one document at the ref it is held at: an update at that ref, a create when none is
   *  stored, a remove when the document emptied. A refused write merges and writes once more. */
  const upload = (symbol: string, kind: DocumentKind, retry: boolean): void => {
    if (!storeFor) return
    const store = storeFor(symbol, kind)
    const list = rowsOf(symbol, kind)
    writeChain = writeChain
      .then(async () => {
        const ref = refs[kind].get(symbol)
        if (ref === undefined) return // not hydrated yet: the hydration that lands uploads a touched symbol
        if (list.length === 0) {
          if (!ref) return
          const gone = await store.remove(ref)
          if (gone.kind === 'ok') refs[kind].set(symbol, null)
          else if (gone.kind === 'conflict') await adopt(symbol, kind, gone.current, retry)
          else refs[kind].set(symbol, null)
          return
        }
        const body: DrawingsBody = { content: JSON.stringify(list) }
        const outcome = ref ? await store.update(ref, body) : await store.create(body)
        if (outcome.kind === 'ok') refs[kind].set(symbol, outcome.ref)
        else if (outcome.kind === 'conflict') await adopt(symbol, kind, outcome.current, retry)
        else {
          refs[kind].set(symbol, null)
          deps.onConflict({ symbol, current: null })
        }
      })
      .catch(() => {
        /* transport failure: the cache holds the truth and the next edit retries */
      })
  }

  /** A refused write: take the stored document in, merge this layer's rows over it, repaint when
   *  the symbol is up, and write the merge once at the ref that stands. */
  const adopt = async (symbol: string, kind: DocumentKind, current: ResourceRef, retry: boolean): Promise<void> => {
    refs[kind].set(symbol, current)
    if (!storeFor) return
    const found = await storeFor(symbol, kind).load(current.id)
    if (destroyed) return
    const stored = found ? parseList(found.body.content) : []
    if (found) refs[kind].set(symbol, found.ref)
    setRows(symbol, kind, mergeStoredDrawings(stored, rowsOf(symbol, kind)))
    deps.onConflict({ symbol, current })
    if (deps.current() === symbol) deps.onDocument(symbol, listFor(symbol))
    if (retry) upload(symbol, kind, false)
  }

  const hydrate = (symbol: string): void => {
    if (!storeFor) return
    const myEpoch = epoch
    for (const kind of kinds()) {
      if (refs[kind].has(symbol)) continue
      const store = storeFor(symbol, kind)
      void (async () => {
        try {
          const row = (await store.list())[0]
          const found = row ? await store.load(row.id) : null
          if (destroyed) return
          refs[kind].set(symbol, found ? found.ref : null)
          if (touched.has(symbol)) {
            upload(symbol, kind, true)
            return
          }
          if (!found) return
          setRows(symbol, kind, parseList(found.body.content))
          if (myEpoch === epoch && deps.current() === symbol) deps.onDocument(symbol, listFor(symbol))
        } catch {
          /* the layer keeps what it has; the next activation asks again */
        }
      })()
    }
  }

  const writeNow = (): void => {
    if (idle !== null && typeof cancelIdleCallback === 'function') cancelIdleCallback(idle)
    if (timer !== null) clearTimeout(timer)
    idle = null
    timer = null
    const symbols = [...pending]
    pending.clear()
    for (const symbol of symbols) for (const kind of kinds()) upload(symbol, kind, true)
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
    listFor,
    sync,
    hydrate,
    persist,
    flush,
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

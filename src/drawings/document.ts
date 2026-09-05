// The drawings DOCUMENT: the pure rules over the drawing-resource contract's document shape.
//
// Nothing here touches a chart, a store or a clock. That is deliberate: what a document means when
// two surfaces write it, what a deletion does to it, and which of its entries are live are exactly
// the questions that go wrong in a persistence layer, and they are all decidable from two values.
//
// Three rules the module enforces:
//   - A deletion is a TOMBSTONE, never an omission. Two charts hold the same document; if a
//     deletion were just a shorter list, the other chart's copy would put the row back on the next
//     merge, and a drawing the trader deleted would return after a save, a reconnect or a reload.
//   - A merge is not a last-write-wins overwrite. The stored document is the other surface's work
//     and wins by identity and by order; this surface's own additions follow it. Neither side
//     loses a row it made, and neither side resurrects a row the other buried.
//   - Deleting a GROUP deletes the grouping, not the drawings. The members survive, ungrouped, and
//     the group id can never come back.
//
// The document's own SHAPE lives here too, beside the rules, because the two only make sense
// together: the resource contract in `resources.ts` names this the drawings family's body.

/* ── The drawing-resource context ───────────────────────────────────────────────────────────────
   Where a drawings document lives, as a discriminated, versioned context rather than a pair of
   loose fields. The kind IS the sharing rule, so a reader never infers one from which fields
   happen to be set:

     chart-local     one chart of one layout, on one symbol. Nothing is shared.
     layout-shared   every chart of one layout, on one symbol.
     symbol-global   every chart the host mounts, on one symbol.

   `version` is the context's own format, not the document's: a store keys its rows by the whole
   context, so a later kind or field arrives as a different key rather than as a silently widened
   old one. */

export const DRAWING_CONTEXT_VERSION = 1

export type DrawingContextKind = 'chart-local' | 'layout-shared' | 'symbol-global'

/** One chart of one layout, on one symbol. */
export interface ChartLocalDrawingContext {
  version: typeof DRAWING_CONTEXT_VERSION
  kind: 'chart-local'
  /** The host's stable identity for the layout the chart is tiled in. */
  layoutId: string
  /** The chart's stable identity WITHIN that layout, so the document is found again after a
   *  reload; a per-mount instance id would key a document nothing could ever read back. */
  chartId: string
  symbol: string
}

/** Every chart of one layout, on one symbol. */
export interface LayoutSharedDrawingContext {
  version: typeof DRAWING_CONTEXT_VERSION
  kind: 'layout-shared'
  layoutId: string
  symbol: string
}

/** Every chart the host mounts, on one symbol. */
export interface SymbolGlobalDrawingContext {
  version: typeof DRAWING_CONTEXT_VERSION
  kind: 'symbol-global'
  symbol: string
}

export type DrawingResourceContext = ChartLocalDrawingContext | LayoutSharedDrawingContext | SymbolGlobalDrawingContext

/** The drawings document format. Bumping this is the only reason a reader ever branches. */
export const DRAWING_DOCUMENT_VERSION = 1

/** One drawing in a document. The ENVELOPE is structured so a restore is validated without parsing
 *  the drawing itself: the id is stable for the drawing's life, `source` names what owns it (the
 *  main series, or an indicator's own source), `pane` names where it is drawn, and `type` is its
 *  tool. `state` is the drawing's own serialized form and is opaque to the document, the store and
 *  the transport. */
export interface DrawingEntry {
  id: string
  /** The owning source: `main` for the chart's main series, else an indicator instance's id. */
  source: string
  /** The pane the drawing is drawn in: `main` for the price pane, else the pane owner's id. */
  pane: string
  type: string
  /** Opaque: nothing between the layer and the backend reads it. */
  state: unknown
  /** The group this drawing belongs to, when it belongs to one. */
  group?: string
}

/** A group of drawings. Membership is ORDERED and holds drawing ids, so a group survives a round
 *  trip with its order intact rather than being rebuilt from however a document happened to list
 *  its entries. */
export interface DrawingGroup {
  id: string
  name?: string
  members: readonly string[]
}

/** A deletion, kept. A document that listed only what survives lets a concurrent save, a reconnect
 *  or a reload resurrect what the trader deleted: the other side still holds the row and a merge
 *  takes it back. A tombstone says the deletion happened, and at which document revision, so the
 *  merge drops it instead. */
export interface DrawingTombstone {
  kind: 'drawing' | 'group'
  id: string
  /** The document revision the deletion was stamped at. */
  at: number
}

/** One context's drawings document. `revision` is the DOCUMENT's own counter, which orders
 *  tombstones and detects a stale apply; it is not the store's `ResourceRef.revision`, which stays
 *  opaque and is the store's alone. */
export interface DrawingsBody {
  version: typeof DRAWING_DOCUMENT_VERSION
  context: DrawingResourceContext
  revision: number
  entries: readonly DrawingEntry[]
  groups: readonly DrawingGroup[]
  tombstones: readonly DrawingTombstone[]
}


/** The canonical key for a drawing-resource context: equal contexts key equally, and no two
 *  different contexts collide. The parts join on an escaped null, which no symbol, layout id or
 *  chart id carries, so a symbol ending in a separator cannot spell another context's key. The
 *  kind and version lead, so a later kind is a different key rather than a widened old one. */
export function drawingContextKey(context: DrawingResourceContext): string {
  const parts: string[] = [String(context.version), context.kind]
  if (context.kind === 'chart-local') parts.push(context.layoutId, context.chartId)
  else if (context.kind === 'layout-shared') parts.push(context.layoutId)
  parts.push(context.symbol)
  return parts.join('\u0000')
}

/** Whether two contexts name the same document. */
export const sameDrawingContext = (a: DrawingResourceContext, b: DrawingResourceContext): boolean => drawingContextKey(a) === drawingContextKey(b)

/** A document with nothing in it, at revision 0: what a context that has never been written reads
 *  as, so every caller works over a document rather than over a null. */
export function emptyDrawingDocument(context: DrawingResourceContext): DrawingsBody {
  return { version: DRAWING_DOCUMENT_VERSION, context, revision: 0, entries: [], groups: [], tombstones: [] }
}

const tombstoneKey = (kind: DrawingTombstone['kind'], id: string): string => `${kind}\u0000${id}`

/** The tombstones of both documents, one per (kind, id), each at the later revision it was seen at. */
function mergeTombstones(a: readonly DrawingTombstone[], b: readonly DrawingTombstone[]): DrawingTombstone[] {
  const byKey = new Map<string, DrawingTombstone>()
  for (const stone of [...a, ...b]) {
    const key = tombstoneKey(stone.kind, stone.id)
    const held = byKey.get(key)
    if (!held || stone.at > held.at) byKey.set(key, { kind: stone.kind, id: stone.id, at: stone.at })
  }
  return [...byKey.values()]
}

const buriedSet = (tombstones: readonly DrawingTombstone[], kind: DrawingTombstone['kind']): Set<string> =>
  new Set(tombstones.filter((stone) => stone.kind === kind).map((stone) => stone.id))

/** Whether a document buries this id. A caller that is about to apply a row asks here first. */
export const drawingBuried = (document: DrawingsBody, kind: DrawingTombstone['kind'], id: string): boolean =>
  document.tombstones.some((stone) => stone.kind === kind && stone.id === id)

/** The entries a document actually holds: nothing buried, no duplicate id, and no membership of a
 *  group that is gone (the drawing survives, its grouping does not). */
export function liveDrawingEntries(document: DrawingsBody): DrawingEntry[] {
  const buriedDrawings = buriedSet(document.tombstones, 'drawing')
  const groups = new Set(liveDrawingGroups(document).map((group) => group.id))
  const out: DrawingEntry[] = []
  const seen = new Set<string>()
  for (const entry of document.entries) {
    if (buriedDrawings.has(entry.id) || seen.has(entry.id)) continue
    seen.add(entry.id)
    out.push(entry.group !== undefined && !groups.has(entry.group) ? omitGroup(entry) : entry)
  }
  return out
}

const omitGroup = (entry: DrawingEntry): DrawingEntry => {
  const { group: _buried, ...rest } = entry
  return rest
}

/** The groups a document actually holds: nothing buried, no duplicate id, and no member that is
 *  buried or absent, so a group never names a drawing that is not there. */
export function liveDrawingGroups(document: DrawingsBody): DrawingGroup[] {
  const buriedGroups = buriedSet(document.tombstones, 'group')
  const buriedDrawings = buriedSet(document.tombstones, 'drawing')
  const present = new Set(document.entries.filter((entry) => !buriedDrawings.has(entry.id)).map((entry) => entry.id))
  const out: DrawingGroup[] = []
  const seen = new Set<string>()
  for (const group of document.groups) {
    if (buriedGroups.has(group.id) || seen.has(group.id)) continue
    seen.add(group.id)
    out.push({ ...group, members: group.members.filter((id) => present.has(id)) })
  }
  return out
}

/** Replace what a document holds and stamp the difference. Every id the document held and the next
 *  state does not is buried at the new revision; every id that arrives is kept in the order it
 *  arrives in. One verb, one revision bump, so a save can never write entries at one revision and
 *  groups at another. */
export function reviseDrawingDocument(
  document: DrawingsBody,
  next: { entries?: readonly DrawingEntry[]; groups?: readonly DrawingGroup[] },
): DrawingsBody {
  const revision = document.revision + 1
  const entries = next.entries ?? liveDrawingEntries(document)
  const groups = next.groups ?? liveDrawingGroups(document)
  const keptDrawings = new Set(entries.map((entry) => entry.id))
  const keptGroups = new Set(groups.map((group) => group.id))
  const buried: DrawingTombstone[] = []
  for (const entry of liveDrawingEntries(document)) if (!keptDrawings.has(entry.id)) buried.push({ kind: 'drawing', id: entry.id, at: revision })
  for (const group of liveDrawingGroups(document)) if (!keptGroups.has(group.id)) buried.push({ kind: 'group', id: group.id, at: revision })
  return {
    version: DRAWING_DOCUMENT_VERSION,
    context: document.context,
    revision,
    entries: [...entries],
    groups: [...groups],
    tombstones: mergeTombstones(document.tombstones, buried),
  }
}

/** Merge the document another surface wrote first with this surface's own. The stored rows win by
 *  identity and keep the stored order, because they are what everyone else can already see; rows
 *  only this surface holds follow, because they are work the other surface never saw. Every
 *  deletion either side made survives the merge. The result's revision is past both, so the write
 *  that carries it is the newer document by either side's counter. */
export function mergeDrawingDocuments(stored: DrawingsBody, mine: DrawingsBody): DrawingsBody {
  const tombstones = mergeTombstones(stored.tombstones, mine.tombstones)
  const buriedDrawings = buriedSet(tombstones, 'drawing')
  const buriedGroups = buriedSet(tombstones, 'group')

  const entries: DrawingEntry[] = []
  const seen = new Set<string>()
  for (const entry of [...stored.entries, ...mine.entries]) {
    if (seen.has(entry.id) || buriedDrawings.has(entry.id)) continue
    seen.add(entry.id)
    entries.push(entry.group !== undefined && buriedGroups.has(entry.group) ? omitGroup(entry) : entry)
  }

  const groups: DrawingGroup[] = []
  const byId = new Map<string, DrawingGroup>()
  for (const group of [...stored.groups, ...mine.groups]) {
    if (buriedGroups.has(group.id)) continue
    const held = byId.get(group.id)
    if (!held) {
      const row = { ...group, members: [...group.members] }
      byId.set(group.id, row)
      groups.push(row)
      continue
    }
    // One group written by both surfaces: the stored order stands and the members only this
    // surface knows about are appended, the same rule the entries follow.
    for (const id of group.members) if (!held.members.includes(id)) (held.members as string[]).push(id)
  }
  const present = new Set(entries.map((entry) => entry.id))

  return {
    version: DRAWING_DOCUMENT_VERSION,
    context: stored.context,
    revision: Math.max(stored.revision, mine.revision) + 1,
    entries,
    groups: groups.map((group) => ({ ...group, members: group.members.filter((id) => present.has(id)) })),
    tombstones,
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

const entryOf = (value: unknown): DrawingEntry | null => {
  if (!isRecord(value)) return null
  const { id, source, pane, type, group } = value
  if (typeof id !== 'string' || !id || typeof source !== 'string' || typeof pane !== 'string' || typeof type !== 'string') return null
  return { id, source, pane, type, state: value.state, ...(typeof group === 'string' ? { group } : {}) }
}

const groupOf = (value: unknown): DrawingGroup | null => {
  if (!isRecord(value)) return null
  const { id, name, members } = value
  if (typeof id !== 'string' || !id || !Array.isArray(members)) return null
  return { id, ...(typeof name === 'string' ? { name } : {}), members: members.filter((m): m is string => typeof m === 'string') }
}

/** The context a payload states, when it states a whole one this build understands. */
const contextOf = (value: unknown): DrawingResourceContext | null => {
  if (!isRecord(value) || value.version !== DRAWING_CONTEXT_VERSION) return null
  const { kind, symbol, layoutId, chartId } = value
  if (typeof symbol !== 'string') return null
  if (kind === 'symbol-global') return { version: DRAWING_CONTEXT_VERSION, kind, symbol }
  if (typeof layoutId !== 'string') return null
  if (kind === 'layout-shared') return { version: DRAWING_CONTEXT_VERSION, kind, layoutId, symbol }
  if (kind === 'chart-local' && typeof chartId === 'string') return { version: DRAWING_CONTEXT_VERSION, kind, layoutId, chartId, symbol }
  return null
}

const tombstoneOf = (value: unknown): DrawingTombstone | null => {
  if (!isRecord(value)) return null
  const { kind, id, at } = value
  if ((kind !== 'drawing' && kind !== 'group') || typeof id !== 'string' || !id) return null
  return { kind, id, at: typeof at === 'number' ? at : 0 }
}

/** Read whatever a transport handed back as a document for this context. TOTAL: a null, a string, a
 *  wrong version, a junk row or a whole junk body reads as the empty document, never a throw, so a
 *  host can hand the chart what its backend returned without guarding it first. The context is the
 *  caller's, not the payload's: a document is identified by where it was read from, and a body
 *  claiming another context is not merged into this one. */
export function parseDrawingDocument(value: unknown, context: DrawingResourceContext): DrawingsBody {
  const raw: unknown = typeof value === 'string' ? safeJson(value) : value
  if (!isRecord(raw) || raw.version !== DRAWING_DOCUMENT_VERSION) return emptyDrawingDocument(context)
  const stated = contextOf(raw.context)
  if (stated && !sameDrawingContext(stated, context)) return emptyDrawingDocument(context)
  return {
    version: DRAWING_DOCUMENT_VERSION,
    context,
    revision: typeof raw.revision === 'number' && Number.isFinite(raw.revision) ? raw.revision : 0,
    entries: Array.isArray(raw.entries) ? raw.entries.map(entryOf).filter((e): e is DrawingEntry => e !== null) : [],
    groups: Array.isArray(raw.groups) ? raw.groups.map(groupOf).filter((g): g is DrawingGroup => g !== null) : [],
    tombstones: Array.isArray(raw.tombstones) ? raw.tombstones.map(tombstoneOf).filter((t): t is DrawingTombstone => t !== null) : [],
  }
}

const safeJson = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

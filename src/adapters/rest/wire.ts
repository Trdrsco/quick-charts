// THE PUBLIC REST WIRE CONTRACT for saved chart resources: the paths, the payloads and the
// conditional-write rule a service implements so that `createRestSaveLoadAdapter` can drive it.
//
// This module is the contract's one source. The types below are what a service's handlers return
// and what `./index` reads back; the path helpers are what it asks for. `./openapi` renders the
// same facts as an OpenAPI document, which the build writes to `dist/rest-openapi.json`, so the
// schema a service author reads and the requests the adapter makes cannot drift apart.
//
// Four rules the contract enforces:
//   - Every path is RELATIVE to a base URL the host owns. Nothing here names an origin, a service,
//     a credential or a header a host has not asked for.
//   - Identity and version travel in the BODY: every row carries a stable `id` and an opaque
//     `revision`. A reader quotes the revision it read back in `If-Match` on its next write, and a
//     service compares it for equality alone. Minting it as an ETag value, a counter or a content
//     hash is the service's choice.
//   - A write against a revision the service has moved past is 409 with the ref that stands now,
//     never a silent overwrite. An unknown id is 404. A conditional route reached with no
//     `If-Match` is 428.
//   - Bodies the chart writes are OPAQUE text to the service. It stores and returns `content`
//     without parsing it, so a chart's formats stay the chart's own.
import type { DrawingResourceContext } from '../../drawings/document'

/** The contract's own version, which the published OpenAPI document carries as its `info.version`.
 *  A later shape arrives as a later number rather than as a widened old one. */
export const REST_WIRE_VERSION = 1

/** The three template collections. */
export type RestTemplateKind = 'study' | 'drawing' | 'palette'

export const REST_TEMPLATE_KINDS: readonly RestTemplateKind[] = ['study', 'drawing', 'palette']

/** Which collection a request addresses. Templates are three collections rather than one, so the
 *  kind is part of the address rather than a field inside it. */
export type RestCollection = { family: 'charts' | 'layouts' | 'drawings' } | { family: 'templates'; kind: RestTemplateKind }

/** The header a conditional write states its revision in. */
export const REST_IF_MATCH_HEADER = 'if-match'

/** The statuses the contract gives meaning to. Anything else is a failure the adapter raises. */
export const REST_STATUS = {
  /** The id is unknown, deleted, or another principal's. */
  notFound: 404,
  /** The quoted revision is not the one that stands; the body carries the one that is. */
  conflict: 409,
  /** A conditional route was reached with no `If-Match`. The adapter always sends one. */
  revisionRequired: 428,
} as const

/** A row's identity plus the exact version a reader saw. */
export interface RestResourceRef {
  id: string
  /** Opaque: compared for equality, never parsed or ordered. */
  revision: string
}

/** A listing: metadata only, so a picker paints without fetching content. `items` is the same key
 *  in every family, so one reader serves all four. */
export interface RestListResponse<Meta> {
  items: Meta[]
}

/** A read: the ref the document stands at, and the document. */
export interface RestLoadResponse<Body> extends RestResourceRef {
  body: Body
}

/** A create, update or delete that landed: the ref the service now holds (for a delete, the one it
 *  removed), and the listing row the write produced where the service computes one. */
export interface RestWriteResponse<Meta> extends RestResourceRef {
  meta?: Meta
}

/** The 409 body: the ref that stands now, so the caller reloads it and re-decides. */
export interface RestConflictBody {
  error: 'conflict'
  current: RestResourceRef
}

/** The 404 body. */
export interface RestNotFoundBody {
  error: 'not_found'
}

/** The 428 body. */
export interface RestRevisionRequiredBody {
  error: 'revision_required'
}

/** A saved chart's listing row. `updatedAt` is ms since epoch, stamped by the service. */
export interface RestChartMeta extends RestResourceRef {
  name: string
  symbol: string
  timeframe: string
  updatedAt: number
}

/** A saved chart. `content` is the chart's serialized state, opaque to the service. */
export interface RestChartBody {
  name: string
  symbol: string
  timeframe: string
  content: string
}

/** A saved multi-chart layout's listing row. */
export interface RestLayoutMeta extends RestResourceRef {
  name: string
  updatedAt: number
}

export interface RestLayoutBody {
  name: string
  content: string
}

/** A drawings document's listing row. One context holds at most one document, so the collection
 *  answers zero rows or one. */
export interface RestDrawingsMeta extends RestResourceRef {
  updatedAt: number
}

/** A drawings document, as the service stores it: the document's own JSON, as opaque text. */
export interface RestDrawingsBody {
  content: string
}

/** A template's listing row. `tool` scopes a drawing template to its tool; study and palette
 *  templates carry none. */
export interface RestTemplateMeta extends RestResourceRef {
  name: string
  tool?: string
  updatedAt: number
}

export interface RestTemplateBody {
  name: string
  tool?: string
  content: string
}

/** A collection's path, relative to the host's base URL. */
export function restCollectionPath(collection: RestCollection): string {
  return collection.family === 'templates' ? `/templates/${encodeURIComponent(collection.kind)}` : `/${collection.family}`
}

/** One row's path, relative to the host's base URL. */
export function restItemPath(collection: RestCollection, id: string): string {
  return `${restCollectionPath(collection)}/${encodeURIComponent(id)}`
}

/** The drawing-resource context as one opaque token for the `context` query parameter. Each part is
 *  percent-encoded before the join, so no layout or chart id can spell another context's token, and
 *  the kind leads, so a symbol-global document and a layout-shared one never collide. The service
 *  keys rows by it and never parses it. */
export function restDrawingContextToken(context: DrawingResourceContext): string {
  const parts: string[] = [String(context.version), context.kind]
  if (context.kind === 'chart-local') parts.push(context.layoutId, context.chartId)
  else if (context.kind === 'layout-shared') parts.push(context.layoutId)
  return parts.map(encodeURIComponent).join('.')
}

/** The drawings collection's query: the symbol it belongs to, and the context token. Both are
 *  required, because a drawings collection with no context would name every document at once. */
export function restDrawingsQuery(context: DrawingResourceContext): string {
  return `symbol=${encodeURIComponent(context.symbol)}&context=${encodeURIComponent(restDrawingContextToken(context))}`
}
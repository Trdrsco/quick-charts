// `quickcharts/adapters/rest` — the optional save/load adapter over the public wire contract in
// `./wire`.
//
// It is a SEPARATE entrypoint because the chart makes no network request of its own. A consumer who
// never imports this module ships none of it, and a consumer who does hands it two things: where
// its service lives, and how to reach it.
//
//   createRestSaveLoadAdapter({ baseUrl, request })
//
// `request` is the whole transport. `globalThis.fetch` fits it, and so does a host's own wrapper
// around one. That is the point: authorization, cookies, CORS, tenancy, retries, timeouts and
// telemetry are decisions with consequences the chart cannot weigh, so this module holds no
// credential, no token store, no header policy, no retry and no default origin. The only headers it
// sets are the two the contract itself needs: the media type of a body it is sending, and the
// revision a conditional write is quoting.
//
// Every refusal the contract defines becomes the core port's typed outcome: 404 is `not-found` (and
// a null from a load), 409 is `conflict` carrying the ref that stands. Everything else is a
// `RestSaveLoadError` the caller can inspect and decide about, because a transport failure is not a
// resource outcome and answering one as an empty list or a missing row would be a lie the next save
// acts on. An aborted call rejects with the contract's `AbortError`, and nothing lands.
import { DRAWING_DOCUMENT_VERSION, drawingContextKey, parseDrawingDocument, type DrawingResourceContext, type DrawingsBody } from '../../drawings/document'
import {
  ResourceAbortError,
  type ChartBody,
  type ChartMeta,
  type ChartSaveLoadAdapter,
  type DrawingsMeta,
  type LayoutBody,
  type LayoutMeta,
  type ResourceRef,
  type ResourceStore,
  type TemplateBody,
  type TemplateKind,
  type TemplateMeta,
  type WriteOutcome,
} from '../../resources'
import {
  REST_IF_MATCH_HEADER,
  REST_STATUS,
  restCollectionPath,
  restDrawingsQuery,
  restItemPath,
  type RestChartBody,
  type RestChartMeta,
  type RestCollection,
  type RestConflictBody,
  type RestDrawingsBody,
  type RestDrawingsMeta,
  type RestLayoutBody,
  type RestLayoutMeta,
  type RestListResponse,
  type RestLoadResponse,
  type RestResourceRef,
  type RestTemplateBody,
  type RestTemplateMeta,
  type RestWriteResponse,
} from './wire'

/** The wire contract, as types a service implementer writes their handlers against. They are what
 *  the adapter sends and reads, so a service typed by them and an adapter driving it cannot drift.
 *  The paths, the statuses and the schema document are in `./wire` and `dist/rest-openapi.json`. */
export type {
  RestChartBody,
  RestChartMeta,
  RestCollection,
  RestConflictBody,
  RestDrawingsBody,
  RestDrawingsMeta,
  RestLayoutBody,
  RestLayoutMeta,
  RestListResponse,
  RestLoadResponse,
  RestNotFoundBody,
  RestResourceRef,
  RestRevisionRequiredBody,
  RestTemplateBody,
  RestTemplateKind,
  RestTemplateMeta,
  RestWriteResponse,
} from './wire'

/** What the adapter asks a request function to do. Deliberately the subset of `RequestInit` the
 *  contract needs, so a host implementing this by hand implements four fields rather than thirty,
 *  and a plain `fetch` accepts it unchanged. */
export interface RestRequestInit {
  method: string
  headers: Record<string, string>
  /** The JSON payload, on a create and an update; absent on a read and a delete. */
  body?: string
  signal?: AbortSignal
}

/** What the adapter reads back. The subset of a `Response` the contract needs, so a host may return
 *  a real `Response` or its own object of the same shape. */
export interface RestResponse {
  readonly status: number
  text(): Promise<string>
}

/** The host's transport. `fetch` satisfies it; so does a wrapper that adds the host's authorization,
 *  its base headers, its retries or its telemetry. The adapter calls it and reads what it answers,
 *  and does nothing else with the network. */
export type RestRequest = (url: string, init: RestRequestInit) => Promise<RestResponse>

export interface RestSaveLoadOptions {
  /** Where the host mounts the wire contract's routes. Every path is appended to it, so an origin,
   *  a path prefix, or a bare path are all fine. There is no default: the chart does not know where
   *  a host's service lives, and guessing would be a request nobody asked for. */
  baseUrl: string
  /** How a request is made. Required, for the same reason. */
  request: RestRequest
}

/** A request the service answered in a way the contract does not define: a status with no meaning
 *  here (`http`), or a body that is not the shape the route promises (`invalid-payload`). It carries
 *  what the caller needs to decide: which request, and what came back. */
export class RestSaveLoadError extends Error {
  override readonly name = 'RestSaveLoadError'
  readonly reason: 'http' | 'invalid-payload'
  readonly status: number
  readonly method: string
  readonly url: string
  constructor(init: { reason: 'http' | 'invalid-payload'; status: number; method: string; url: string; detail: string }) {
    super(`${init.method} ${init.url}: ${init.detail}`)
    this.reason = init.reason
    this.status = init.status
    this.method = init.method
    this.url = init.url
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

/** A ref the service stated, or null when it stated something else. Both fields are required and
 *  both are strings: a numeric revision that arrived as a number is not this contract's ref, and
 *  reading one loosely is how a client starts comparing revisions it cannot compare. */
const refOf = (value: unknown): ResourceRef | null => {
  if (!isRecord(value)) return null
  const { id, revision } = value as Partial<RestResourceRef>
  return typeof id === 'string' && id !== '' && typeof revision === 'string' ? { id, revision } : null
}

/** The base URL with no trailing slash, so `${base}/charts` never doubles one. */
const trimBase = (baseUrl: string): string => baseUrl.replace(/\/+$/, '')

export function createRestSaveLoadAdapter(options: RestSaveLoadOptions): ChartSaveLoadAdapter {
  const base = trimBase(options.baseUrl)
  const request = options.request

  /** One call: the abort check, the two contract headers, the host's request, and the status and
   *  text it answered. Reading the status is each verb's own job, because what a 404 means differs
   *  between a load (nothing there) and an update (the row is gone). */
  async function call(deps: { method: string; path: string; body?: unknown; ref?: ResourceRef; signal?: AbortSignal }): Promise<{ status: number; text: string }> {
    if (deps.signal?.aborted) throw new ResourceAbortError()
    const url = `${base}${deps.path}`
    const headers: Record<string, string> = {}
    if (deps.body !== undefined) headers['content-type'] = 'application/json'
    if (deps.ref) headers[REST_IF_MATCH_HEADER] = deps.ref.revision
    const init: RestRequestInit = { method: deps.method, headers }
    if (deps.body !== undefined) init.body = JSON.stringify(deps.body)
    if (deps.signal) init.signal = deps.signal
    const response = await request(url, init)
    const text = await response.text()
    return { status: response.status, text }
  }

  /** The JSON a 2xx carried, held to being an object. A body that is not one is the route's promise
   *  broken, which is a failure to report rather than an empty answer to act on. */
  function payload(method: string, url: string, answer: { status: number; text: string }): Record<string, unknown> {
    let parsed: unknown = null
    try {
      parsed = answer.text === '' ? null : JSON.parse(answer.text)
    } catch {
      parsed = null
    }
    if (!isRecord(parsed))
      throw new RestSaveLoadError({ reason: 'invalid-payload', status: answer.status, method, url, detail: 'the response is not a JSON object' })
    return parsed
  }

  /** A non-2xx the caller did not name: raised with its status, so a host can tell a 401 from a 503
   *  and decide (sign in again, back off, tell the trader) rather than see an empty chart. */
  const httpError = (method: string, url: string, status: number): RestSaveLoadError =>
    new RestSaveLoadError({ reason: 'http', status, method, url, detail: `unexpected status ${status}` })

  /** One family over one collection. `metaOf` and `bodyOf` read the wire rows; `wireOf` writes the
   *  body. The five verbs share the transport and the refusal mapping. */
  function store<Meta, Body, WireMeta, WireBody>(deps: {
    collection: RestCollection
    /** The collection's query, for a family whose collection is scoped (drawings). */
    query?: string
    metaOf: (row: WireMeta) => Meta
    bodyOf: (wire: WireBody, answer: { status: number; text: string }, url: string) => Body
    wireOf: (body: Body) => WireBody
  }): ResourceStore<Meta, Body> {
    const collectionPath = deps.query ? `${restCollectionPath(deps.collection)}?${deps.query}` : restCollectionPath(deps.collection)
    const itemPath = (id: string): string => restItemPath(deps.collection, id)

    /** A write's answer as the port's outcome: the ref it landed at, the ref that beat it, or the
     *  absence it found. */
    const written = <T>(method: string, path: string, answer: { status: number; text: string }): WriteOutcome<T> => {
      const url = `${base}${path}`
      if (answer.status === REST_STATUS.notFound) return { kind: 'not-found' }
      if (answer.status === REST_STATUS.conflict) {
        const conflict = payload(method, url, answer) as Partial<RestConflictBody>
        const current = refOf(conflict.current)
        if (!current) throw new RestSaveLoadError({ reason: 'invalid-payload', status: answer.status, method, url, detail: 'the conflict states no current ref' })
        return { kind: 'conflict', current }
      }
      if (answer.status < 200 || answer.status >= 300) throw httpError(method, url, answer.status)
      const body = payload(method, url, answer) as Partial<RestWriteResponse<WireMeta>>
      const ref = refOf(body)
      if (!ref) throw new RestSaveLoadError({ reason: 'invalid-payload', status: answer.status, method, url, detail: 'the write states no ref' })
      const outcome: WriteOutcome<T> = { kind: 'ok', ref }
      if (body.meta !== undefined) outcome.value = deps.metaOf(body.meta) as unknown as T
      return outcome
    }

    return {
      async list(signal) {
        const answer = await call({ method: 'GET', path: collectionPath, signal })
        const url = `${base}${collectionPath}`
        if (answer.status < 200 || answer.status >= 300) throw httpError('GET', url, answer.status)
        const body = payload('GET', url, answer) as Partial<RestListResponse<WireMeta>>
        if (!Array.isArray(body.items)) throw new RestSaveLoadError({ reason: 'invalid-payload', status: answer.status, method: 'GET', url, detail: 'the listing states no items array' })
        return body.items.map(deps.metaOf)
      },
      async load(id, signal) {
        const path = itemPath(id)
        const url = `${base}${path}`
        const answer = await call({ method: 'GET', path, signal })
        if (answer.status === REST_STATUS.notFound) return null
        if (answer.status < 200 || answer.status >= 300) throw httpError('GET', url, answer.status)
        const body = payload('GET', url, answer) as Partial<RestLoadResponse<WireBody>>
        const ref = refOf(body)
        if (!ref || body.body === undefined || !isRecord(body.body))
          throw new RestSaveLoadError({ reason: 'invalid-payload', status: answer.status, method: 'GET', url, detail: 'the read states no ref and body' })
        return { ref, body: deps.bodyOf(body.body, answer, url) }
      },
      async create(body, signal) {
        const answer = await call({ method: 'POST', path: collectionPath, body: deps.wireOf(body), signal })
        return written<Meta>('POST', collectionPath, answer)
      },
      async update(ref, body, signal) {
        const path = itemPath(ref.id)
        const answer = await call({ method: 'PUT', path, body: deps.wireOf(body), ref, signal })
        return written<Meta>('PUT', path, answer)
      },
      async remove(ref, signal) {
        const path = itemPath(ref.id)
        const answer = await call({ method: 'DELETE', path, ref, signal })
        return written<void>('DELETE', path, answer)
      },
    }
  }

  const drawingStores = new Map<string, ResourceStore<DrawingsMeta, DrawingsBody>>()
  const templateStores = new Map<TemplateKind, ResourceStore<TemplateMeta, TemplateBody>>()

  return {
    charts: store<ChartMeta, ChartBody, RestChartMeta, RestChartBody>({
      collection: { family: 'charts' },
      metaOf: (r) => ({ id: r.id, revision: r.revision, name: r.name, symbol: r.symbol, timeframe: r.timeframe, updatedAt: r.updatedAt }),
      bodyOf: (w) => ({ name: w.name, symbol: w.symbol, timeframe: w.timeframe, content: w.content }),
      wireOf: (b) => ({ name: b.name, symbol: b.symbol, timeframe: b.timeframe, content: b.content }),
    }),
    layouts: store<LayoutMeta, LayoutBody, RestLayoutMeta, RestLayoutBody>({
      collection: { family: 'layouts' },
      metaOf: (r) => ({ id: r.id, revision: r.revision, name: r.name, updatedAt: r.updatedAt }),
      bodyOf: (w) => ({ name: w.name, content: w.content }),
      wireOf: (b) => ({ name: b.name, content: b.content }),
    }),
    drawings(context: DrawingResourceContext) {
      const key = drawingContextKey(context)
      let held = drawingStores.get(key)
      if (!held) {
        held = store<DrawingsMeta, DrawingsBody, RestDrawingsMeta, RestDrawingsBody>({
          collection: { family: 'drawings' },
          query: restDrawingsQuery(context),
          metaOf: (r) => ({ id: r.id, revision: r.revision, updatedAt: r.updatedAt }),
          // The document is the one body the chart itself reads, so this is where a stored row is
          // proved to be a document FOR THIS CONTEXT before the chart sees one. A row that is not
          // is refused rather than read as an empty document: an empty read is followed by a save,
          // and that save would replace the row it misread.
          bodyOf: (w, answer, url) => documentOf(w.content, context, answer.status, url),
          wireOf: (b) => ({ content: JSON.stringify(b) }),
        })
        drawingStores.set(key, held)
      }
      return held
    },
    templates(kind: TemplateKind) {
      let held = templateStores.get(kind)
      if (!held) {
        held = store<TemplateMeta, TemplateBody, RestTemplateMeta, RestTemplateBody>({
          collection: { family: 'templates', kind },
          metaOf: (r) => ({ id: r.id, revision: r.revision, name: r.name, ...(r.tool === undefined ? {} : { tool: r.tool }), updatedAt: r.updatedAt }),
          bodyOf: (w) => ({ name: w.name, ...(w.tool === undefined ? {} : { tool: w.tool }), content: w.content }),
          wireOf: (b) => ({ name: b.name, ...(b.tool === undefined ? {} : { tool: b.tool }), content: b.content }),
        })
        templateStores.set(kind, held)
      }
      return held
    },
  }
}

/** The stored text as this context's document, or a refusal. `parseDrawingDocument` is total and
 *  answers an empty document for anything it cannot read, so the two cases it cannot distinguish
 *  are separated here first: text that is not a document at all, and a document written for another
 *  context. */
function documentOf(content: string, context: DrawingResourceContext, status: number, url: string): DrawingsBody {
  const refuse = (detail: string): RestSaveLoadError => new RestSaveLoadError({ reason: 'invalid-payload', status, method: 'GET', url, detail })
  let raw: unknown = null
  try {
    raw = JSON.parse(content)
  } catch {
    throw refuse('the stored drawings row is not JSON')
  }
  if (!isRecord(raw)) throw refuse('the stored drawings row is not a drawings document')
  if (raw.version !== DRAWING_DOCUMENT_VERSION) throw refuse(`the stored drawings row is not a version-${String(DRAWING_DOCUMENT_VERSION)} document`)
  if (isRecord(raw.context) && drawingContextKey(raw.context as unknown as DrawingResourceContext) !== drawingContextKey(context))
    throw refuse('the stored drawings row is another context\'s document')
  return parseDrawingDocument(raw, context)
}

// The wire contract of `./wire` rendered as an OpenAPI document: the same facts a service author
// can read, lint, or generate a server stub from.
//
// It is BUILT from the contract rather than written beside it, so a path, a status, a template kind
// or a field cannot be documented one way and implemented another. `scripts/build-rest-openapi.mjs`
// writes what this module returns into `dist/rest-openapi.json` during the build, and
// `test/adapters/openapi.test.ts` compares the committed artifact with the same rendering.
//
// Nothing here is part of the shipped adapter. The build entry is `./index`, this module is not in
// its import graph, and a packed-artifact fixture proves the schema text is absent from what a
// consumer downloads: a host implementing the contract reads the document, and a browser running
// the adapter should not have to carry it.
// The extension is explicit because the build script runs this module through Node directly, the
// way the theme and manifest generators run theirs.
import { REST_STATUS, REST_TEMPLATE_KINDS, REST_WIRE_VERSION, restCollectionPath } from './wire.ts'

/** A JSON value in the emitted document. The renderer builds plain data; nothing here executes. */
type Json = string | number | boolean | null | Json[] | { [key: string]: Json }

const ref = (name: string): Json => ({ $ref: `#/components/schemas/${name}` })

const object = (properties: Record<string, Json>, required: string[]): Json => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
})

const str: Json = { type: 'string' }
const opaque = (description: string): Json => ({ type: 'string', description })
const timestamp: Json = { type: 'integer', description: 'Last write, milliseconds since the Unix epoch, stamped by the service.' }

const refFields: Record<string, Json> = {
  id: opaque('Stable identity, minted by the service.'),
  revision: opaque('The version this row stands at. Opaque to the client, compared for equality alone.'),
}

const listOf = (meta: string): Json => object({ items: { type: 'array', items: ref(meta) } }, ['items'])
const loadOf = (body: string): Json => object({ ...refFields, body: ref(body) }, ['id', 'revision', 'body'])
const writeOf = (meta: string): Json => object({ ...refFields, meta: ref(meta) }, ['id', 'revision'])

const jsonBody = (schema: Json, description: string): Json => ({ description, content: { 'application/json': { schema } } })

const refusals: Record<string, Json> = {
  [REST_STATUS.notFound]: jsonBody(ref('NotFound'), 'No row with that id.'),
}

const conditionalRefusals: Record<string, Json> = {
  ...refusals,
  [REST_STATUS.conflict]: jsonBody(ref('Conflict'), 'The quoted revision is not the one that stands. The body carries the ref that does.'),
  [REST_STATUS.revisionRequired]: jsonBody(ref('RevisionRequired'), 'The request carried no If-Match revision.'),
}

const ifMatchParameter: Json = {
  name: 'If-Match',
  in: 'header',
  required: true,
  schema: str,
  description: 'The revision this write believes it is replacing.',
}

const idParameter: Json = { name: 'id', in: 'path', required: true, schema: str }

const kindParameter: Json = {
  name: 'kind',
  in: 'path',
  required: true,
  schema: { type: 'string', enum: [...REST_TEMPLATE_KINDS] },
  description: 'Which template collection: appearance palettes, indicator studies, or drawings.',
}

const drawingsQueryParameters: Json[] = [
  { name: 'symbol', in: 'query', required: true, schema: str, description: 'The symbol the document belongs to.' },
  { name: 'context', in: 'query', required: true, schema: opaque('The drawing-resource context token. The service keys rows by it and never parses it.'), description: 'The drawing-resource context token.' },
]

/** One family's two paths: the collection (list and create) and the row (load, update, delete).
 *  `path` addresses the family itself and rides every operation (the template kind); `query`
 *  addresses one collection and rides only the collection's two (a drawings symbol and context).
 *  A row is reached by id alone once it has one. */
function familyPaths(deps: { collection: string; item: string; meta: string; body: string; tag: string; path?: Json[]; query?: Json[] }): Record<string, Json> {
  const scope = deps.path ?? []
  const collectionScope = [...scope, ...(deps.query ?? [])]
  return {
    [deps.collection]: {
      get: {
        tags: [deps.tag],
        summary: 'List rows, metadata only.',
        parameters: [...collectionScope],
        responses: { '200': jsonBody(ref(`${deps.meta}List`), 'The rows this principal may read.') },
      },
      post: {
        tags: [deps.tag],
        summary: 'Store a new row. The service mints the id, so a create never conflicts on a revision.',
        parameters: [...collectionScope],
        requestBody: jsonBody(ref(deps.body), 'The document to store.'),
        responses: { '200': jsonBody(ref(`${deps.meta}Write`), 'The ref the service now holds.'), ...refusals },
      },
    },
    [deps.item]: {
      get: {
        tags: [deps.tag],
        summary: 'Read one row and the revision it stands at.',
        parameters: [...scope, idParameter],
        responses: { '200': jsonBody(ref(`${deps.body}Load`), 'The document and its ref.'), ...refusals },
      },
      put: {
        tags: [deps.tag],
        summary: 'Replace the row, but only while it still stands at the quoted revision.',
        parameters: [...scope, idParameter, ifMatchParameter],
        requestBody: jsonBody(ref(deps.body), 'The document to store.'),
        responses: { '200': jsonBody(ref(`${deps.meta}Write`), 'The ref the service now holds.'), ...conditionalRefusals },
      },
      delete: {
        tags: [deps.tag],
        summary: 'Delete the row, but only while it still stands at the quoted revision.',
        parameters: [...scope, idParameter, ifMatchParameter],
        responses: { '200': jsonBody(ref(`${deps.meta}Write`), 'The ref the service removed.'), ...conditionalRefusals },
      },
    },
  }
}

/** The wire contract as an OpenAPI 3.1 document. Pure: it reads nothing and writes nothing. */
export function restOpenApiDocument(): Json {
  // The kind is a path TEMPLATE here rather than one of the three values, so the document states
  // the shape once; `restCollectionPath` is what fills it in for a real request.
  const templates = '/templates/{kind}'
  return {
    openapi: '3.1.0',
    info: {
      title: 'Quick Charts saved resources',
      version: String(REST_WIRE_VERSION),
      description:
        'The service contract behind `createRestSaveLoadAdapter` from `quickcharts/adapters/rest`. Every path is relative to the base URL the host configures. Authorization, cookies, CORS, retries and tenancy belong to the host request function, so no path, header or field here carries a credential. Saved charts, layouts, drawing documents and templates share one revisioned rule: a read answers the ref a row stands at, a write quotes that revision in `If-Match`, and a write against a revision the service has moved past answers 409 with the ref that stands.',
    },
    servers: [
      {
        url: '{baseUrl}',
        description: 'The base URL the host configures. This document names no origin.',
        variables: { baseUrl: { default: '/', description: 'Where the host mounts these routes.' } },
      },
    ],
    tags: [
      { name: 'charts', description: 'Saved charts.' },
      { name: 'layouts', description: 'Saved multi-chart layouts.' },
      { name: 'drawings', description: 'One drawings document per drawing-resource context.' },
      { name: 'templates', description: 'Named appearance, indicator and drawing templates, one collection per kind.' },
    ],
    paths: {
      ...familyPaths({
        collection: restCollectionPath({ family: 'charts' }),
        item: `${restCollectionPath({ family: 'charts' })}/{id}`,
        meta: 'ChartMeta',
        body: 'ChartBody',
        tag: 'charts',
      }),
      ...familyPaths({
        collection: restCollectionPath({ family: 'layouts' }),
        item: `${restCollectionPath({ family: 'layouts' })}/{id}`,
        meta: 'LayoutMeta',
        body: 'LayoutBody',
        tag: 'layouts',
      }),
      ...familyPaths({
        collection: restCollectionPath({ family: 'drawings' }),
        item: `${restCollectionPath({ family: 'drawings' })}/{id}`,
        meta: 'DrawingsMeta',
        body: 'DrawingsBody',
        tag: 'drawings',
        query: drawingsQueryParameters,
      }),
      ...familyPaths({
        collection: templates,
        item: `${templates}/{id}`,
        meta: 'TemplateMeta',
        body: 'TemplateBody',
        tag: 'templates',
        path: [kindParameter],
      }),
    },
    components: {
      schemas: {
        ResourceRef: object(refFields, ['id', 'revision']),
        Conflict: object({ error: { const: 'conflict' }, current: ref('ResourceRef') }, ['error', 'current']),
        NotFound: object({ error: { const: 'not_found' } }, ['error']),
        RevisionRequired: object({ error: { const: 'revision_required' } }, ['error']),
        ChartMeta: object({ ...refFields, name: str, symbol: str, timeframe: str, updatedAt: timestamp }, ['id', 'revision', 'name', 'symbol', 'timeframe', 'updatedAt']),
        ChartBody: object({ name: str, symbol: str, timeframe: str, content: opaque('The serialized chart state. The service stores it without parsing it.') }, ['name', 'symbol', 'timeframe', 'content']),
        LayoutMeta: object({ ...refFields, name: str, updatedAt: timestamp }, ['id', 'revision', 'name', 'updatedAt']),
        LayoutBody: object({ name: str, content: opaque('The serialized layout state. The service stores it without parsing it.') }, ['name', 'content']),
        DrawingsMeta: object({ ...refFields, updatedAt: timestamp }, ['id', 'revision', 'updatedAt']),
        DrawingsBody: object({ content: opaque('The drawings document as JSON text. The service stores it without parsing it.') }, ['content']),
        TemplateMeta: object({ ...refFields, name: str, tool: str, updatedAt: timestamp }, ['id', 'revision', 'name', 'updatedAt']),
        TemplateBody: object({ name: str, tool: str, content: opaque('The serialized template state. The service stores it without parsing it.') }, ['name', 'content']),
        ChartMetaList: listOf('ChartMeta'),
        LayoutMetaList: listOf('LayoutMeta'),
        DrawingsMetaList: listOf('DrawingsMeta'),
        TemplateMetaList: listOf('TemplateMeta'),
        ChartBodyLoad: loadOf('ChartBody'),
        LayoutBodyLoad: loadOf('LayoutBody'),
        DrawingsBodyLoad: loadOf('DrawingsBody'),
        TemplateBodyLoad: loadOf('TemplateBody'),
        ChartMetaWrite: writeOf('ChartMeta'),
        LayoutMetaWrite: writeOf('LayoutMeta'),
        DrawingsMetaWrite: writeOf('DrawingsMeta'),
        TemplateMetaWrite: writeOf('TemplateMeta'),
      },
    },
  }
}

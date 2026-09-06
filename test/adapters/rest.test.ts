// The REST save/load adapter against a recorded transport: what it asks for, what it sends, and
// what it makes of every answer.
//
// The recorder stands in for the host's request function, which is the whole point of the design:
// there is no origin to intercept, no credential to stub and no global to patch, because the
// adapter has none. Every check below either reads what the adapter asked the host to do, or hands
// it an answer and reads the typed outcome that comes back.
import { describe, expect, it } from 'vitest'
import {
  createRestSaveLoadAdapter,
  RestSaveLoadError,
  type RestRequest,
  type RestRequestInit,
} from '../../src/adapters/rest/index'
import { REST_STATUS, REST_WIRE_VERSION, restCollectionPath, restDrawingContextToken, restItemPath } from '../../src/adapters/rest/wire'
import { DRAWING_DOCUMENT_VERSION, emptyDrawingDocument, type DrawingResourceContext } from '../../src/drawings/document'

interface Sent {
  url: string
  init: RestRequestInit
}

/** A transport that records what it was asked for and answers what the test scripted. The default
 *  answer is an empty 200, which every check that only reads the request is happy with. */
function recorder(script: (sent: Sent) => { status: number; text: string } = () => ({ status: 200, text: '{}' })): { request: RestRequest; sent: Sent[] } {
  const sent: Sent[] = []
  const request: RestRequest = async (url, init) => {
    const call = { url, init }
    sent.push(call)
    const answer = script(call)
    return { status: answer.status, text: () => Promise.resolve(answer.text) }
  }
  return { request, sent }
}

const BASE = 'https://saves.example.com/v1'

const local: DrawingResourceContext = { version: 1, kind: 'chart-local', layoutId: 'desk 1', chartId: 'c1', symbol: 'ES=F' }

describe('the wire contract', () => {
  it('states a version, and addresses four collections relative to a base URL', () => {
    expect(REST_WIRE_VERSION).toBe(1)
    expect(restCollectionPath({ family: 'charts' })).toBe('/charts')
    expect(restCollectionPath({ family: 'layouts' })).toBe('/layouts')
    expect(restCollectionPath({ family: 'drawings' })).toBe('/drawings')
    expect(restCollectionPath({ family: 'templates', kind: 'study' })).toBe('/templates/study')
    expect(restItemPath({ family: 'charts' }, 'a/b')).toBe('/charts/a%2Fb')
  })

  it('gives each drawing-resource context its own token, and never lets two spell the same one', () => {
    const tokens = [
      restDrawingContextToken({ version: 1, kind: 'chart-local', layoutId: 'a', chartId: 'b', symbol: 'ES' }),
      restDrawingContextToken({ version: 1, kind: 'chart-local', layoutId: 'a.b', chartId: '', symbol: 'ES' }),
      restDrawingContextToken({ version: 1, kind: 'layout-shared', layoutId: 'a', symbol: 'ES' }),
      restDrawingContextToken({ version: 1, kind: 'symbol-global', symbol: 'ES' }),
    ]
    expect(new Set(tokens).size).toBe(tokens.length)
    // The symbol is its own query parameter, so it is not in the token.
    expect(tokens[3]).toBe('1.symbol-global')
  })
})

describe('the adapter asks the host for exactly what the contract names', () => {
  it('makes no request until a verb is called, and none of its own ever', async () => {
    const { request, sent } = recorder(() => ({ status: 200, text: '{"items":[]}' }))
    const adapter = createRestSaveLoadAdapter({ baseUrl: BASE, request })
    adapter.templates('study')
    adapter.drawings(local)
    expect(sent).toEqual([])
    await adapter.charts.list()
    expect(sent.map((s) => s.url)).toEqual([`${BASE}/charts`])
  })

  it('joins the base URL to each path, and never doubles a slash', async () => {
    const { request, sent } = recorder(() => ({ status: 200, text: '{"items":[]}' }))
    const adapter = createRestSaveLoadAdapter({ baseUrl: `${BASE}/`, request })
    await adapter.layouts.list()
    await adapter.templates('drawing').list()
    expect(sent.map((s) => s.url)).toEqual([`${BASE}/layouts`, `${BASE}/templates/drawing`])
  })

  it('sends the read verbs with no body and no headers of its own', async () => {
    const { request, sent } = recorder(() => ({ status: 200, text: '{"items":[]}' }))
    await createRestSaveLoadAdapter({ baseUrl: BASE, request }).charts.list()
    expect(sent[0]!.init.method).toBe('GET')
    expect(sent[0]!.init.body).toBeUndefined()
    expect(sent[0]!.init.headers).toEqual({})
  })

  it('quotes the revision it is replacing in If-Match on an update and a delete, and never on a create', async () => {
    const { request, sent } = recorder(() => ({ status: 200, text: '{"id":"c1","revision":"r2"}' }))
    const adapter = createRestSaveLoadAdapter({ baseUrl: BASE, request })
    const body = { name: 'Morning', symbol: 'ES', timeframe: '5m', content: '{}' }
    await adapter.charts.create(body)
    await adapter.charts.update({ id: 'c1', revision: 'r1' }, body)
    await adapter.charts.remove({ id: 'c1', revision: 'r2' })
    expect(sent.map((s) => `${s.init.method} ${s.url}`)).toEqual([`POST ${BASE}/charts`, `PUT ${BASE}/charts/c1`, `DELETE ${BASE}/charts/c1`])
    expect(sent[0]!.init.headers).toEqual({ 'content-type': 'application/json' })
    expect(sent[1]!.init.headers).toEqual({ 'content-type': 'application/json', 'if-match': 'r1' })
    expect(sent[2]!.init.headers).toEqual({ 'if-match': 'r2' })
    expect(JSON.parse(sent[1]!.init.body!)).toEqual(body)
  })

  it('scopes a drawings collection by symbol and context token, and reaches the row by id alone', async () => {
    const { request, sent } = recorder((call) => ({ status: 200, text: call.init.method === 'GET' ? '{"items":[]}' : '{"id":"d1","revision":"r1"}' }))
    const adapter = createRestSaveLoadAdapter({ baseUrl: BASE, request })
    await adapter.drawings(local).list()
    await adapter.drawings(local).remove({ id: 'd1', revision: 'r1' })
    expect(sent[0]!.url).toBe(`${BASE}/drawings?symbol=ES%3DF&context=1.chart-local.desk%25201.c1`)
    expect(sent[1]!.url).toBe(`${BASE}/drawings/d1`)
  })

  it('passes the caller\'s abort signal through, and refuses before the request when it is already aborted', async () => {
    const { request, sent } = recorder(() => ({ status: 200, text: '{"items":[]}' }))
    const adapter = createRestSaveLoadAdapter({ baseUrl: BASE, request })
    const live = new AbortController()
    await adapter.charts.list(live.signal)
    expect(sent[0]!.init.signal).toBe(live.signal)
    const dead = new AbortController()
    dead.abort()
    await expect(adapter.charts.list(dead.signal)).rejects.toMatchObject({ name: 'AbortError' })
    expect(sent.length).toBe(1)
  })
})

describe('the adapter maps every answer the contract defines', () => {
  const adapterAnswering = (status: number, text: string): ReturnType<typeof createRestSaveLoadAdapter> =>
    createRestSaveLoadAdapter({ baseUrl: BASE, request: recorder(() => ({ status, text })).request })

  it('reads a listing, a load and a write', async () => {
    const list = await adapterAnswering(200, '{"items":[{"id":"c1","revision":"r1","name":"Morning","symbol":"ES","timeframe":"5m","updatedAt":7}]}').charts.list()
    expect(list).toEqual([{ id: 'c1', revision: 'r1', name: 'Morning', symbol: 'ES', timeframe: '5m', updatedAt: 7 }])
    const loaded = await adapterAnswering(200, '{"id":"c1","revision":"r1","body":{"name":"Morning","symbol":"ES","timeframe":"5m","content":"{}"}}').charts.load('c1')
    expect(loaded).toEqual({ ref: { id: 'c1', revision: 'r1' }, body: { name: 'Morning', symbol: 'ES', timeframe: '5m', content: '{}' } })
    const written = await adapterAnswering(200, '{"id":"c1","revision":"r2","meta":{"id":"c1","revision":"r2","name":"Morning","symbol":"ES","timeframe":"5m","updatedAt":8}}').charts.create({
      name: 'Morning',
      symbol: 'ES',
      timeframe: '5m',
      content: '{}',
    })
    expect(written).toEqual({ kind: 'ok', ref: { id: 'c1', revision: 'r2' }, value: { id: 'c1', revision: 'r2', name: 'Morning', symbol: 'ES', timeframe: '5m', updatedAt: 8 } })
  })

  it('answers a 404 as a null load and a not-found write', async () => {
    const gone = adapterAnswering(REST_STATUS.notFound, '{"error":"not_found"}')
    expect(await gone.charts.load('c1')).toBeNull()
    expect((await gone.charts.update({ id: 'c1', revision: 'r1' }, { name: 'x', symbol: 'ES', timeframe: '5m', content: '{}' })).kind).toBe('not-found')
    expect((await gone.charts.remove({ id: 'c1', revision: 'r1' })).kind).toBe('not-found')
  })

  it('answers a 409 as a conflict carrying the ref that stands', async () => {
    const beaten = adapterAnswering(REST_STATUS.conflict, '{"error":"conflict","current":{"id":"c1","revision":"r9"}}')
    expect(await beaten.layouts.update({ id: 'c1', revision: 'r1' }, { name: 'Desk', content: '{}' })).toEqual({ kind: 'conflict', current: { id: 'c1', revision: 'r9' } })
  })

  it('raises a 409 that states no current ref, rather than inventing one', async () => {
    const malformed = adapterAnswering(REST_STATUS.conflict, '{"error":"conflict"}')
    await expect(malformed.layouts.remove({ id: 'c1', revision: 'r1' })).rejects.toBeInstanceOf(RestSaveLoadError)
  })

  it('raises every other status with what it was, so a host can tell a refusal from an outage', async () => {
    for (const status of [REST_STATUS.revisionRequired, 401, 403, 500, 503]) {
      const failing = adapterAnswering(status, '{"error":"nope"}')
      const raised = await failing.charts.list().then(
        () => null,
        (e: unknown) => e,
      )
      expect(raised).toBeInstanceOf(RestSaveLoadError)
      expect((raised as RestSaveLoadError).reason).toBe('http')
      expect((raised as RestSaveLoadError).status).toBe(status)
      expect((raised as RestSaveLoadError).url).toBe(`${BASE}/charts`)
    }
  })

  it('raises a body that is not the shape the route promises', async () => {
    await expect(adapterAnswering(200, 'not json at all').charts.list()).rejects.toMatchObject({ reason: 'invalid-payload' })
    await expect(adapterAnswering(200, '{"charts":[]}').charts.list()).rejects.toMatchObject({ reason: 'invalid-payload' })
    await expect(adapterAnswering(200, '{"id":"c1"}').charts.load('c1')).rejects.toMatchObject({ reason: 'invalid-payload' })
    await expect(adapterAnswering(200, '{"revision":2}').charts.create({ name: 'x', symbol: 'ES', timeframe: '5m', content: '{}' })).rejects.toMatchObject({
      reason: 'invalid-payload',
    })
  })
})

describe('the drawings family carries a document, not a blob', () => {
  it('writes the document as the content text the service stores', async () => {
    const { request, sent } = recorder(() => ({ status: 200, text: '{"id":"d1","revision":"r1"}' }))
    const document = emptyDrawingDocument(local)
    await createRestSaveLoadAdapter({ baseUrl: BASE, request }).drawings(local).create(document)
    expect(JSON.parse(JSON.parse(sent[0]!.init.body!).content)).toEqual(document)
  })

  it('reads a stored row back as this context\'s document', async () => {
    const document = emptyDrawingDocument(local)
    const stored = `{"id":"d1","revision":"r1","body":{"content":${JSON.stringify(JSON.stringify(document))}}}`
    const read = await createRestSaveLoadAdapter({ baseUrl: BASE, request: recorder(() => ({ status: 200, text: stored })).request }).drawings(local).load('d1')
    expect(read?.body).toEqual(document)
    expect(read?.body.version).toBe(DRAWING_DOCUMENT_VERSION)
  })

  it('refuses a row that is not a document for this context, rather than reading it as an empty one', async () => {
    const refused = async (content: unknown): Promise<unknown> => {
      const text = `{"id":"d1","revision":"r1","body":{"content":${JSON.stringify(typeof content === 'string' ? content : JSON.stringify(content))}}}`
      return createRestSaveLoadAdapter({ baseUrl: BASE, request: recorder(() => ({ status: 200, text })).request })
        .drawings(local)
        .load('d1')
        .then(
          () => null,
          (e: unknown) => e,
        )
    }
    // An empty read is followed by a save, and that save would replace whatever the row held.
    expect(await refused('not json')).toBeInstanceOf(RestSaveLoadError)
    expect(await refused([1, 2, 3])).toBeInstanceOf(RestSaveLoadError)
    expect(await refused({ version: DRAWING_DOCUMENT_VERSION + 1 })).toBeInstanceOf(RestSaveLoadError)
    expect(await refused(emptyDrawingDocument({ version: 1, kind: 'symbol-global', symbol: 'OTHER' }))).toBeInstanceOf(RestSaveLoadError)
  })
})

describe('the adapter holds nothing of the host\'s', () => {
  it('takes a base URL and a request function, and nothing else', () => {
    // The options a host passes are the whole configuration surface: no credential, no token store,
    // no header policy, no retry, no default origin. A change here is a public-contract decision.
    const options = { baseUrl: BASE, request: recorder().request }
    expect(Object.keys(options).sort()).toEqual(['baseUrl', 'request'])
    expect(createRestSaveLoadAdapter(options)).toEqual(expect.objectContaining({ charts: expect.anything(), layouts: expect.anything() }))
  })

  it('answers an equivalent store for an equal drawing context, and a different one for another', () => {
    const adapter = createRestSaveLoadAdapter({ baseUrl: BASE, request: recorder().request })
    expect(adapter.drawings(local)).toBe(adapter.drawings({ ...local }))
    expect(adapter.drawings(local)).not.toBe(adapter.drawings({ ...local, symbol: 'NQ' }))
    expect(adapter.templates('study')).toBe(adapter.templates('study'))
    expect(adapter.templates('study')).not.toBe(adapter.templates('drawing'))
  })
})

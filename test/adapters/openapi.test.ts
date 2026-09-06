// The published REST schema: `dist/rest-openapi.json`, held to the wire contract it is rendered
// from and to the requests the adapter actually makes.
//
// Two gates in one file. The first reads the rendering and holds it to the contract's own facts, so
// a path, a status or a family cannot be documented differently from the way it is implemented. The
// second compares the built artifact with the same rendering, so a build that shipped an older
// schema than the adapter beside it fails; without a build there is nothing to compare and that
// block passes vacuously, like the other packed fixtures.
import { describe, expect, it } from 'vitest'
import { restOpenApiDocument } from '../../src/adapters/rest/openapi'
import { REST_TEMPLATE_KINDS, REST_WIRE_VERSION } from '../../src/adapters/rest/wire'
import { packedText } from '../boundary/scan'

const document = restOpenApiDocument() as {
  openapi: string
  info: { version: string; description: string }
  servers: { url: string }[]
  paths: Record<string, Record<string, { parameters?: { name: string; in: string }[]; responses: Record<string, unknown> }>>
  components: { schemas: Record<string, unknown> }
}

const PATHS = ['/charts', '/charts/{id}', '/layouts', '/layouts/{id}', '/drawings', '/drawings/{id}', '/templates/{kind}', '/templates/{kind}/{id}']

describe('the rendered wire schema', () => {
  it('is an OpenAPI document at the contract version', () => {
    expect(document.openapi).toBe('3.1.0')
    expect(document.info.version).toBe(String(REST_WIRE_VERSION))
  })

  it('names no origin and no credential: every path hangs off the base URL the host configures', () => {
    expect(document.servers.map((s) => s.url)).toEqual(['{baseUrl}'])
    expect(JSON.stringify(document)).not.toMatch(/https?:\/\//)
    // Authentication is the host request function's, so the schema declares no scheme and asks for
    // no credential header. A `security` block here would be the chart deciding something that is
    // not its to decide.
    const declared = document as unknown as { security?: unknown; components: { securitySchemes?: unknown } }
    expect(declared.security).toBeUndefined()
    expect(declared.components.securitySchemes).toBeUndefined()
    const headers = Object.values(document.paths)
      .flatMap((operations) => Object.values(operations))
      .flatMap((operation) => operation.parameters ?? [])
      .filter((p) => p.in === 'header')
      .map((p) => p.name)
    expect([...new Set(headers)]).toEqual(['If-Match'])
  })

  it('documents the four collections and their rows, and nothing else', () => {
    expect(Object.keys(document.paths).sort()).toEqual([...PATHS].sort())
  })

  it('gives a collection list and create, and a row read, replace and delete', () => {
    for (const path of PATHS) {
      const verbs = Object.keys(document.paths[path]!).sort()
      expect(verbs, path).toEqual(path.endsWith('{id}') ? ['delete', 'get', 'put'] : ['get', 'post'])
    }
  })

  it('makes every conditional write quote a revision, and answers the three refusals', () => {
    for (const path of PATHS.filter((p) => p.endsWith('{id}'))) {
      for (const verb of ['put', 'delete'] as const) {
        const operation = document.paths[path]![verb]!
        expect(operation.parameters?.map((p) => p.name), `${verb} ${path}`).toContain('If-Match')
        expect(Object.keys(operation.responses).sort(), `${verb} ${path}`).toEqual(['200', '404', '409', '428'])
      }
      // A read cannot conflict; it can only fail to find.
      expect(Object.keys(document.paths[path]!.get!.responses).sort(), `get ${path}`).toEqual(['200', '404'])
    }
  })

  it('scopes a drawings collection by symbol and context, and a template collection by kind', () => {
    for (const verb of ['get', 'post'] as const) {
      const names = document.paths['/drawings']![verb]!.parameters?.map((p) => `${p.in}:${p.name}`)
      expect(names, verb).toEqual(['query:symbol', 'query:context'])
    }
    const kind = document.paths['/templates/{kind}']!.get!.parameters?.[0]
    expect(kind).toMatchObject({ name: 'kind', in: 'path', schema: { enum: [...REST_TEMPLATE_KINDS] } })
  })

  it('resolves every schema reference it makes', () => {
    const names = new Set(Object.keys(document.components.schemas))
    const referenced = [...JSON.stringify(document).matchAll(/#\/components\/schemas\/(\w+)/g)].map((m) => m[1]!)
    expect(referenced.length).toBeGreaterThan(20)
    expect([...new Set(referenced)].filter((name) => !names.has(name))).toEqual([])
    // And every schema it declares is reached: an orphan is documentation nobody implements.
    expect([...names].filter((name) => !referenced.includes(name))).toEqual([])
  })
})

describe('the built artifact', () => {
  const built = packedText('dist/rest-openapi.json')

  it('is packed beside the adapter, and matches the rendering exactly', () => {
    if (built === null) return // no build to read
    expect(JSON.parse(built)).toEqual(JSON.parse(JSON.stringify(document)))
  })
})

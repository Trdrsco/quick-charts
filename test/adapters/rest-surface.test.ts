// The `quickcharts/adapters/rest` API-surface pin, the same contract as the root's and the drawing
// subpath's: the entrypoint's public RUNTIME surface as { name: typeof }. A diff here is a SemVer
// event to decide consciously, never noise to appease. Type-only exports are erased at runtime and
// cannot be pinned here; the clean-room consumer compiles against the shipped declarations and is
// their gate.
//
// The pin is deliberately small. A save/load adapter is a constructor and an error class: the
// options, the request function, the response the host answers with and the whole wire contract are
// types, which is what lets a host implement the transport its own way.
import { describe, expect, it } from 'vitest'
import * as api from '../../src/adapters/rest/index'
import * as root from '../../src/index'
import type { RestRequest } from '../../src/adapters/rest/index'

const SURFACE: Record<string, string> = {
  createRestSaveLoadAdapter: 'function',
  RestSaveLoadError: 'function',
}

describe('the quickcharts/adapters/rest API surface pin', () => {
  it('exports exactly the pinned names', () => {
    expect(Object.keys(api).sort()).toEqual(Object.keys(SURFACE).sort())
  })

  it('every export keeps its pinned runtime type', () => {
    for (const [name, kind] of Object.entries(SURFACE)) expect(typeof (api as Record<string, unknown>)[name], name).toBe(kind)
  })

  it('is absent from the root entry: a consumer who never imports it carries none of it', () => {
    // The tree-shaking claim starts here, in the source graph, and packedArtifact.test.ts finishes
    // it over the built files.
    expect(Object.keys(root)).not.toContain('createRestSaveLoadAdapter')
    expect(Object.keys(root)).not.toContain('RestSaveLoadError')
  })

  it('takes a plain fetch as its request function', () => {
    // The signature is the host's escape hatch: whatever `fetch` a host has, wrapped however it
    // wraps it, is a transport this adapter drives. A compile error here is the contract breaking.
    const asRequest: RestRequest = fetch
    expect(typeof asRequest).toBe('function')
  })
})

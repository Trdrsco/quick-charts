import { describe, expect, it } from 'vitest'
import type { Time } from 'lightweight-charts'
import { parseDrawingsStore, restoreDrawings, serializeDrawingsStore } from '../src/store'
import { toolRegistry } from '../src/registry'
import type { Anchor, SerializedDrawing } from '../src/core/types'

// The store codec is the cross-surface persistence contract (app panel ⇄ widget host) — its
// round-trip and its tolerance are what keep a saved store loadable across hosts and versions.

const anchors: Anchor[] = [
  { time: 1_700_000_000 as Time, price: 100 },
  { time: 1_700_003_600 as Time, price: 105 },
]

const serialized = (): SerializedDrawing => toolRegistry.create('trend_line', 'dw-1', anchors)!.toJSON()

describe('drawings store codec', () => {
  it('round-trips a well-formed store byte-for-value', () => {
    const doc = { ES: [serialized()], NQ: [serialized(), serialized()] }
    expect(parseDrawingsStore(serializeDrawingsStore(doc))).toEqual(doc)
  })

  it('parsing is total: garbage in, empty store out — never a throw', () => {
    expect(parseDrawingsStore(undefined)).toEqual({})
    expect(parseDrawingsStore(null)).toEqual({})
    expect(parseDrawingsStore('')).toEqual({})
    expect(parseDrawingsStore('not json {')).toEqual({})
    expect(parseDrawingsStore('[1,2,3]')).toEqual({}) // an array root is not a store
    expect(parseDrawingsStore('"str"')).toEqual({})
  })

  it('a junk or empty bucket is dropped; healthy buckets still load', () => {
    const doc = JSON.stringify({ ES: [serialized()], BAD: 'nope', EMPTY: [] })
    const parsed = parseDrawingsStore(doc)
    expect(Object.keys(parsed)).toEqual(['ES'])
  })

  it('serializing drops empty buckets so dead symbol keys never accumulate', () => {
    const doc = serializeDrawingsStore({ ES: [serialized()], GONE: [] })
    expect(JSON.parse(doc)).not.toHaveProperty('GONE')
  })

  it('restoreDrawings rebuilds through the registry and skips what it cannot restore', () => {
    const good = serialized()
    const unknown = { ...serialized(), type: 'not_a_tool' }
    const restored = restoreDrawings([good, unknown])
    expect(restored).toHaveLength(1)
    expect(restored[0]!.type).toBe('trend_line')
    expect(restored[0]!.toJSON()).toEqual(good)
  })
})

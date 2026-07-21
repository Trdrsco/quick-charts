import { describe, expect, it } from 'vitest'
import type { Time } from 'lightweight-charts'
import { toolRegistry } from '../src/registry'
import type { Anchor, SerializedDrawing } from '../src/core/types'

// Every registered tool must round-trip its COMPLETE state: create → toJSON → restore → toJSON
// gives an identical document. This is the schema's contract — user text, extension flags, any
// tool-specific props can never silently reset on reload.

const anchorsFor = (count: number): Anchor[] =>
  Array.from({ length: count }, (_, i) => ({
    time: (1_700_000_000 + i * 3600) as Time,
    price: 100 + i * 5,
  }))

/** A non-default value for every prop key, keyed by its default's type. */
function mutatedProps(defaults: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(defaults)) {
    if (typeof value === 'boolean') out[key] = !value
    else if (typeof value === 'number') out[key] = (value as number) + 7
    else if (typeof value === 'string') out[key] = `${value}-changed` || 'changed'
    else out[key] = value
  }
  return out
}

describe('serialization v2 — every tool round-trips completely', () => {
  for (const def of toolRegistry.all()) {
    it(`${def.type} round-trips style, options, and props`, () => {
      const created = def.create(`id-${def.type}`, anchorsFor(def.anchors))
      expect(created).toBeTruthy()

      // Mutate every channel away from defaults so a dropped field fails loudly.
      created.updateStyle({ lineColor: '#123456', lineWidth: 3, lineStyle: 'dashed', fillOpacity: 0.4 })
      created.updateOptions({ locked: true, zIndex: 9 })
      const defaults = created.props as Record<string, unknown>
      if (Object.keys(defaults).length > 0) {
        created.applyProps(mutatedProps(defaults))
      }

      const first = created.toJSON()
      expect(first.v).toBe(2)
      expect(first.type).toBe(def.type)

      const restored = toolRegistry.restore(first)
      expect(restored).toBeTruthy()
      const second = restored!.toJSON()
      expect(second).toEqual(first)
    })
  }

  it('text content survives the round trip', () => {
    const def = toolRegistry.get('text')!
    const created = def.create('id-text', anchorsFor(1), undefined, undefined, { text: 'entry idea\nsecond line' })
    const restored = toolRegistry.restore(created.toJSON())!
    expect((restored.props as { text: string }).text).toBe('entry idea\nsecond line')
  })

  it('restore rejects unknown types and malformed documents', () => {
    expect(toolRegistry.restore({ v: 2, id: 'x', type: 'nope', anchors: [], style: {}, options: {} } as unknown as SerializedDrawing)).toBeNull()
    expect(toolRegistry.restore({ v: 2, id: 'x', type: 'trend_line', anchors: 'bad', style: {}, options: {} } as unknown as SerializedDrawing)).toBeNull()
  })

  it('tool identity props differ across the line family', () => {
    const ray = toolRegistry.get('ray')!.create('r', anchorsFor(2))
    const extended = toolRegistry.get('extended')!.create('e', anchorsFor(2))
    const arrow = toolRegistry.get('arrow')!.create('a', anchorsFor(2))
    expect(ray.props).toMatchObject({ extendLeft: false, extendRight: true })
    expect(extended.props).toMatchObject({ extendLeft: true, extendRight: true })
    expect(arrow.props).toMatchObject({ rightEnd: 'arrow' })
  })
})

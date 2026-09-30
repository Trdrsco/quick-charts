import { describe, expect, it } from 'vitest'
import type { Viewport } from '../../../src/internal/drawings/core/types'
import { Brush, Highlighter } from '../../../src/internal/drawings/tools/freehand'
import { highlighterStrokeWidth } from '../../../src/internal/drawings/tools/freehand'
import { toolRegistry } from '../../../src/internal/drawings/registry'

describe('freehand selection', () => {
  it.each([Brush, Highlighter])('%s has no handles for its sampled points', (Stroke) => {
    const drawing = new Stroke('stroke', [
      { time: 1 as never, price: 100 },
      { time: 2 as never, price: 101 },
      { time: 3 as never, price: 102 },
    ])
    expect(drawing.getControlPoints({} as Viewport)).toEqual([])
  })

  it('starts a new highlighter at 20 actual pixels and preserves old saved widths', () => {
    expect(toolRegistry.create('highlighter', 'new', [])?.style.lineWidth).toBe(20)
    expect(highlighterStrokeWidth(20)).toBe(20)
    expect(highlighterStrokeWidth(2)).toBe(16)
  })
})

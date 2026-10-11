// The value line: the gradient a line or step line is stroked with, and the lower half of a
// baseline drawn at its own width. It reads the series it is attached to, so these tests hand it a
// series and a canvas that record what was asked of them.
import { describe, expect, it, vi } from 'vitest'
import { createValueLine, valueLinePoints, type ValueLineStroke } from '../../src/widget/valueLine'

const rows = [
  { time: 100, value: 10 },
  { time: 200, value: 30 },
  { time: 300, value: 20 },
  { time: 400, value: 40 },
]

function rig(stroke: ValueLineStroke | null, options: Record<string, unknown> = {}) {
  const chart = {
    timeScale: () => ({ timeToCoordinate: (time: number) => time / 10, getVisibleRange: () => ({ from: 200, to: 300 }) }),
  }
  const series = { data: () => rows, priceToCoordinate: (price: number) => 100 - price, options: () => options }
  const line = createValueLine(chart as never, () => stroke)
  line.attached({ series: series as never })
  const calls: string[] = []
  const gradient = { addColorStop: vi.fn() }
  const ctx = {
    save: () => calls.push('save'),
    restore: () => calls.push('restore'),
    beginPath: () => calls.push('begin'),
    moveTo: (x: number, y: number) => calls.push(`move ${x},${y}`),
    lineTo: (x: number, y: number) => calls.push(`line ${x},${y}`),
    rect: (x: number, y: number, w: number, h: number) => calls.push(`rect ${x},${y},${w},${h}`),
    clip: () => calls.push('clip'),
    stroke: () => calls.push('stroke'),
    setLineDash: (dash: number[]) => calls.push(`dash ${dash.join(',')}`),
    createLinearGradient: vi.fn(() => gradient),
    strokeStyle: '' as unknown,
    lineWidth: 0,
    globalAlpha: 1,
    lineJoin: '',
    lineCap: '',
  }
  const draw = (): void => {
    const view = line.paneViews()[0] as { zOrder: () => string; renderer: () => { draw: (target: unknown) => void } }
    view.renderer().draw({
      useBitmapCoordinateSpace: (fn: (scope: unknown) => void) => fn({ context: ctx, bitmapSize: { width: 500, height: 100 }, horizontalPixelRatio: 2, verticalPixelRatio: 2 }),
    })
  }
  return { line, ctx, calls, gradient, draw }
}

describe('the points a value line runs through', () => {
  it('are the visible bars and one bar either side, placed on both scales', () => {
    const points = valueLinePoints(rows as never, { from: 200, to: 300 }, (t) => (t as number) / 10, (v) => 100 - v)
    expect(points).toEqual([
      { x: 10, y: 90 },
      { x: 20, y: 70 },
      { x: 30, y: 80 },
      { x: 40, y: 60 },
    ])
    expect(valueLinePoints(rows as never, { from: 500, to: 600 }, () => 0, () => 0)).toEqual([])
  })
})

describe('the value line', () => {
  it('strokes a vertical gradient from the top color at the highest point to the bottom color at the lowest', () => {
    const { ctx, gradient, calls, draw } = rig({ color: { top: '#d500f9', bottom: '#00bce5' }, width: 2, style: 'solid', steps: false })
    draw()
    // The highest point on screen is y 60 and the lowest y 90, both at twice the pixel ratio.
    expect(ctx.createLinearGradient).toHaveBeenCalledWith(0, 120, 0, 180)
    expect(gradient.addColorStop.mock.calls).toEqual([[0, '#d500f9'], [1, '#00bce5']])
    expect(ctx.lineWidth).toBe(4)
    expect(calls).toContain('dash ')
    expect(calls.filter((c) => c.startsWith('line'))).toHaveLength(3)
    expect(calls.at(-2)).toBe('stroke')
  })

  it('steps for a step line, dashes for a dashed style and fades with a morph', () => {
    const { ctx, calls, draw } = rig({ color: '#2962ff', width: 1, style: 'dashed', steps: true, alpha: 0.5 })
    draw()
    expect(ctx.strokeStyle).toBe('#2962ff')
    expect(ctx.globalAlpha).toBe(0.5)
    expect(calls).toContain('dash 12,12')
    // Each move is a run then a step.
    expect(calls.filter((c) => c.startsWith('line'))).toHaveLength(6)
  })

  it('draws only below the base level for the lower half of a baseline', () => {
    const { calls, draw } = rig({ color: '#f23645', width: 3, style: 'solid', steps: false, belowBase: true }, { baseValue: { type: 'price', price: 25 } })
    draw()
    // The base at price 25 stands at y 75, or 150 at twice the pixel ratio.
    expect(calls).toContain('rect 0,150,500,-50')
    expect(calls).toContain('clip')
  })

  it('draws nothing when the series draws its own line, or before it is attached', () => {
    const { calls, draw } = rig(null)
    draw()
    expect(calls).toEqual([])
    const requestUpdate = vi.fn()
    const line = createValueLine({ timeScale: () => ({}) } as never, () => null)
    expect(() => line.refresh()).not.toThrow()
    line.attached({ requestUpdate })
    line.refresh()
    expect(requestUpdate).toHaveBeenCalledTimes(1)
  })
})

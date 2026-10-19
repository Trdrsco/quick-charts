// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { toolRegistry as drawingTools } from '../../src/internal/drawings/registry'
import { viewportOf } from '../../src/internal/drawings/index'
import { drag } from './fakeChart'
import { rig, type Rig } from './layerRig'

const layers: Rig[] = []
afterEach(() => {
  for (const layer of layers.splice(0)) {
    layer.handle.destroy()
    layer.container.remove()
  }
})

const tools = ['rectangle', 'rotated_rectangle', 'triangle', 'circle', 'ellipse', 'parallel_channel', 'trend_line', 'horizontal_line']

function placed(type: string) {
  const layer = rig()
  layers.push(layer)
  const def = drawingTools.get(type)!
  const points = [[100, 100], [400, 200], [200, 270], [350, 300]]
  const anchors = Array.from({ length: def.anchors || 2 }, (_, i) => {
    const [x, y] = points[i % points.length]!
    return { time: layer.fake.timeAt(x!) as never, price: layer.fake.priceAt(y!) }
  })
  const drawing = def.create('shape', anchors, { fillOpacity: 0.2 })
  const viewport = viewportOf(layer.fake.chart, layer.fake.series)!
  let at: [number, number] | null = null
  for (let y = type === 'horizontal_line' ? 100 : 110; y < 300 && !at; y += 10) {
    for (let x = 110; x < 400; x += 10) {
      if (drawing.testHit({ x, y }, viewport)) { at = [x, y]; break }
    }
  }
  expect(at, type).not.toBeNull()
  layer.handle.restore([drawing.toJSON()])
  return { ...layer, at: at! }
}

describe('drawing pointer ownership', () => {
  it.each(tools)('%s leaves a handled press to the host overlay', (type) => {
    const layer = placed(type)
    const before = layer.handle.export()
    layer.container.addEventListener('pointerdown', (event) => event.preventDefault(), true)
    drag(layer.container, layer.at, [layer.at[0] + 40, layer.at[1] + 30], { cancelable: true })
    expect(layer.handle.export()).toEqual(before)
    expect(layer.fake.applied).toEqual([])
  })

  it.each(tools)('%s still moves from an unclaimed plot press', (type) => {
    const layer = placed(type)
    const before = layer.handle.export()[0]!.anchors
    drag(layer.container, layer.at, [layer.at[0] + 40, layer.at[1] + 30])
    expect(layer.handle.export()[0]!.anchors).not.toEqual(before)
  })

  it('leaves the price scale to the chart when a rectangle extends past the plot', () => {
    const layer = rig()
    layers.push(layer)
    const drawing = drawingTools.get('rectangle')!.create('wide', [
      { time: layer.fake.timeAt(100) as never, price: layer.fake.priceAt(100) },
      { time: layer.fake.timeAt(1200) as never, price: layer.fake.priceAt(300) },
    ], { fillOpacity: 0.2 })
    layer.handle.restore([drawing.toJSON()])
    const before = layer.handle.export()
    drag(layer.container, [1020, 200], [1020, 240])
    expect(layer.handle.export()).toEqual(before)
    expect(layer.fake.applied).toEqual([])
  })
})

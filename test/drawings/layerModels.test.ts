// The pure decisions under the drawing layer: where a copy lands, what the Shift constraint does,
// how an instant tool opens, which chart a drawing belongs to, and what a remembered default keeps.
import { describe, expect, it } from 'vitest'
import { barsShifted, constrain45, imagePlacement, instantPositionAnchors, shiftedAnchors } from '../../src/drawings/layer/geometry'
import { ownsDrawing, scopeForNew } from '../../src/drawings/layer/scope'
import { createPresets, presetOf } from '../../src/drawings/layer/presets'
import { memorySaveLoadAdapter } from '../../src/resources'
import { CLONE_OFFSET_PX, drawingTools } from '../../src/drawings/index'
import { fakeChart } from './fakeChart'
import { viewportOf } from '../../src/internal/drawings/index'

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('geometry', () => {
  it('constrains a point to the nearest 45 degree ray and leaves a zero move alone', () => {
    expect(constrain45({ x: 0, y: 0 }, { x: 100, y: 10 })).toEqual({ x: expect.closeTo(100.499, 2), y: expect.closeTo(0, 6) })
    const diagonal = constrain45({ x: 0, y: 0 }, { x: 100, y: 90 })
    expect(diagonal.x).toBeCloseTo(diagonal.y, 6)
    expect(constrain45({ x: 5, y: 5 }, { x: 5, y: 5 })).toEqual({ x: 5, y: 5 })
  })

  it('shifts every anchor right by the clone offset in the chart time, and keeps an unplaceable one', () => {
    const fake = fakeChart()
    const vp = viewportOf(fake.chart, fake.series)!
    const t0 = fake.timeAt(100)
    const shifted = shiftedAnchors([{ time: t0 as never, price: 150 }], vp)
    expect(fake.xOf(Number(shifted[0]!.time))).toBe(100 + CLONE_OFFSET_PX)
    expect(shiftedAnchors([{ time: t0 as never, price: 150 }], null)[0]!.time).toBe(t0)
  })

  it('opens an instant position with target above and stop below the entry, mirrored for a short', () => {
    const fake = fakeChart()
    const vp = viewportOf(fake.chart, fake.series)!
    const entry = { time: fake.timeAt(200) as never, price: fake.priceAt(200) }
    const long = instantPositionAnchors(entry, { x: 200, y: 200 }, { width: 1000, height: 400 }, vp, false)!
    expect(long[1].price).toBeGreaterThan(entry.price)
    expect(long[2].price).toBeLessThan(entry.price)
    expect(fake.xOf(Number(long[1].time))).toBe(450)
    const short = instantPositionAnchors(entry, { x: 200, y: 200 }, { width: 1000, height: 400 }, vp, true)!
    expect(short[1].price).toBeLessThan(entry.price)
    expect(short[2].price).toBeGreaterThan(entry.price)
  })

  it('centres a dropped picture at a readable width and keeps its aspect', () => {
    const fake = fakeChart()
    const vp = viewportOf(fake.chart, fake.series)!
    const placed = imagePlacement({ width: 2000, height: 1000 }, { width: 1000, height: 400 }, vp)!
    expect(placed.width).toBe(360)
    expect(fake.xOf(Number(placed.anchor.time))).toBe(500 - 180)
    expect(imagePlacement({ width: 100, height: 50 }, { width: 1000, height: 400 }, vp)!.width).toBe(100)
  })

  it('rounds a drag to whole bars, and moves none without a bar spacing', () => {
    expect(barsShifted(26, 10)).toBe(3)
    expect(barsShifted(-14, 10)).toBe(-1)
    expect(barsShifted(50, null)).toBe(0)
  })
})

describe('scope', () => {
  it('a shared row is everyone\'s, a bound row is its chart\'s alone', () => {
    expect(ownsDrawing({}, 'chart-1')).toBe(true)
    expect(ownsDrawing({ scope: 'chart-1' }, 'chart-1')).toBe(true)
    expect(ownsDrawing({ scope: 'chart-2' }, 'chart-1')).toBe(false)
    expect(ownsDrawing({ scope: 'chart-2' }, undefined)).toBe(false)
  })

  it('binds a new drawing only while sync is off and a chart id exists', () => {
    expect(scopeForNew('chart-1', true)).toBeUndefined()
    expect(scopeForNew('chart-1', false)).toBe('chart-1')
    expect(scopeForNew(undefined, false)).toBeUndefined()
  })
})

describe('presets', () => {
  it('a remembered default keeps the setup and drops the content', () => {
    const table = drawingTools.create('table', 'x', [{ time: 1 as never, price: 1 }])!
    table.applyProps({ cells: [['a']], headerRow: true })
    const preset = presetOf(table)
    expect(preset.props).not.toHaveProperty('cells')
    expect(preset.props).toHaveProperty('headerRow', true)
    expect(preset.style?.lineWidth).toBe(table.style.lineWidth)
  })

  it('reads the store once, answers synchronously, and writes through', async () => {
    const adapter = memorySaveLoadAdapter()
    const store = adapter.templates('drawing')
    await store.create({ name: 'Thick', tool: 'trend_line', content: JSON.stringify({ style: { lineWidth: 4 } }) })
    await store.create({ name: '', tool: 'ray', content: JSON.stringify({ style: { lineWidth: 2 } }) })
    const presets = createPresets(store)
    let heard = 0
    presets.subscribe(() => heard++)
    await settle()
    await settle()
    expect(presets.templatesFor('trend_line').map((t) => t.name)).toEqual(['Thick'])
    expect(presets.defaultFor('ray')).toEqual({ style: { lineWidth: 2 } })
    expect(presets.defaultFor('rectangle')).toEqual({})
    expect(heard).toBe(1)

    await presets.saveTemplate('trend_line', 'Thin', { style: { lineWidth: 1 } })
    expect(presets.templatesFor('trend_line').map((t) => t.name).sort()).toEqual(['Thick', 'Thin'])
    expect((await store.list()).filter((r) => r.tool === 'trend_line' && r.name !== '')).toHaveLength(2)

    await presets.removeTemplate('trend_line', 'Thick')
    expect(presets.templatesFor('trend_line').map((t) => t.name)).toEqual(['Thin'])
    expect((await store.list()).filter((r) => r.name === 'Thick')).toHaveLength(0)

    const line = drawingTools.create('rectangle', 'r', [])!
    line.updateStyle({ lineWidth: 3 })
    presets.remember(line)
    expect(presets.defaultFor('rectangle').style?.lineWidth).toBe(3)
    await settle()
    expect((await store.list()).some((r) => r.tool === 'rectangle' && r.name === '')).toBe(true)

    await presets.clearDefault('rectangle')
    expect(presets.defaultFor('rectangle')).toEqual({})
    presets.destroy()
  })

  it('lasts the page without a store', async () => {
    const presets = createPresets(null)
    await presets.saveTemplate('ray', 'Mine', { style: { lineWidth: 2 } })
    expect(presets.templatesFor('ray')).toHaveLength(1)
    await presets.removeTemplate('ray', 'Mine')
    expect(presets.templatesFor('ray')).toHaveLength(0)
  })
})

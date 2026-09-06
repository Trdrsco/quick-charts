// Every registered drawing tool through its whole life: each of the 90 drawing tools is tested for
// registration, construction, serialization, restore, and attach/detach, with focused geometry or
// rendering tests for each tool family where a generic test is insufficient.
//
// drawings90.test.ts pins the catalog; this file builds every tool from it, round-trips it through the
// public codec, attaches and detaches it through the manager the layer uses, and paints it once over the
// fake renderer, so a tool that constructs but cannot be restored, attached or drawn is named by type.
// drawingTools.fixture.json records each tool's placement facts and default props; the family blocks at
// the end pin the values a generic pass cannot see.
import { DrawingManager, type IDrawing } from '../../src/internal/drawings/index'
import type { ISeriesApi, ISeriesPrimitive, SeriesType, Time } from 'lightweight-charts'
import { describe, expect, it } from 'vitest'
import { drawingTools } from '../../src/drawings/index'
import { fakeChart, type FakeChart } from '../drawings/fakeChart'
import fixture from './drawingTools.fixture.json'

/** A drawing as the seam builds it: the public model plus the series-primitive lifecycle and the pane
 *  view the renderer calls. */
type LiveDrawing = IDrawing & ISeriesPrimitive<Time> & { paneViews(): readonly { renderer(): { draw(target: unknown): void } | null }[] }

const live = (drawing: IDrawing | null): LiveDrawing => {
  expect(drawing).not.toBeNull()
  return drawing as LiveDrawing
}

/** Anchors on whole bars of the fake chart, spread across the pane, so every conversion is exact and
 *  every tool has room to draw. */
function anchorsFor(fake: FakeChart, count: number) {
  return Array.from({ length: Math.max(1, count) }, (_, i) => ({ time: fake.timeAt(100 + i * 80) as Time, price: fake.priceAt(80 + i * 30) }))
}

/** A series that records what was attached to it and what was taken off. */
function recordingSeries(fake: FakeChart) {
  const attached: string[] = []
  const detached: string[] = []
  const series = {
    ...fake.series,
    attachPrimitive: (p: unknown) => attached.push((p as IDrawing).id),
    detachPrimitive: (p: unknown) => detached.push((p as IDrawing).id),
  } as unknown as ISeriesApi<SeriesType>
  return { series, attached, detached }
}

/** A canvas context that records every method called on it and takes every property write. */
function recordingContext(calls: string[]): CanvasRenderingContext2D {
  const props = new Map<string | symbol, unknown>()
  return new Proxy({} as CanvasRenderingContext2D, {
    get: (_t, p) => {
      if (p === 'measureText') return (text: string) => ({ width: text.length * 7, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 })
      if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => ({ addColorStop: () => undefined })
      if (props.has(p)) return props.get(p)
      return (..._args: unknown[]) => {
        calls.push(String(p))
        return undefined
      }
    },
    set: (_t, p, v) => {
      props.set(p, v)
      return true
    },
  })
}

/** The renderer's drawing target: both coordinate spaces hand the same fake context over. */
function fakeTarget(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const scope = { context: ctx, mediaSize: { width, height }, bitmapSize: { width, height }, horizontalPixelRatio: 1, verticalPixelRatio: 1 }
  return {
    useMediaCoordinateSpace: (cb: (s: typeof scope) => void) => cb(scope),
    useBitmapCoordinateSpace: (cb: (s: typeof scope) => void) => cb(scope),
  }
}

/** Context methods that put ink on the canvas. `save` and `restore` are the pane view's own and prove
 *  nothing about the tool. */
const PAINTS = new Set(['stroke', 'fill', 'fillText', 'strokeText', 'fillRect', 'strokeRect', 'drawImage', 'clip'])

describe('every registered tool', () => {
  const fake = fakeChart()

  for (const row of fixture.tools) {
    describe(row.type, () => {
      const def = drawingTools.get(row.type)
      const anchors = anchorsFor(fake, row.anchors)

      it('is registered with the facts the fixture records', () => {
        expect(def).toBeDefined()
        expect({
          category: def!.category,
          anchors: def!.anchors,
          placement: def!.placement ?? null,
          hasText: def!.hasText ?? false,
          capturesBars: def!.capturesBars ?? false,
          style: def!.style ?? null,
        }).toEqual({ category: row.category, anchors: row.anchors, placement: row.placement, hasText: row.hasText, capturesBars: row.capturesBars, style: row.style })
      })

      it('constructs from the catalog at its anchor count, with its default props', () => {
        const d = live(drawingTools.create(row.type, `id-${row.type}`, anchors))
        expect(d.id).toBe(`id-${row.type}`)
        expect(d.type).toBe(row.type)
        expect(d.anchors).toHaveLength(anchors.length)
        expect(Object.keys(d.props).sort()).toEqual(row.props)
        expect(d.isValid()).toBe(true)
      })

      it('serializes and restores through the public codec without loss', () => {
        const d = live(drawingTools.create(row.type, `id-${row.type}`, anchors, { lineColor: '#123456', lineWidth: 3 }))
        d.updateOptions({ locked: true, zIndex: 4 })
        const first = d.toJSON()
        expect(first.v).toBe(2)
        expect(first.type).toBe(row.type)
        const restored = live(drawingTools.restore(first))
        expect(restored.toJSON()).toEqual(first)
        expect(restored.style.lineColor).toBe('#123456')
        expect(restored.options.locked).toBe(true)
      })

      it('attaches to a series through the manager and detaches clean', () => {
        const { series, attached, detached } = recordingSeries(fake)
        const manager = new DrawingManager()
        const d = live(drawingTools.create(row.type, `id-${row.type}`, anchors))
        manager.add(d)
        expect(attached).toEqual([])
        manager.attach(fake.chart, series)
        expect(manager.isAttached()).toBe(true)
        expect(attached).toEqual([d.id])
        manager.detach()
        expect(manager.isAttached()).toBe(false)
        expect(detached).toEqual([d.id])
        manager.attach(fake.chart, series)
        manager.remove(d.id)
        expect(detached).toEqual([d.id, d.id])
      })

      it('paints over the fake renderer once attached, and answers inert once detached', () => {
        const d = live(drawingTools.create(row.type, `id-${row.type}`, anchors))
        const calls: string[] = []
        const ctx = recordingContext(calls)
        const target = fakeTarget(ctx, fake.chart.timeScale().width(), fake.chart.paneSize().height)
        d.attached?.({ chart: fake.chart, series: fake.series, requestUpdate: () => undefined } as never)
        expect(d.getViewport()).not.toBeNull()
        const views = d.paneViews()
        expect(views.length).toBeGreaterThan(0)
        for (const view of views) view.renderer()?.draw(target as never)
        expect(calls.some((c) => PAINTS.has(c)), `painted with: ${[...new Set(calls)].join(', ')}`).toBe(true)
        d.detached?.()
        expect(d.getViewport()).toBeNull()
      })
    })
  }

  it('covers the whole catalog, and nothing the catalog does not hold', () => {
    expect(fixture.tools.map((t) => t.type)).toEqual(
      drawingTools
        .all()
        .map((t) => t.type)
        .sort(),
    )
    expect(fixture.tools).toHaveLength(90)
  })
})

describe('the line family', () => {
  const fake = fakeChart()
  const props = (type: string) => live(drawingTools.create(type, type, anchorsFor(fake, 2))).props

  it('extends where its name says: a ray forward, an extended line both ways, a trend line neither', () => {
    expect(props('trend_line')).toMatchObject({ extendLeft: false, extendRight: false })
    expect(props('ray')).toMatchObject({ extendLeft: false, extendRight: true })
    expect(props('extended')).toMatchObject({ extendLeft: true, extendRight: true })
    expect(props('arrow')).toMatchObject({ rightEnd: 'arrow' })
  })

  it('the one-anchor lines show their own axis: price for horizontal, time for vertical, both for the cross', () => {
    expect(props('horizontal_line')).toMatchObject({ showPrice: true })
    expect(props('horizontal_ray')).toMatchObject({ showPrice: true })
    expect(props('vertical_line')).toMatchObject({ showTime: true })
    expect(props('cross_line')).toMatchObject({ showPrice: true, showTime: true })
  })
})

describe('the leveled families', () => {
  const fake = fakeChart()
  const levels = (type: string, count: number): { value: number; visible: boolean }[] =>
    live(drawingTools.create(type, type, anchorsFor(fake, count))).props.levels as { value: number; visible: boolean }[]

  it('fibonacci tools start on the classic ratios, every level a number with its own visibility', () => {
    const fib = levels('fib_retracement', 2)
    expect(fib.map((l) => l.value)).toEqual(expect.arrayContaining([0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.618]))
    for (const l of fib) expect(typeof l.visible).toBe('boolean')
    for (const type of ['fib_trend_ext', 'fib_channel', 'fib_timezone', 'fib_speed_resist_fan', 'fib_trend_time', 'fib_circles', 'fib_speed_resist_arcs', 'fib_wedge', 'pitchfan']) {
      expect(levels(type, drawingTools.get(type)!.anchors).length, type).toBeGreaterThan(0)
    }
  })

  it('the four pitchforks share one level ladder and differ by variant', () => {
    const variants = ['pitchfork', 'schiff_pitchfork', 'schiff_pitchfork_modified', 'inside_pitchfork'].map((type) => ({
      type,
      variant: live(drawingTools.create(type, type, anchorsFor(fake, 3))).props.variant,
      levels: levels(type, 3).map((l) => l.value),
    }))
    expect(variants.map((v) => v.variant)).toEqual(['original', 'schiff', 'modified_schiff', 'inside'])
    for (const v of variants) expect(v.levels).toEqual([0.25, 0.5, 0.75, 1, 1.5, 2])
  })

  it('the gann boxes divide the box on the gann ratios, and the fan draws the gann angles', () => {
    for (const type of ['gannbox', 'gannbox_square', 'gannbox_fixed']) {
      expect(levels(type, 2).map((l) => l.value), type).toEqual([0, 0.25, 0.382, 0.5, 0.618, 0.75, 1])
    }
    expect(levels('gannbox_fan', 2).map((l) => l.value)).toEqual([8, 4, 3, 2, 1, 1 / 2, 1 / 3, 1 / 4, 1 / 8])
  })
})

describe('the forecasting, content and table families', () => {
  const fake = fakeChart()
  const props = (type: string) => live(drawingTools.create(type, type, anchorsFor(fake, drawingTools.get(type)!.anchors))).props

  it('a position opens with a risk sheet: account, risk as a percent, one lot, no leverage', () => {
    for (const type of ['long_position', 'short_position']) {
      expect(props(type), type).toMatchObject({ accountSize: 1000, risk: 25, riskDisplay: 'percent', lotSize: 1, leverage: 1, showPrices: true, compact: false })
    }
  })

  it('the bar-capturing tools start empty and capture on placement', () => {
    expect(props('bars_pattern')).toMatchObject({ bars: [], mode: 'bars', mirrored: false, flipped: false })
    expect(drawingTools.get('bars_pattern')!.capturesBars).toBe(true)
    expect(drawingTools.get('ghost_feed')!.capturesBars).toBe(true)
  })

  it('a table opens as a two by two grid with a header row', () => {
    expect(props('table')).toMatchObject({ cells: [['', ''], ['', '']], headerRow: true })
  })

  it('the glyph marks carry a glyph and a size, and an image its data, opacity and width', () => {
    for (const type of ['emoji', 'sticker', 'icon']) expect(Object.keys(props(type)).sort(), type).toEqual(['glyph', 'size'])
    expect(Object.keys(props('image')).sort()).toEqual(['dataUrl', 'opacity', 'width'])
  })
})

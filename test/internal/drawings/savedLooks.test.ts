// What a drawing saved at format 2 paints once it is restored. A format-2 save carries the props and
// style its tool wrote at format 2, and each tool whose factory values, prop meanings or paint rules
// differ at format 3 writes, as it restores, the values that paint the save as it was painted. Each
// case here restores a save built from the props a format-2 save of its tool carries and reads what
// it paints or the props it ends with; a drawing saving at format 3 restores as it was saved.
import { describe, expect, it } from 'vitest'
import { drawingTools } from '../../../src/drawings/index'
import { presetOf, presetPropsFor } from '../../../src/drawings/layer/presets'
import { DEFAULT_OPTIONS, DEFAULT_STYLE, SERIAL_VERSION } from '../../../src/internal/drawings/index'
import type { Anchor, DrawingStyle, IDrawing, SerializedDrawing, Viewport } from '../../../src/internal/drawings/index'

/** A pane 800 by 400 where a time is its own x and a price stands that far up from the bottom. */
const viewport: Viewport = {
  width: 800,
  height: 400,
  xOf: (time) => Number(time),
  yOf: (price) => 400 - price,
  timeAt: (x) => x as never,
  priceAt: (y) => 400 - y,
  barsBetween: (a, b) => (Number(b) - Number(a)) / 10,
  logicalOf: (time) => Number(time) / 10,
  timeOfLogical: (logical) => (logical * 10) as never,
}

/** Eighty bars a time step of ten apart, swinging about 200 with volume on each. */
const bars = Array.from({ length: 80 }, (_, i) => {
  const close = 200 + Math.round(60 * Math.sin(i / 6))
  const open = close + (i % 2 === 0 ? -6 : 6)
  return { time: (i * 10) as never, open, high: Math.max(open, close) + 8, low: Math.min(open, close) - 8, close, volume: 1000 + ((i * 37) % 400) }
})

interface Call {
  name: string
  args: unknown[]
  fillStyle?: unknown
  strokeStyle?: unknown
  lineWidth?: unknown
  alpha?: unknown
  dash: number[]
  font?: unknown
  textAlign?: unknown
}

function painted(d: IDrawing): Call[] {
  const calls: Call[] = []
  const state = new Map<string | symbol, unknown>()
  let dash: number[] = []
  const stack: { dash: number[]; state: Map<string | symbol, unknown> }[] = []
  const ctx = new Proxy({} as CanvasRenderingContext2D, {
    get: (_t, p) => {
      if (p === 'measureText') return (text: string) => ({ width: text.length * 7 })
      if (p === 'setLineDash') return (d: number[]) => void (dash = [...d])
      if (p === 'save') return () => void stack.push({ dash: [...dash], state: new Map(state) })
      if (p === 'restore')
        return () => {
          const top = stack.pop()
          if (!top) return
          dash = top.dash
          state.clear()
          for (const [k, v] of top.state) state.set(k, v)
        }
      if (state.has(p)) return state.get(p)
      return (...args: unknown[]) => {
        calls.push({
          name: String(p),
          args,
          fillStyle: state.get('fillStyle'),
          strokeStyle: state.get('strokeStyle'),
          lineWidth: state.get('lineWidth'),
          alpha: state.get('globalAlpha') ?? 1,
          dash: [...dash],
          font: state.get('font'),
          textAlign: state.get('textAlign'),
        })
      }
    },
    set: (_t, p, v) => {
      state.set(p, v)
      return true
    },
  })
  ;(d as IDrawing & { paint(ctx: CanvasRenderingContext2D, v: Viewport): void }).paint(ctx, viewport)
  return calls
}
const named = (calls: Call[], name: string): Call[] => calls.filter((c) => c.name === name)
const texts = (d: IDrawing): unknown[] => named(painted(d), 'fillText').map((c) => c.args[0])

const at = (time: number, price: number): Anchor => ({ time: time as never, price })

/** A format-2 save of a tool: its points, the style it wrote over the default, and its props. */
function format2(type: string, points: [number, number][], style: Partial<DrawingStyle>, props?: Record<string, unknown>): SerializedDrawing {
  return {
    v: 2,
    id: `saved-${type}`,
    type,
    anchors: points.map(([time, price]) => at(time, price)),
    style: { ...DEFAULT_STYLE, ...style },
    options: { ...DEFAULT_OPTIONS },
    ...(props ? { props } : {}),
  }
}

/** The drawing a save restores to, on the bars, with prices written to the cent. */
function restored(save: SerializedDrawing): IDrawing & Record<string, never> {
  const d = drawingTools.restore(save)
  if (!d) throw new Error(`${save.type} did not restore`)
  const host = d as unknown as { setBarSource(s: () => typeof bars): void; setPriceFormatter(f: (p: number) => string): void }
  host.setBarSource(() => bars)
  host.setPriceFormatter((p) => p.toFixed(2))
  return d as IDrawing & Record<string, never>
}

const levels = (values: readonly number[], hidden: readonly number[] = []): { value: number; visible: boolean }[] => values.map((value) => ({ value, visible: !hidden.includes(value) }))

/** The props a format-2 line of the trend line family carries. */
const LINE = {
  text: '',
  extendLeft: false,
  extendRight: false,
  leftEnd: 'normal',
  rightEnd: 'normal',
  middlePoint: false,
  showPriceLabels: false,
  showPriceRange: false,
  showPercentChange: false,
  showBarsRange: false,
  showDateTimeRange: false,
  showAngle: false,
  statsPosition: 'center',
}

describe('the format a drawing saves in', () => {
  it('is format 3, and a format-3 save restores as it was saved', () => {
    const brush = drawingTools.create('brush', 'b', [at(100, 150), at(160, 190), at(220, 140)])!
    brush.updateStyle({ fillOpacity: 0.3 })
    const save = brush.toJSON()
    expect(save.v).toBe(SERIAL_VERSION)
    expect(SERIAL_VERSION).toBe(3)
    const again = restored(save)
    expect(again.props).toMatchObject({ fillBackground: false })
    expect(named(painted(again), 'fill')).toEqual([])
  })

  it('restores a format-2 save once with its look, and saves it at format 3 with that look', () => {
    const save = format2('brush', [[100, 150], [160, 190], [220, 140]], { fillOpacity: 0.3 })
    const brush = restored(save)
    expect(brush.props).toMatchObject({ fillBackground: true })
    const resaved = brush.toJSON()
    expect(resaved.v).toBe(3)
    expect(resaved.props).toMatchObject({ fillBackground: true })
    expect(restored(resaved).props).toEqual(brush.props)
  })
})

describe('a format-2 line', () => {
  it('shows its stats at rest, counting its left and right from its first point', () => {
    const save = format2('trend_line', [[300, 120], [100, 280]], {}, { ...LINE, showPriceRange: true, statsPosition: 'left' })
    const line = restored(save)
    expect(line.props).toMatchObject({ alwaysShowStats: true, statsPosition: 'right', showPipsChange: false })
    expect(texts(line)).toEqual(['+160.00'])
    const forward = restored(format2('trend_line', [[100, 280], [300, 120]], {}, { ...LINE, showPriceRange: true, statsPosition: 'left' }))
    expect(forward.props).toMatchObject({ statsPosition: 'left' })
  })

  it('stands the stats at its middle and shows the stats it showed where an earlier save names neither', () => {
    const { statsPosition: _position, showPercentChange: _percent, showDateTimeRange: _span, ...older } = LINE
    void [_position, _percent, _span]
    const info = restored(format2('info_line', [[100, 280], [300, 120]], {}, { ...older, showPriceRange: true, showBarsRange: true, showAngle: true }))
    expect(info.props).toMatchObject({ statsPosition: 'center', showPercentChange: false, showDateTimeRange: false, showPipsChange: false, alwaysShowStats: true })
  })

  it('draws a trend angle’s ends and words as its save carries them', () => {
    const angle = restored(format2('trend_angle', [[100, 280], [300, 120]], {}, { ...LINE, text: 'Swing', leftEnd: 'arrow' }))
    const calls = painted(angle)
    expect(texts(angle)).toContain('Swing')
    // The arrowhead at the first point is a filled triangle in the line's color.
    expect(named(calls, 'fill').some((c) => c.fillStyle === '#4c98fb')).toBe(true)
  })

  it('stands a horizontal line’s words above its left side and a vertical line’s across it at the top', () => {
    const level = restored(format2('horizontal_line', [[300, 200]], {}, { text: 'Level', showPrice: true }))
    expect(level.props).toMatchObject({ textVAlign: 'top', textHAlign: 'left' })
    const time = restored(format2('vertical_line', [[300, 200]], {}, { text: 'Open', showTime: true }))
    expect(time.props).toMatchObject({ textOrientation: 'horizontal', textVAlign: 'top', textHAlign: 'right' })
    expect(named(painted(time), 'rotate')).toEqual([])
  })
})

describe('format-2 shapes and strokes', () => {
  it('draws a rectangle’s middle line dashed in its own stroke', () => {
    const box = restored(format2('rectangle', [[100, 300], [300, 100]], { lineColor: '#ff0000', lineWidth: 3 }, { text: '', middleLine: true, extendLeft: false, extendRight: false }))
    expect(box.props).toMatchObject({ middleLineColor: '#ff0000', middleLineWidth: 3, middleLineStyle: 'dashed' })
    const middle = named(painted(box), 'stroke').find((c) => c.strokeStyle === '#ff0000' && c.dash.length > 0)
    expect(middle?.lineWidth).toBe(3)
  })

  it('fills a curve and a double curve, and a brush, wherever its fill shows', () => {
    for (const [type, points] of [
      ['curve', [[100, 100], [300, 100], [200, 200]]],
      ['double_curve', [[100, 100], [400, 100], [200, 200], [300, 50]]],
      ['brush', [[100, 150], [160, 190], [220, 140]]],
    ] as const) {
      const d = restored(format2(type, points.map((p) => [...p] as [number, number]), { fillOpacity: 0.3 }))
      expect(d.props).toMatchObject({ fillBackground: true })
      expect(named(painted(d), 'fill').map((c) => c.fillStyle)).toEqual(['rgba(76, 152, 251, 0.3)'])
    }
    const bare = restored(format2('brush', [[100, 150], [160, 190], [220, 140]], {}))
    expect(bare.props).toMatchObject({ fillBackground: false })
  })
})

describe('a format-2 regression trend and channels', () => {
  it('draws its line in its own stroke, its bands in it at seven tenths, one body between them at 8%, and no correlation', () => {
    const trend = restored(format2('regression_trend', [[100, 0], [300, 0]], {}, { upperDeviation: 2, lowerDeviation: 2, useUpper: true, useLower: true, source: 'close' }))
    expect(trend.props).toMatchObject({ lowerDeviation: -2, baseColor: '#4c98fb', baseWidth: 2, baseStyle: 'solid', upColor: 'rgba(76, 152, 251, 0.7)', downColor: 'rgba(76, 152, 251, 0.7)', showPearsons: false, bodyColor: 'rgba(76, 152, 251, 0.08)' })
    const calls = painted(trend)
    expect(named(calls, 'fill').map((c) => c.fillStyle)).toEqual(['rgba(76, 152, 251, 0.08)'])
    expect(named(calls, 'stroke').map((c) => c.strokeStyle)).toEqual(['rgba(76, 152, 251, 0.7)', 'rgba(76, 152, 251, 0.7)', '#4c98fb'])
    expect(named(calls, 'fillText')).toEqual([])
  })

  it('draws a parallel channel’s sides and its middle in its own stroke and its words over its first side’s start', () => {
    const channel = restored(format2('parallel_channel', [[100, 280], [300, 120], [100, 160]], { fillOpacity: 0.08 }, { text: 'Range', extendLeft: false, extendRight: false, showMiddle: true }))
    const calls = painted(channel)
    expect(named(calls, 'stroke').map((c) => [c.strokeStyle, c.lineWidth, c.dash])).toEqual([
      ['#4c98fb', 2, []],
      ['#4c98fb', 2, [6, 4]],
      ['#4c98fb', 2, []],
    ])
    expect(named(calls, 'fillText').map((c) => [c.args[0], c.args[1], c.args[2]])).toEqual([['Range', 106, 108]])
  })

  it('stands a flat top/bottom’s and a disjoint channel’s words over their first sides’ starts', () => {
    const flat = restored(format2('flat_top_bottom', [[100, 280], [300, 120], [200, 60]], { fillOpacity: 0.08 }, { text: 'Flat', extendLeft: false, extendRight: false, showMiddle: false }))
    expect(named(painted(flat), 'fillText').map((c) => [c.args[1], c.args[2]])).toEqual([[106, 108]])
    const disjoint = restored(format2('disjoint_channel', [[100, 280], [300, 120], [100, 60], [300, 200]], { fillOpacity: 0.08 }, { text: 'Split', extendLeft: false, extendRight: false, showMiddle: false }))
    expect(named(painted(disjoint), 'fillText').map((c) => [c.args[1], c.args[2]])).toEqual([[106, 108]])
  })
})

describe('format-2 fibs', () => {
  const fib = (extra: Record<string, unknown> = {}) => ({ extendLeft: false, extendRight: false, showPrices: true, showLevels: true, reverse: false, background: true, ...extra })

  it('draws a retracement with no trend line, its bands at 7% by the level below each on the pane, and its labels before its left end, a level’s words first', () => {
    const save = format2('fib_retracement', [[100, 280], [300, 120]], {}, fib({ levels: [{ value: 0, visible: true, text: 'Top' }, { value: 0.5, visible: true }, { value: 1, visible: true }] }))
    const r = restored(save)
    expect(r.props).toMatchObject({ trendLine: false, backgroundOpacity: 0.07, fillBackground: true })
    const calls = painted(r)
    // Level 0 stands at the second point (120, y 280), so the levels climb the pane: each band takes
    // the color of the level below it, the half's band above it and level 0's below it.
    expect(named(calls, 'fill').map((c) => c.fillStyle)).toEqual(['rgba(76, 175, 80, 0.07)', 'rgba(120, 123, 134, 0.07)'])
    expect(named(calls, 'fillText').map((c) => [c.args[0], c.args[1], c.textAlign])).toEqual([
      ['Top 0 (120.00)', 94, 'right'],
      ['0.5 (200.00)', 94, 'right'],
      ['1 (280.00)', 94, 'right'],
    ])
    expect(named(calls, 'stroke').filter((c) => c.dash.length > 0)).toEqual([])
  })

  it('draws an extension’s swing dashed in its own stroke at half its opacity', () => {
    const ext = restored(format2('fib_trend_ext', [[100, 120], [300, 280], [450, 170]], {}, fib({ levels: levels([0, 0.382, 0.618, 1, 1.382, 1.618, 2.618, 3.618, 4.236], [3.618, 4.236]) })))
    expect(ext.props).toMatchObject({ trendLine: true, trendLineColor: 'rgba(76, 152, 251, 0.5)', trendLineWidth: 2, trendLineStyle: 'dashed' })
    expect(named(painted(ext), 'stroke').filter((c) => c.strokeStyle === 'rgba(76, 152, 251, 0.5)').map((c) => c.dash)).toEqual([[6, 4], [6, 4]])
  })

  it('draws a fib channel’s bands at 6% and its labels before its first points, reading the price there', () => {
    const channel = restored(format2('fib_channel', [[300, 280], [100, 120], [300, 180]], {}, fib({ levels: levels([0, 0.5, 1]) })))
    expect(channel.props).toMatchObject({ backgroundOpacity: 0.06 })
    const calls = painted(channel)
    expect(named(calls, 'fill').map((c) => c.fillStyle)).toEqual(['rgba(76, 175, 80, 0.06)', 'rgba(120, 123, 134, 0.06)'])
    // The first point stands on the right, so each label stands before it there, read toward it.
    expect(named(calls, 'fillText').map((c) => [c.args[0], c.args[1], c.textAlign])).toEqual([
      ['0 (280.00)', 294, 'right'],
      ['0.5 (230.00)', 294, 'right'],
      ['1 (180.00)', 294, 'right'],
    ])
  })

  it('draws a time zone and a trend-based time fib with no bands and no trend line, labelled at the pane’s foot', () => {
    const zone = restored(format2('fib_timezone', [[100, 200], [200, 200]], {}, fib({ levels: levels([0, 1, 2, 3]), background: true })))
    expect(zone.props).toMatchObject({ fillBackground: false, labelsHAlign: 'right', labelsVAlign: 'bottom' })
    expect(named(painted(zone), 'fill')).toEqual([])
    const time = restored(format2('fib_trend_time', [[100, 120], [200, 280], [300, 170]], {}, fib({ levels: levels([0, 1, 2]), background: false })))
    expect(time.props).toMatchObject({ trendLine: false, fillBackground: false })
    expect(named(painted(time), 'stroke').filter((c) => c.dash.length > 0)).toEqual([])
  })

  it('draws circles with no trend line and no bands, their percents to the whole number', () => {
    const circles = restored(format2('fib_circles', [[100, 200], [300, 200]], {}, fib({ levels: levels([0.382, 0.618, 1]), coeffsAsPercents: true })))
    expect(circles.props).toMatchObject({ trendLine: false, fillBackground: false, roundPercents: true })
    expect(texts(circles)).toEqual(['38%', '62%', '100%'])
    expect(named(painted(circles), 'fill')).toEqual([])
  })

  it('draws arcs with their trend line dashed at 45% of the stroke and no bands, and a wedge’s rays in the stroke', () => {
    const arcs = restored(format2('fib_speed_resist_arcs', [[100, 280], [300, 120]], {}, fib({ levels: levels([0.382, 0.5, 0.618, 1]), fullCircles: false })))
    expect(arcs.props).toMatchObject({ trendLine: true, trendLineColor: 'rgba(76, 152, 251, 0.45)', trendLineStyle: 'dashed', fillBackground: false })
    const wedge = restored(format2('fib_wedge', [[100, 280], [300, 120], [350, 240]], { lineColor: '#ff0000' }, fib({ levels: levels([0.382, 0.5, 0.618, 1]) })))
    expect(wedge.props).toMatchObject({ trendLine: true, trendLineColor: '#ff0000', trendLineWidth: 2, trendLineStyle: 'solid', fillBackground: false })
    expect(named(painted(wedge), 'fill')).toEqual([])
  })

  it('paints a pitchfan’s levels and labels as format 2 did until its settings change', () => {
    const fan = restored(format2('pitchfan', [[100, 280], [450, 230], [300, 120]], {}, fib({ levels: levels([0, 0.25, 0.5, 0.75, 1]) })))
    expect(fan.props).toMatchObject({ medianColor: '#787b86', fillBackground: false })
    const calls = painted(fan)
    // Zero draws the median alone; each other level draws a pair of rays, each with its ratio.
    expect(named(calls, 'stroke')).toHaveLength(9)
    expect(texts(fan)).toEqual(['0', '0.25', '0.25', '0.5', '0.5', '0.75', '0.75', '1', '1'])
    fan.applyProps({ backgroundOpacity: 0.3 })
    expect(fan.props).toMatchObject({ savedLook: null })
    expect(texts(fan)).toEqual([])
  })

  it('paints a speed fan’s outline, rays and labels as format 2 did until its settings change', () => {
    const fan = restored(format2('fib_speed_resist_fan', [[100, 280], [300, 120]], {}, fib({ levels: levels([0.25, 0.5, 1]) })))
    const calls = painted(fan)
    const outline = named(calls, 'strokeRect')[0]!
    expect([outline.args, outline.alpha, outline.dash]).toEqual([[100, 120, 200, 160], 0.45, [6, 4]])
    expect(texts(fan)).toEqual(['0.25 (240.00)', '0.5 (200.00)', '1 (120.00)'])
    fan.applyProps({ grid: true })
    expect(fan.props).toMatchObject({ savedLook: null })
    expect(named(painted(fan), 'strokeRect')).toEqual([])
  })
})

describe('format-2 forks and gann tools', () => {
  it('draws a fork’s median and lines in its own stroke and its bands in its stroke color, darker toward the median', () => {
    const fork = restored(format2('pitchfork', [[100, 280], [450, 230], [300, 120]], {}, { variant: 'original', extendLines: false, levels: levels([0.25, 0.5, 0.75, 1, 1.5, 2], [0.25, 0.75, 1.5, 2]), background: true }))
    expect(fork.props).toMatchObject({ medianColor: '#4c98fb', medianWidth: 2, medianStyle: 'solid', shadedBands: true })
    const calls = painted(fork)
    expect(named(calls, 'fill').map((c) => c.fillStyle)).toEqual([
      'rgba(76, 152, 251, 0.12)',
      'rgba(76, 152, 251, 0.09)',
      'rgba(76, 152, 251, 0.12)',
      'rgba(76, 152, 251, 0.09)',
    ])
    expect(new Set(named(calls, 'stroke').map((c) => c.strokeStyle))).toEqual(new Set(['#4c98fb']))
  })

  it('draws a gann box from its first corner, its labels before its left side, a 5% tint and no bands', () => {
    const box = restored(format2('gannbox', [[100, 280], [300, 120]], {}, { levels: levels([0, 0.25, 0.5, 1], [0.25]), showLabels: true, background: true }))
    expect(box.props).toMatchObject({ reverse: true, showLeftLabels: true, showRightLabels: false, showTopLabels: false, showBottomLabels: false, fillPriceBackground: false, fillTimeBackground: false, tint: 'rgba(76, 152, 251, 0.05)' })
    const calls = painted(box)
    expect(named(calls, 'fillRect').map((c) => c.fillStyle)).toEqual(['rgba(76, 152, 251, 0.05)'])
    // The shown levels take the palette's colors for their places among the shown ones.
    expect(named(calls, 'fillText').map((c) => [c.args[0], c.args[2]])).toEqual([
      ['0', 120],
      ['0.5', 200],
      ['1', 280],
    ])
  })

  it('paints a gann square and a fixed square as format 2’s box until their settings change', () => {
    const square = restored(format2('gannbox_square', [[100, 280], [300, 120]], {}, { levels: levels([0, 0.5, 1]), showLabels: true, background: true }))
    const calls = painted(square)
    expect(named(calls, 'fillRect').map((c) => c.fillStyle)).toEqual(['rgba(76, 152, 251, 0.05)'])
    // Three levels divide both sides, and the square crosses its box corner to corner.
    expect(named(calls, 'stroke')).toHaveLength(8)
    expect(texts(square)).toEqual(['0', '0.5', '1'])
    square.applyProps({ fillBackground: false })
    expect(square.props).toMatchObject({ savedLook: null })
    const fixed = restored(format2('gannbox_fixed', [[100, 280], [300, 200]], {}, { levels: levels([0, 1]), showLabels: false, background: false }))
    expect(named(painted(fixed), 'stroke')).toHaveLength(4)
    expect(texts(fixed)).toEqual([])
  })

  it('draws a gann fan with no bands, its rays in the colors of their places among the shown ones', () => {
    const fan = restored(format2('gannbox_fan', [[100, 280], [200, 180]], {}, { levels: levels([8, 4, 3, 2, 1, 0.5, 1 / 3, 0.25, 0.125], [8]), showLabels: true, background: true }))
    expect(fan.props).toMatchObject({ fillBackground: false })
    const strokes = named(painted(fan), 'stroke').map((c) => c.strokeStyle)
    expect(strokes.slice(0, 2)).toEqual(['#2962ff', '#f23645'])
  })
})

describe('format-2 patterns and waves', () => {
  it('carries no empty words, so a pattern saved without any offers no Text page', () => {
    const pattern = restored(format2('abcd_pattern', [[100, 120], [300, 280], [450, 170], [560, 250]], {}, { text: '' }))
    expect('text' in pattern.props).toBe(false)
  })

  it('stands a pattern’s pills at 9px and draws its words above it', () => {
    const pattern = restored(format2('xabcd_pattern', [[100, 120], [300, 280], [450, 170], [560, 250], [640, 150]], { fillOpacity: 0.12 }, { text: 'Bat' }))
    expect(pattern.props).toMatchObject({ pillRadius: 9 })
    const calls = painted(pattern)
    expect(named(calls, 'arc').map((c) => c.args[2])).toEqual([9, 9, 9, 9, 9])
    expect(texts(pattern)).toContain('Bat')
  })

  it('completes a six-point three drives with its reversal on its third drive, drawing as it was saved', () => {
    const drives = restored(format2('three_drives', [[100, 120], [200, 200], [300, 150], [400, 240], [500, 190], [600, 280]], {}, { text: 'Drives' }))
    expect(drives.anchors).toHaveLength(7)
    expect(drives.anchors[6]).toEqual(drives.anchors[5])
    const words = named(painted(drives), 'fillText').find((c) => c.args[0] === 'Drives')!
    expect(words.args[1]).toBe(350)
  })

  it('writes a wave count’s numbers and letters in pills, with its words', () => {
    const wave = restored(format2('elliott_correction', [[100, 120], [300, 280], [450, 170], [560, 250]], {}, { text: 'ABC' }))
    expect(wave.props).toMatchObject({ labelPills: true, pillRadius: 9, showWave: true })
    expect(texts(wave)).toEqual(['0', 'A', 'B', 'C', 'ABC'])
    expect(named(painted(wave), 'arc')).toHaveLength(4)
  })
})

describe('format-2 forecasting tools', () => {
  const POSITION = { accountSize: 1000, risk: 25, riskDisplay: 'percent', lotSize: 1, leverage: 1, profitColor: 'rgba(8, 153, 129, 0.2)', stopColor: 'rgba(242, 54, 69, 0.2)', showPrices: true, compact: false }

  it('shows a position’s tags at rest, compact tags reading their offsets alone', () => {
    const plan = restored(format2('long_position', [[100, 200], [300, 280], [300, 160]], { textColor: '#ffffff' }, POSITION))
    expect(plan.props).toMatchObject({ alwaysShowStats: true, savedWords: true })
    expect(texts(plan).slice(0, 3)).toEqual(['Target: 80.00 (40.00%), Amount: 1400.00', 'Stop: 40.00 (20.00%), Amount: 800.00', 'Closed PnL: -200.00, Qty: 5.00, Risk/Reward Ratio: 2.00'])
    ;(plan as unknown as { setTickSize(t: number): void }).setTickSize(0.25)
    expect(texts(plan)[0]).toBe('Target: 80.00 (40.00%), 320, Amount: 1400.00')
    const compact = restored(format2('long_position', [[100, 200], [300, 280], [300, 160]], { textColor: '#ffffff' }, { ...POSITION, compact: true }))
    expect(texts(compact)[0]).toBe('80.00 (40.00%)')
    const { leverage: _leverage, ...older } = POSITION
    void _leverage
    expect(restored(format2('short_position', [[100, 200], [300, 120], [300, 240]], {}, older)).props).toMatchObject({ leverage: 1 })
  })

  it('fills a sector in its background as one slice, and colors a forecast that names none as format 2 did', () => {
    const sector = restored(format2('sector', [[100, 280], [300, 120], [350, 240]], { fillOpacity: 0.2 }))
    expect(sector.props).toMatchObject({ color1: 'rgba(76, 152, 251, 0.2)', color2: 'rgba(76, 152, 251, 0.2)', fillBackground: true })
    expect(named(painted(sector), 'fill')).toHaveLength(1)
    const forecast = restored(format2('forecast', [[100, 200], [300, 260]], {}, {}))
    expect(forecast.props).toMatchObject({ sourceBackColor: '#2962ff', targetBackColor: '#089981', targetBorderColor: '#089981', successBackColor: '#089981' })
  })
})

describe('format-2 bar and volume tools', () => {
  it('paints a bars pattern’s candles until a mode is chosen', () => {
    const save = format2('bars_pattern', [[100, 200], [300, 200]], {}, { bars: [{ o: 200, h: 210, l: 190, c: 205 }, { o: 205, h: 215, l: 200, c: 202 }], mirrored: false, flipped: false, mode: 'bars' })
    const pattern = restored(save)
    expect(pattern.props).toMatchObject({ mode: 'hl', candles: true })
    // Each candle is its wick and its body.
    const calls = painted(pattern)
    expect([named(calls, 'stroke').length, named(calls, 'fillRect').length]).toEqual([2, 2])
    pattern.applyProps({ mode: 'oc' })
    expect(pattern.props).toMatchObject({ candles: false })
    const older = restored(format2('bars_pattern', [[100, 200], [300, 200]], {}, { bars: [{ o: 200, h: 210, l: 190, c: 205 }] }))
    expect(older.props).toMatchObject({ candles: true })
  })

  it('draws an anchored VWAP alone, with no bands', () => {
    const vwap = restored(format2('anchored_vwap', [[100, 200]], {}))
    expect(vwap.props).toMatchObject({ bandsOn: [false, false, false] })
    expect(named(painted(vwap), 'stroke')).toHaveLength(1)
  })

  it('draws a profile’s rows at 30% and 80% of their colors, its levels at 90%, its range outlined, nothing on the scale', () => {
    const PROFILE = { rowsLayout: 'number', rowSize: 24, volume: 'updown', valueAreaVolume: 100, upColor: '#089981', downColor: '#f23645', valueAreaUpColor: '#089981', valueAreaDownColor: '#f23645', widthPercent: 30, placement: 'left', pocVisible: true, pocColor: '#f23645', pocWidth: 2, pocStyle: 'solid', vahVisible: true, vahColor: '#787b86', vahWidth: 1, vahStyle: 'dashed', valVisible: true, valColor: '#787b86', valWidth: 1, valStyle: 'dashed', developingPoc: false, developingVa: false }
    const profile = restored(format2('fixed_range_volume_profile', [[100, 200], [300, 200]], {}, { ...PROFILE, extendRight: false }))
    expect(profile.props).toMatchObject({
      upColor: 'rgba(8, 153, 129, 0.3)',
      downColor: 'rgba(242, 54, 69, 0.3)',
      valueAreaUpColor: 'rgba(8, 153, 129, 0.8)',
      valueAreaDownColor: 'rgba(242, 54, 69, 0.8)',
      pocColor: 'rgba(242, 54, 69, 0.9)',
      vahColor: 'rgba(120, 123, 134, 0.9)',
      valueAreaVolume: 95,
      showLabelsOnPriceScale: false,
      outline: true,
    })
    const outline = named(painted(profile), 'strokeRect')[0]!
    expect([outline.strokeStyle, outline.dash]).toEqual(['rgba(120, 123, 134, 0.5)', [4, 4]])
    const anchored = restored(format2('anchored_volume_profile', [[100, 200]], {}, { rowsLayout: 'number' }))
    expect(anchored.props).toMatchObject({ rowSize: 24, valueAreaVolume: 70, placement: 'left', boxColor: 'rgba(38, 198, 218, 0)', outline: true })
  })
})

describe('format-2 annotations', () => {
  it('shows a text’s background and keeps its words centered where it saved them so', () => {
    const text = restored(format2('text', [[100, 300]], { fillOpacity: 0.4 }, { text: 'One\nTwo three', align: 'center' }))
    expect(text.props).toMatchObject({ fillBackground: true })
    const calls = painted(text)
    expect(named(calls, 'fill').map((c) => c.fillStyle)).toEqual(['rgba(76, 152, 251, 0.4)'])
    expect(named(calls, 'fillText').map((c) => c.textAlign)).toEqual(['center', 'center'])
  })

  it('keeps a one-point note’s label on its point with its background and its border in its stroke color', () => {
    const save = format2('note', [[100, 300]], { fillColor: '#1b1f27', fillOpacity: 0.95 }, { text: 'Hi', align: 'left' })
    const note = restored(save)
    expect(note.anchors).toEqual([at(100, 300), at(100, 300)])
    expect(note.props).toMatchObject({ text: 'Hi', fillBackground: true, drawBorder: true, borderColor: '#4c98fb' })
    ;(note as unknown as { getViewport(): Viewport }).getViewport = () => viewport
    ;(note as unknown as { attached(p: unknown): void }).attached({ chart: {}, series: {}, requestUpdate: () => undefined })
    expect(note.anchors).toEqual([at(100, 300), at(100, 300)])
    const calls = painted(note)
    expect(named(calls, 'stroke').map((c) => [c.strokeStyle, c.lineWidth])).toEqual([['#4c98fb', 1]])
    expect(named(calls, 'fill').map((c) => c.fillStyle)).toEqual(['rgba(27, 31, 39, 0.95)'])
  })

  it('borders a callout at 1px and fills a price label in its stroke color at 18%', () => {
    const callout = restored(format2('callout', [[100, 300], [300, 120]], { fillColor: '#1b1f27', fillOpacity: 0.95 }, { text: 'Look' }))
    expect(callout.props).toMatchObject({ borderWidth: 1 })
    expect(named(painted(callout), 'stroke').map((c) => c.lineWidth)).toEqual([2, 1])
    const label = restored(format2('price_label', [[100, 250]], {}))
    expect(named(painted(label), 'fill').map((c) => c.fillStyle)).toEqual(['rgba(76, 152, 251, 0.18)', 'rgba(76, 152, 251, 0.18)'])
  })

  it('paints a price note as its box reading the price over its words, tied to the price, until its settings change', () => {
    const note = restored(format2('price_note', [[100, 280], [300, 120]], { fillColor: '#1b1f27', fillOpacity: 0.95 }, { text: 'Target' }))
    const calls = painted(note)
    expect(texts(note)).toEqual(['280.00', 'Target'])
    expect(named(calls, 'fill').map((c) => c.fillStyle)).toEqual(['rgba(27, 31, 39, 0.95)'])
    expect(named(calls, 'stroke').map((c) => [c.strokeStyle, c.lineWidth])).toEqual([
      ['#4c98fb', 2],
      ['#4c98fb', 1],
    ])
    note.applyProps({ labelFontSize: 14 })
    expect(note.props).toMatchObject({ savedLook: null })
  })

  it('sets a pin’s words on its dark plate', () => {
    const pin = restored(format2('pin', [[100, 280]], {}, { text: 'Entry' }))
    expect(pin.style).toMatchObject({ fillColor: '#1b1f27', fillOpacity: 0.95 })
    expect(pin.props).toMatchObject({ fillBackground: true, drawBorder: false })
    expect(named(painted(pin), 'fill').map((c) => c.fillStyle)).toEqual(['#4c98fb', '#ffffff', 'rgba(27, 31, 39, 0.95)'])
  })

  it('paints a signpost as its plate on a stem from its point, its point where it was saved', () => {
    const post = restored(format2('signpost', [[100, 280]], {}, { text: 'News' }))
    ;(post as unknown as { getViewport(): Viewport }).getViewport = () => viewport
    ;(post as unknown as { attached(p: unknown): void }).attached({ chart: {}, series: {}, requestUpdate: () => undefined })
    expect(post.anchors).toEqual([at(100, 280)])
    const calls = painted(post)
    expect(named(calls, 'stroke').map((c) => [c.strokeStyle, c.lineWidth])).toEqual([
      ['#4c98fb', 1.5],
      ['#4c98fb', 1],
    ])
    expect(named(calls, 'fill').map((c) => c.fillStyle)).toEqual(['#4c98fb', 'rgba(27, 31, 39, 0.95)'])
    post.applyProps({ showImage: true })
    expect(post.props).toMatchObject({ savedLook: null })
  })

  it('lays a table’s columns 96px wide and draws its grid at 45% of its stroke, two by two with a header where its save names none', () => {
    const table = restored(format2('table', [[100, 300]], { fillColor: '#1b1f27', fillOpacity: 0.95 }, { cells: [['a', 'b'], ['c', 'd']], headerRow: true, colWidths: [], rowHeights: [] }))
    expect(table.props).toMatchObject({ colWidths: [96, 96] })
    expect(table.style.lineColor).toBe('rgba(76, 152, 251, 0.45)')
    const older = restored(format2('table', [[100, 300]], {}, {}))
    expect(older.props).toMatchObject({ cells: [['', ''], ['', '']], headerRow: true, colWidths: [96, 96] })
  })
})

describe('a preset written at format 2', () => {
  it('names its setup under the keys and meanings its tool reads now, and a present preset reads as it is', () => {
    const trend = drawingTools.create('regression_trend', 'r', [at(100, 0), at(300, 0)])!
    expect(presetPropsFor(trend, { upperDeviation: 2, lowerDeviation: 2, useUpper: true, useLower: true, source: 'close' })).toMatchObject({ lowerDeviation: -2 })
    const present = presetOf(trend).props!
    expect(presetPropsFor(trend, present)).toEqual(present)
    const pattern = drawingTools.create('bars_pattern', 'b', [at(100, 200), at(300, 200)])!
    expect(presetPropsFor(pattern, { mirrored: false, flipped: false, mode: 'bars' })).toEqual({ mirrored: false, flipped: false, mode: 'hl', candles: true })
    const fib = drawingTools.create('fib_retracement', 'f', [at(100, 280), at(300, 120)])!
    expect(presetPropsFor(fib, { background: false, showPrices: true })).toEqual({ fillBackground: false, showPrices: true })
  })

  it('leaves the props that keep a drawing’s own saved look out of the default it gives', () => {
    const fan = restored(format2('pitchfan', [[100, 280], [450, 230], [300, 120]], {}, { levels: levels([0, 0.5, 1]), showLevels: true, background: true }))
    expect(presetOf(fan).props).not.toHaveProperty('savedLook')
    expect(presetOf(fan).props).toMatchObject({ medianColor: '#787b86' })
  })
})

describe('format-2 range meters and glyphs', () => {
  it('shades a meter’s span in its stroke color, 8% at the least, and reads its stats in its text style on a dark plate', () => {
    const meter = restored(format2('price_range', [[100, 120], [300, 280]], {}, { text: '', showPriceDelta: true, showPercent: true, showBars: false, showTimeSpan: false, showVolume: false, extend: false }))
    expect(meter.style).toMatchObject({ fillColor: '#4c98fb', fillOpacity: 0.08 })
    expect(meter.props).toMatchObject({ showPipsChange: false, labelColor: '#e5e7eb', labelFontSize: 13, labelBackgroundColor: 'rgba(27, 31, 39, 0.92)', labelTextStyle: true })
    const calls = painted(meter)
    expect(named(calls, 'fillRect').map((c) => c.fillStyle)).toEqual(['rgba(76, 152, 251, 0.08)'])
    const both = restored(format2('date_and_price_range', [[100, 120], [300, 280]], {}, { text: '', showPriceDelta: true, showPercent: true, showBars: true, showTimeSpan: true, showVolume: true, extend: true }))
    expect(both.props).toMatchObject({ extendLeft: true, extendRight: true })
    expect(named(painted(both), 'fillRect')[0]!.args).toEqual([0, 120, 800, 160])
  })

  it('sizes a glyph whose save names no size as format 2 did', () => {
    expect(restored(format2('emoji', [[100, 200]], {}, { glyph: 'x' })).props).toMatchObject({ size: 28 })
    expect(restored(format2('sticker', [[100, 200]], {}, { glyph: 'x' })).props).toMatchObject({ size: 44 })
    expect(restored(format2('icon', [[100, 200]], {}, { glyph: 'x' })).props).toMatchObject({ size: 24 })
  })
})

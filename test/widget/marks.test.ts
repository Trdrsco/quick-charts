// @vitest-environment happy-dom
// The neutral marks as the chart draws them: the color a mark wears in each mode, and the time-scale
// marks on a recording canvas, each a glyph in a 21px ring or a small dot.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { DARK_THEME, LIGHT_THEME } from '../../src/theme/palettes'
import { MARK_ICONS } from '../../src/ui/controls/icons'
import { attachMarks, createTimescaleMarks, markColor, markersOf, markSlot, type MarkArt } from '../../src/widget/marks'
import type { BarMark, MarkColor, TimescaleMark } from '../../src/marks'
import type { ThemeMode } from '../../src/theme/schema'
import type { FeedBar } from '../../src/datafeed'

beforeAll(() => {
  // The canvas path the glyphs fill; happy-dom has none, so the stand-in keeps the path data.
  vi.stubGlobal(
    'Path2D',
    class {
      constructor(readonly d?: string) {}
    },
  )
})
afterAll(() => {
  vi.unstubAllGlobals()
})
afterEach(() => {
  document.body.replaceChildren()
})

describe('a mark’s color', () => {
  it('resolves a theme role through the mode’s own palette', () => {
    expect(markColor('info', DARK_THEME, 'dark')).toBe(DARK_THEME['status.info'])
    expect(markColor('info', LIGHT_THEME, 'light')).toBe(LIGHT_THEME['status.info'])
    expect(markColor('up', DARK_THEME, 'dark')).toBe(DARK_THEME['series.up'])
  })

  it('wears the side of a pair the mode in effect names', () => {
    const pair: MarkColor = { light: '#7b1fa2', dark: '#ab47bc' }
    expect(markColor(pair, DARK_THEME, 'dark')).toBe('#ab47bc')
    expect(markColor(pair, LIGHT_THEME, 'light')).toBe('#7b1fa2')
    const bar: BarMark = { id: 'a', time: 60, color: pair }
    expect(markersOf([bar], DARK_THEME, 'dark')[0]!.color).toBe('#ab47bc')
    expect(markersOf([bar], LIGHT_THEME, 'light')[0]!.color).toBe('#7b1fa2')
  })

  it('refuses a single literal color, which paints in the neutral role in both modes', () => {
    // @ts-expect-error: one color for both modes is not a mark color
    const literal: TimescaleMark = { id: 'a', time: 60, color: '#ab47bc' }
    expect(markColor(literal.color, DARK_THEME, 'dark')).toBe(DARK_THEME['series.neutral'])
    expect(markColor(literal.color, LIGHT_THEME, 'light')).toBe(LIGHT_THEME['series.neutral'])
  })

  it('refuses a pair with a side it cannot paint, in both modes', () => {
    const broken = { light: 'var(--ink)', dark: '#ab47bc' }
    expect(markColor(broken, DARK_THEME, 'dark')).toBe(DARK_THEME['series.neutral'])
    expect(markColor(broken, LIGHT_THEME, 'light')).toBe(LIGHT_THEME['series.neutral'])
    // @ts-expect-error: a pair names both modes
    const half: MarkColor = { dark: '#ab47bc' }
    expect(markColor(half, DARK_THEME, 'dark')).toBe(DARK_THEME['series.neutral'])
  })
})

/** One canvas call, with the ink and line state it was made under. */
interface Call {
  name: string
  args: unknown[]
  fillStyle: unknown
  strokeStyle: unknown
  lineWidth: number
  globalAlpha: number
  dash: number[]
}

/** A canvas context that records every call it takes. */
function recordingContext(): { context: CanvasRenderingContext2D; calls: Call[] } {
  const calls: Call[] = []
  const state = { fillStyle: '' as unknown, strokeStyle: '' as unknown, lineWidth: 1, globalAlpha: 1, dash: [] as number[] }
  const saved: (typeof state)[] = []
  const record =
    (name: string) =>
    (...args: unknown[]): void => {
      calls.push({ name, args, ...state, dash: [...state.dash] })
      if (name === 'save') saved.push({ ...state, dash: [...state.dash] })
      if (name === 'restore') Object.assign(state, saved.pop() ?? {})
      if (name === 'setLineDash') state.dash = [...(args[0] as number[])]
    }
  const context = new Proxy(state, {
    get: (target, key) => (key in target ? target[key as keyof typeof target] : record(String(key))),
    set: (target, key, value) => {
      ;(target as Record<string, unknown>)[key as string] = value
      return true
    },
  })
  return { context: context as unknown as CanvasRenderingContext2D, calls }
}

const named = (calls: readonly Call[], name: string): Call[] => calls.filter((call) => call.name === name)

/** A pane 400 by 300 CSS pixels at one device pixel each. */
const PANE = { width: 400, height: 300 }

interface Rig {
  marks: TimescaleMark[]
  mode: ThemeMode
  x: Map<number, number>
  art?: MarkArt
}

/** The time-scale marks over a stand-in time scale that puts each listed time at its x: a listed
 *  time is its own slot, and the slot's x is the time's. */
function rig(setup: Partial<Rig> = {}) {
  const state: Rig = { marks: [], mode: 'dark', x: new Map(), ...setup }
  const chart = { timeScale: () => ({ logicalToCoordinate: (slot: number) => state.x.get(slot) ?? null }) }
  const primitive = createTimescaleMarks({
    chart: chart as never,
    marks: () => state.marks,
    slotOf: (time) => (state.x.has(time) ? time : null),
    theme: () => (state.mode === 'dark' ? DARK_THEME : LIGHT_THEME),
    mode: () => state.mode,
    background: () => '#0f0f0f',
    ...(state.art ? { art: state.art } : {}),
  })
  const paint = (): Call[] => {
    const { context, calls } = recordingContext()
    const target = { useBitmapCoordinateSpace: (fn: (scope: unknown) => void) => fn({ context, bitmapSize: { ...PANE }, horizontalPixelRatio: 1, verticalPixelRatio: 1 }) }
    for (const view of primitive.paneViews() as { renderer(): { draw(target: unknown): void } }[]) view.renderer().draw(target)
    return calls
  }
  return { state, primitive, paint }
}

const PURPLE: MarkColor = { light: '#7b1fa2', dark: '#ab47bc' }

describe('a time-scale mark', () => {
  it('draws a glyph inside a 21px ring in its color, its foot 2px above the pane’s foot and its inside the background', () => {
    const { paint } = rig({ marks: [{ id: 'a', time: 60, color: PURPLE, icon: 'mark.bolt' }], x: new Map([[60, 100]]) })
    const calls = paint()
    const [ring] = named(calls, 'ellipse')
    // The ring's box spans 277 to 298 on a 300px pane, and its line runs half a width inside it.
    expect(ring!.args).toEqual([100, 287.5, 9.75, 9.75, 0, 0, Math.PI * 2])
    const fills = named(calls, 'fill')
    expect(fills[0]!.fillStyle).toBe('#0f0f0f')
    expect(named(calls, 'stroke')[0]).toMatchObject({ strokeStyle: '#ab47bc', lineWidth: 1.5 })
    // The glyph is the catalog's own outline on the ring box's grid, filled in the mark's color.
    expect(named(calls, 'translate')[0]!.args).toEqual([89.5, 277])
    expect(fills[1]!.fillStyle).toBe('#ab47bc')
    expect((fills[1]!.args[0] as { d: string }).d).toBe(MARK_ICONS['mark.bolt'].path.d)
  })

  it('draws the side of its pair for the mode in effect', () => {
    const { state, paint } = rig({ marks: [{ id: 'a', time: 60, color: PURPLE, icon: 'mark.flag' }], x: new Map([[60, 100]]) })
    state.mode = 'light'
    expect(named(paint(), 'stroke')[0]!.strokeStyle).toBe('#7b1fa2')
  })

  it('stays the small dot near the pane’s foot without a glyph, or with one the chart does not draw', () => {
    const { paint } = rig({
      marks: [
        { id: 'a', time: 60, color: 'info' },
        { id: 'b', time: 120, color: 'info', icon: 'mark.nothing' as never },
      ],
      x: new Map([
        [60, 100],
        [120, 200],
      ]),
    })
    const calls = paint()
    expect(named(calls, 'ellipse')).toEqual([])
    expect(named(calls, 'arc').map((call) => call.args)).toEqual([
      [100, 294, 3, 0, Math.PI * 2],
      [200, 294, 3, 0, Math.PI * 2],
    ])
    expect(named(calls, 'fill').map((call) => call.fillStyle)).toEqual([DARK_THEME['status.info'], DARK_THEME['status.info']])
  })

  it('draws the host’s drawing of the glyph in place of the chart’s own once it has loaded', () => {
    const image = { kind: 'bitmap' } as unknown as CanvasImageSource
    let loaded = false
    const art = vi.fn<MarkArt>((id) => (id === 'mark.star' ? (loaded ? image : null) : undefined))
    const { paint } = rig({ marks: [{ id: 'a', time: 60, color: PURPLE, icon: 'mark.star' }], x: new Map([[60, 100]]), art })
    // While it loads, the ring stands with nothing inside it.
    let calls = paint()
    expect(named(calls, 'stroke')).toHaveLength(1)
    expect(named(calls, 'fill')).toHaveLength(1)
    expect(named(calls, 'drawImage')).toEqual([])
    loaded = true
    calls = paint()
    expect(art).toHaveBeenLastCalledWith('mark.star', '#ab47bc', 21)
    expect(named(calls, 'drawImage')[0]!.args).toEqual([image, 89.5, 277, 21, 21])
    expect(named(calls, 'fill')).toHaveLength(1)
  })

  it('draws nothing for a mark the time scale cannot place, or one off the pane', () => {
    const { paint } = rig({
      marks: [
        { id: 'a', time: 60, color: 'info', icon: 'mark.bolt' },
        { id: 'b', time: 120, color: 'info', icon: 'mark.bolt' },
      ],
      x: new Map([[120, 450]]),
    })
    expect(named(paint(), 'ellipse')).toEqual([])
  })
})

describe('hovering a time-scale mark', () => {
  const bolt: TimescaleMark = { id: 'a', time: 60, color: PURPLE, icon: 'mark.bolt' }

  it('runs a dashed line in its color from the top of the pane down to its ring, and tints the ring', () => {
    const { primitive, paint } = rig({ marks: [bolt], x: new Map([[60, 100]]) })
    expect(named(paint(), 'setLineDash')).toEqual([])
    primitive.point({ x: 104, y: 290 })
    const calls = paint()
    const [line] = named(calls, 'stroke')
    expect(line).toMatchObject({ strokeStyle: '#ab47bc', lineWidth: 1, dash: [5, 6] })
    expect([named(calls, 'moveTo')[0]!.args, named(calls, 'lineTo')[0]!.args]).toEqual([
      [100.5, 0],
      [100.5, 277],
    ])
    // The inside takes the mark's color at 15% over the background.
    expect(named(calls, 'fill').map((call) => [call.fillStyle, call.globalAlpha])).toEqual([
      ['#0f0f0f', 1],
      ['#ab47bc', 0.15],
      ['#ab47bc', 1],
    ])
  })

  it('draws no line for a pointer off every mark, and lets go when the pointer leaves', () => {
    const { primitive, paint } = rig({ marks: [bolt], x: new Map([[60, 100]]) })
    primitive.point({ x: 140, y: 290 })
    expect(named(paint(), 'setLineDash')).toEqual([])
    primitive.point({ x: 100, y: 280 })
    expect(named(paint(), 'setLineDash')).toHaveLength(1)
    primitive.point(null)
    expect(named(paint(), 'setLineDash')).toEqual([])
  })

  it('holds a mark a finger presses, as a pointer hovers it, until a press lands anywhere else', () => {
    const { primitive, paint } = rig({ marks: [bolt], x: new Map([[60, 100]]) })
    paint()
    expect(primitive.press({ x: 96, y: 284 })).toBe(true)
    expect(named(paint(), 'setLineDash')).toHaveLength(1)
    expect(primitive.press({ x: 200, y: 100 })).toBe(false)
    expect(named(paint(), 'setLineDash')).toEqual([])
  })
})


/** Ten bars a minute apart, opening at 60 to 600, which stand on slots 0 to 9. */
const BARS: FeedBar[] = Array.from({ length: 10 }, (_, index) => ({ t: 60 * (index + 1), o: 1, h: 1, l: 1, c: 1, v: 1 }))

/** Let the feed's answers land. */
const flush = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await Promise.resolve()
}

interface PlaneSetup {
  marks: TimescaleMark[]
  view: { from: number; to: number }
  replaying: boolean
}

/** The marks plane over stand-ins: a time scale that stands slot 0 at x 100 and each slot 10px on,
 *  a series that holds the primitive, the gesture box and the chrome layer. Every window the feed
 *  is asked for is kept. */
async function plane(setup: Partial<PlaneSetup> = {}) {
  const state: PlaneSetup = { marks: [], view: { from: -5, to: 12 }, replaying: false, ...setup }
  const gestures = document.createElement('div')
  const overlay = document.createElement('div')
  document.body.append(gestures, overlay)
  let primitive: { paneViews(): { renderer(): { draw(target: unknown): void } }[] } | null = null
  const viewSubs = new Set<() => void>()
  const timeScale = {
    logicalToCoordinate: (slot: number) => 100 + slot * 10,
    timeToIndex: (time: number) => {
      const index = BARS.findIndex((bar) => bar.t === time)
      return index < 0 ? null : index
    },
    getVisibleLogicalRange: () => state.view,
    subscribeVisibleLogicalRangeChange: (cb: () => void) => void viewSubs.add(cb),
    unsubscribeVisibleLogicalRangeChange: (cb: () => void) => void viewSubs.delete(cb),
  }
  const series = {
    attachPrimitive: (p: never) => {
      primitive = p
      ;(p as { attached(param: unknown): void }).attached({ requestUpdate: () => undefined })
    },
    detachPrimitive: () => undefined,
  }
  const asked: { from: number; to: number }[] = []
  const layer = attachMarks({
    chart: { timeScale: () => timeScale } as never,
    series: () => series as never,
    symbol: () => 'ES',
    timeframe: () => '1m',
    theme: () => DARK_THEME,
    mode: () => 'dark',
    background: () => '#0f0f0f',
    painted: () => BARS,
    interval: () => 60,
    replaying: () => state.replaying,
    gestures,
    overlay,
    fetchBarMarks: null,
    fetchTimescaleMarks: async (_symbol, from, to) => {
      asked.push({ from, to })
      return state.marks
    },
    disposed: () => false,
  })
  layer.refresh({ from: 60, to: 600 })
  await flush()
  const paint = (): Call[] => {
    const { context, calls } = recordingContext()
    for (const view of primitive!.paneViews()) view.renderer().draw({ useBitmapCoordinateSpace: (fn: (scope: unknown) => void) => fn({ context, bitmapSize: { ...PANE }, horizontalPixelRatio: 1, verticalPixelRatio: 1 }) })
    return calls
  }
  const pointer = (type: string, x: number, y: number, pointerType = 'mouse'): void => {
    gestures.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerType, bubbles: true }))
  }
  const moveView = (view: { from: number; to: number }): void => {
    state.view = view
    for (const cb of [...viewSubs]) cb()
  }
  return { state, layer, overlay, paint, pointer, asked, moveView, viewSubs }
}

describe('a hovered mark’s words', () => {
  it('shows the label on the tooltip fill above the hovered mark, and hides it when the pointer leaves', async () => {
    const { layer, overlay, paint, pointer } = await plane({ marks: [{ id: 'a', time: 60, color: PURPLE, icon: 'mark.bolt', label: 'Two words' }] })
    paint()
    expect(overlay.querySelector('.qc-mark-tooltip')).toBeNull()
    pointer('pointermove', 100, 288)
    paint()
    const tip = overlay.querySelector<HTMLElement>('.qc-mark-tooltip')!
    expect(tip.hidden).toBe(false)
    expect(tip.getAttribute('role')).toBe('tooltip')
    expect(tip.textContent).toBe('Two words')
    // Its foot 4px above the ring's top at 277.
    expect(tip.style.top).toBe('273px')
    pointer('pointerleave', 0, 0)
    paint()
    expect(tip.hidden).toBe(true)
    layer.destroy()
    expect(overlay.querySelector('.qc-mark-tooltip')).toBeNull()
  })

  it('shows no tooltip for a mark without words, only its line', async () => {
    const { layer, overlay, paint, pointer } = await plane({ marks: [{ id: 'a', time: 60, color: PURPLE, icon: 'mark.bolt' }] })
    paint()
    pointer('pointermove', 100, 288)
    expect(named(paint(), 'setLineDash')).toHaveLength(1)
    expect(overlay.querySelector<HTMLElement>('.qc-mark-tooltip')?.hidden ?? true).toBe(true)
    layer.destroy()
  })

  it('shows the label for a mark a finger presses, and not for a mouse press', async () => {
    const { layer, overlay, paint, pointer } = await plane({ marks: [{ id: 'a', time: 60, color: PURPLE, label: 'Held' }] })
    paint()
    pointer('pointerdown', 100, 294, 'mouse')
    paint()
    expect(overlay.querySelector('.qc-mark-tooltip')).toBeNull()
    pointer('pointerdown', 100, 294, 'touch')
    paint()
    expect(overlay.querySelector<HTMLElement>('.qc-mark-tooltip')!.hidden).toBe(false)
    pointer('pointerdown', 300, 40, 'touch')
    paint()
    expect(overlay.querySelector<HTMLElement>('.qc-mark-tooltip')!.hidden).toBe(true)
    layer.destroy()
  })
})

describe('where a time-scale mark stands', () => {
  const indexOf = (time: number): number | null => {
    const index = BARS.findIndex((bar) => bar.t === time)
    return index < 0 ? null : index
  }
  /** Bars with a gap: 60, 120, then 300 and 360. */
  const GAPPED = [{ t: 60 }, { t: 120 }, { t: 300 }, { t: 360 }]
  const gappedIndex = (time: number): number | null => {
    const index = GAPPED.findIndex((bar) => bar.t === time)
    return index < 0 ? null : index
  }

  it('stands on the bar whose bucket holds its time', () => {
    expect(markSlot(60, BARS, 60, indexOf, true)).toBe(0)
    expect(markSlot(119, BARS, 60, indexOf, true)).toBe(0)
    expect(markSlot(120, BARS, 60, indexOf, true)).toBe(1)
    expect(markSlot(659, BARS, 60, indexOf, true)).toBe(9)
  })

  it('stands on the next bar when its time falls between bars', () => {
    expect(markSlot(200, GAPPED, 60, gappedIndex, true)).toBe(2)
    expect(markSlot(180, GAPPED, 60, gappedIndex, true)).toBe(2)
    expect(markSlot(179, GAPPED, 60, gappedIndex, true)).toBe(1)
  })

  it('stands past the last bar at the slot its time falls in, counted in bar intervals', () => {
    expect(markSlot(660, BARS, 60, indexOf, true)).toBe(10)
    expect(markSlot(780, BARS, 60, indexOf, true)).toBe(12)
    expect(markSlot(839, BARS, 60, indexOf, true)).toBe(12)
  })

  it('stands nowhere before the first bar, or past the last with the future closed or no interval', () => {
    expect(markSlot(59, BARS, 60, indexOf, true)).toBeNull()
    expect(markSlot(780, BARS, 60, indexOf, false)).toBeNull()
    expect(markSlot(780, BARS, null, indexOf, true)).toBeNull()
    expect(markSlot(60, [], 60, indexOf, true)).toBeNull()
    // Without an interval a bar holds its own open alone, and a time after it stands on the next.
    expect(markSlot(61, BARS, null, indexOf, true)).toBe(1)
  })

  it('draws a mark past the last bar at its slot in the empty space after it', async () => {
    const { layer, paint } = await plane({ marks: [{ id: 'a', time: 780, color: PURPLE, icon: 'mark.flag' }] })
    // Slot 12, three slots past the last bar at slot 9.
    expect(named(paint(), 'ellipse')[0]!.args.slice(0, 2)).toEqual([220, 287.5])
    layer.destroy()
  })

  it('draws no mark past the last bar while replay hides what follows it', async () => {
    const { layer, paint } = await plane({
      marks: [
        { id: 'a', time: 780, color: PURPLE, icon: 'mark.flag' },
        { id: 'b', time: 600, color: PURPLE, icon: 'mark.flag' },
      ],
      replaying: true,
    })
    expect(named(paint(), 'ellipse').map((call) => call.args[0])).toEqual([190])
    layer.destroy()
  })

  it('draws no mark past the view', async () => {
    const { layer, paint } = await plane({ marks: [{ id: 'a', time: 60 * 60, color: PURPLE, icon: 'mark.flag' }] })
    expect(named(paint(), 'ellipse')).toEqual([])
    layer.destroy()
  })
})

describe('the window the time-scale marks are asked for', () => {
  it('runs past the last bar as far as the view reaches into the empty space, and a view span further', async () => {
    const { layer, asked } = await plane()
    // The view ends at slot 12, three past the last bar, and spans 17 slots, so the window ends with
    // the 21st slot after the last bar's.
    expect(asked).toEqual([{ from: 60, to: 600 + 21 * 60 - 1 }])
    layer.destroy()
  })

  it('ends at the last bar for a view that stops short of it, and under replay', async () => {
    const short = await plane({ view: { from: 0, to: 8 } })
    expect(short.asked).toEqual([{ from: 60, to: 600 }])
    short.layer.destroy()
    const replaying = await plane({ replaying: true })
    expect(replaying.asked).toEqual([{ from: 60, to: 600 }])
    replaying.layer.destroy()
  })

  it('asks again once a view that reaches past it rests, and not for a move inside it', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      const { layer, asked, moveView, viewSubs } = await plane()
      moveView({ from: -2, to: 15 })
      vi.advanceTimersByTime(500)
      expect(asked).toHaveLength(1)
      moveView({ from: 20, to: 40 })
      moveView({ from: 22, to: 42 })
      expect(asked).toHaveLength(1)
      vi.advanceTimersByTime(200)
      expect(asked).toHaveLength(2)
      // The view ends at slot 42, 33 past the last bar, and spans 20 slots.
      expect(asked[1]).toEqual({ from: 60, to: 600 + (33 + 1 + 20) * 60 - 1 })
      layer.destroy()
      expect(viewSubs.size).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })
})

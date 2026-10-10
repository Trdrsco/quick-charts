// @vitest-environment happy-dom
// The neutral marks as the chart draws them: the color a mark wears in each mode, and the time-scale
// marks on a recording canvas, each a glyph in a 21px ring or a small dot.
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { DARK_THEME, LIGHT_THEME } from '../../src/theme/palettes'
import { MARK_ICONS } from '../../src/ui/controls/icons'
import { createTimescaleMarks, markColor, markersOf, type MarkArt } from '../../src/widget/marks'
import type { BarMark, MarkColor, TimescaleMark } from '../../src/marks'
import type { ThemeMode } from '../../src/theme/schema'

beforeAll(() => {
  // The canvas path the glyphs fill; happy-dom has none, so the stand-in keeps the path data.
  vi.stubGlobal(
    'Path2D',
    class {
      constructor(readonly d?: string) {}
    },
  )
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

/** The time-scale marks over a stand-in time scale that puts each listed time at its x. */
function rig(setup: Partial<Rig> = {}) {
  const state: Rig = { marks: [], mode: 'dark', x: new Map(), ...setup }
  const chart = { timeScale: () => ({ timeToCoordinate: (time: number) => state.x.get(time) ?? null }) }
  const primitive = createTimescaleMarks({
    chart: chart as never,
    marks: () => state.marks,
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

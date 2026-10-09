// The line tools held to the measured canvas calls, state by state. The pane below is the measured
// one, 1173 by 849, with its two points where the measured ray stood them: (800.46, 718) and
// (949.65, 608), 13 bars and 36.03 apart. A line rests as one stroke; under the pointer its handles
// show thin; selected they show as rings, the handle under the pointer in a halo, and a line without
// words invites them where they would stand; and its points' prices and times are marked on the
// axes in the accent, with a band at a quarter across their span.
import { describe, expect, it } from 'vitest'
import type { Time } from 'lightweight-charts'
import { drawingTools } from '../../../src/drawings/index'
import type { Anchor, IDrawing, Viewport } from '../../../src/internal/drawings/index'

const T1 = 1791388800
const T2 = 1791473400
const P1 = 7637.12
const P2 = 7673.15
const X1 = 800.46
const PX_PER_BAR = 11.476
const X2 = X1 + 13 * PX_PER_BAR
const Y1 = 718
const Y2 = 608
const PX_PER_POINT = (Y1 - Y2) / (P2 - P1)

/** The measured pane: 13 bars between the two times, and the price scale through both points. */
const viewport: Viewport = {
  width: 1173,
  height: 849,
  xOf: (time) => X1 + ((Number(time) - T1) / (T2 - T1)) * (X2 - X1),
  yOf: (price) => Y1 - (price - P1) * PX_PER_POINT,
  timeAt: (x) => (T1 + ((x - X1) / (X2 - X1)) * (T2 - T1)) as Time,
  priceAt: (y) => P1 + (Y1 - y) / PX_PER_POINT,
  barsBetween: (a, b) => ((Number(b) - Number(a)) / (T2 - T1)) * 13,
  logicalOf: (time) => ((Number(time) - T1) / (T2 - T1)) * 13,
  timeOfLogical: (logical) => (T1 + (logical / 13) * (T2 - T1)) as Time,
}

interface Call {
  name: string
  args: unknown[]
  fillStyle?: unknown
  strokeStyle?: unknown
  lineWidth?: unknown
  lineCap?: unknown
  lineJoin?: unknown
  font?: unknown
  textAlign?: unknown
  textBaseline?: unknown
  alpha: number
  dash: number[]
}

/** A context that records every call with the state it was made under, saves and restores
 *  included. */
function recorder(): { ctx: CanvasRenderingContext2D; calls: Call[] } {
  const calls: Call[] = []
  let state = new Map<string | symbol, unknown>()
  let dash: number[] = []
  const stack: { state: Map<string | symbol, unknown>; dash: number[] }[] = []
  const ctx = new Proxy({} as CanvasRenderingContext2D, {
    get: (_t, p) => {
      if (p === 'measureText') return (text: string) => ({ width: text.length * 7 })
      if (p === 'setLineDash') return (d: number[]) => void (dash = [...d])
      if (p === 'save') return () => void stack.push({ state: new Map(state), dash: [...dash] })
      if (p === 'restore')
        return () => {
          const top = stack.pop()
          if (top) ({ state, dash } = top)
        }
      if (state.has(p)) return state.get(p)
      return (...args: unknown[]) =>
        calls.push({
          name: String(p),
          args,
          fillStyle: state.get('fillStyle'),
          strokeStyle: state.get('strokeStyle'),
          lineWidth: state.get('lineWidth'),
          lineCap: state.get('lineCap'),
          lineJoin: state.get('lineJoin'),
          font: state.get('font'),
          textAlign: state.get('textAlign'),
          textBaseline: state.get('textBaseline'),
          alpha: state.has('globalAlpha') ? Number(state.get('globalAlpha')) : 1,
          dash: [...dash],
        })
    },
    set: (_t, p, v) => {
      state.set(p, v)
      return true
    },
  })
  return { ctx, calls }
}

type Live = IDrawing & {
  paneViews(): readonly { renderer(): { draw(target: unknown): void } | null }[]
  priceAxisPaneViews(): readonly { renderer(): { draw(target: unknown): void } | null }[]
  timeAxisPaneViews(): readonly { renderer(): { draw(target: unknown): void } | null }[]
  priceAxisViews(): readonly AxisView[]
  timeAxisViews(): readonly AxisView[]
  getViewport(): Viewport | null
}
interface AxisView {
  coordinate(): number
  text(): string
  backColor(): string
  textColor(): string
  visible(): boolean
}

const at = (time: number, price: number): Anchor => ({ time: time as Time, price })

/** A drawing of a tool in its factory look, standing in the measured pane, its prices written as
 *  the symbol writes them. */
function make(type: string, anchors: Anchor[], props: Record<string, unknown> = {}, style: Record<string, unknown> = {}): Live {
  const d = drawingTools.create(type, type, anchors, style)! as unknown as Live
  d.applyProps(props)
  d.getViewport = () => viewport
  ;(d as unknown as { setPriceFormatter(f: (p: number) => string): void }).setPriceFormatter((p) => p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
  return d
}

/** The calls the drawing's pane view makes for one frame. */
function frame(d: Live): Call[] {
  const { ctx, calls } = recorder()
  d.paneViews()[0]!.renderer()!.draw({ useMediaCoordinateSpace: (fn: (scope: { context: CanvasRenderingContext2D; mediaSize: { width: number; height: number } }) => void) => fn({ context: ctx, mediaSize: { width: viewport.width, height: viewport.height } }) })
  return calls
}

/** The calls an axis band view makes for one frame on an axis box of a size. */
function band(view: { renderer(): { draw(target: unknown): void } | null }, size: { width: number; height: number }): Call[] {
  const { ctx, calls } = recorder()
  view.renderer()!.draw({ useMediaCoordinateSpace: (fn: (scope: { context: CanvasRenderingContext2D; mediaSize: { width: number; height: number } }) => void) => fn({ context: ctx, mediaSize: size }) })
  return calls
}

const named = (calls: Call[], name: string): Call[] => calls.filter((c) => c.name === name)
const rings = (calls: Call[]): unknown[][] => named(calls, 'arc').map((c) => [...c.args.slice(0, 3), c.lineWidth ?? null])

/** The path a stroke drew: every move and line since the path began. */
function strokes(calls: Call[]): { path: unknown[][]; strokeStyle: unknown; lineWidth: unknown; lineCap: unknown; lineJoin: unknown; dash: number[] }[] {
  const out: ReturnType<typeof strokes> = []
  let path: unknown[][] = []
  for (const c of calls) {
    if (c.name === 'beginPath') path = []
    else if (c.name === 'moveTo' || c.name === 'lineTo') path.push([c.name === 'moveTo' ? 'M' : 'L', ...c.args.map((v) => Math.round(Number(v) * 100) / 100)])
    else if (c.name === 'arc') path.push(['A', ...c.args.map((v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v))])
    else if (c.name === 'stroke') out.push({ path, strokeStyle: c.strokeStyle, lineWidth: c.lineWidth, lineCap: c.lineCap, lineJoin: c.lineJoin, dash: c.dash })
  }
  return out
}

const ray = (props: Record<string, unknown> = {}): Live => make('trend_line', [at(T1, P1), at(T2, P2)], props)

describe('a trend line, state by state', () => {
  it('rests as one stroke 2px wide in its color, its caps and joins round', () => {
    const calls = frame(ray())
    expect(strokes(calls)).toEqual([{ path: [['M', 800.46, 718], ['L', 949.65, 608]], strokeStyle: '#2962ff', lineWidth: 2, lineCap: 'round', lineJoin: 'round', dash: [] }])
    expect(named(calls, 'fillText')).toEqual([])
  })

  it('shows its handles thin under the pointer: a ring of radius 6, 1px wide, filled with the ground', () => {
    const d = ray()
    d.setHovered(true)
    const calls = frame(d)
    // As measured: A 856.5 760.5 6 and A 1006.5 650.5 6 on the page, the pane standing at (56, 42).
    expect(rings(calls)).toEqual([
      [800.5, 718.5, 6, 1],
      [950.5, 608.5, 6, 1],
    ])
    expect(named(calls, 'fill').map((c) => c.fillStyle)).toEqual(['#ffffff', '#ffffff'])
    expect(named(calls, 'fillText')).toEqual([])
  })

  it('selected, invites its words above its middle, turned with it, then rings its points', () => {
    const d = ray()
    d.setState('selected')
    const calls = frame(d)
    const angle = Math.atan2(Y2 - Y1, X2 - X1)
    // The words' middle stands 11px above the middle of the line, along its normal.
    const place = { x: (X1 + X2) / 2 + 11 * Math.sin(angle), y: (Y1 + Y2) / 2 - 11 * Math.cos(angle) }
    const translate = named(calls, 'translate')[0]!.args as number[]
    expect(translate[0]).toBeCloseTo(place.x, 6)
    expect(translate[1]).toBeCloseTo(place.y, 6)
    expect(named(calls, 'rotate')[0]!.args[0]).toBeCloseTo(angle, 9)
    // The plus 12px across and 4px before the words, the pair centred on the place: the words in the
    // line's text color at half strength, as the plus is.
    const text = named(calls, 'fillText')[0]!
    const words = 'Add text'.length * 14 * 0.6
    const left = -(16 + words) / 2
    expect([text.args[0], text.args[1], text.args[2], text.fillStyle, text.font, text.textAlign, text.textBaseline]).toEqual(['Add text', left + 16, 0, 'rgba(41, 98, 255, 0.5)', expect.stringMatching(/^14px /), 'left', 'middle'])
    const plus = strokes(calls)[1]!
    const r = (v: number): number => Math.round(v * 100) / 100
    expect(plus).toEqual({ path: [['M', r(left), -0.5], ['L', r(left + 12), -0.5], ['M', r(left + 6), -6.5], ['L', r(left + 6), 5.5]], strokeStyle: 'rgba(41, 98, 255, 0.5)', lineWidth: 1, lineCap: 'butt', lineJoin: 'miter', dash: [] })
    // Then the rings, 2px wide at a radius of 5.5, after the invitation.
    expect(rings(calls)).toEqual([
      [800.5, 718.5, 5.5, 2],
      [950.5, 608.5, 5.5, 2],
    ])
    expect(calls.findIndex((c) => c.name === 'fillText')).toBeLessThan(calls.findIndex((c) => c.name === 'arc'))
  })

  it('stands the handle under the pointer in a halo, 3px wide at a radius of 8 and at a fifth', () => {
    const d = ray({ text: 'Hi' })
    d.setState('selected')
    d.setPointer({ x: 951, y: 609 })
    const halo = named(frame(d), 'arc').find((c) => c.args[2] === 8)!
    expect([halo.args.slice(0, 2), halo.lineWidth, halo.alpha]).toEqual([[950.5, 608.5], 3, 0.2])
  })

  it('while its second point is placed, rings only its first and invites nothing', () => {
    const d = ray()
    d.setState('editing')
    const calls = frame(d)
    expect(rings(calls)).toEqual([[800.5, 718.5, 5.5, 2]])
    expect(named(calls, 'fillText')).toEqual([])
  })

  it('selected, marks its points’ prices and times on the axes in the accent, with a band at a quarter across their span', () => {
    const d = ray()
    const views = (): AxisView[] => [...d.priceAxisViews(), ...d.timeAxisViews()]
    expect(views().map((v) => v.visible())).toEqual([false, false, false, false])
    expect(band(d.priceAxisPaneViews()[0]!, { width: 66, height: 849 })).toEqual([])
    d.setState('selected')
    expect(views().map((v) => [v.visible(), v.backColor(), v.textColor()])).toEqual(Array(4).fill([true, '#2962ff', '#ffffff']))
    expect(d.priceAxisViews().map((v) => [v.coordinate(), v.text()])).toEqual([
      [718, '7,637.12'],
      [608, '7,673.15'],
    ])
    expect(d.timeAxisViews().map((v) => v.coordinate())).toEqual([X1, X2])
    // Without a chart the times read as plain UTC dates and times.
    expect(d.timeAxisViews()[0]!.text()).toBe('2026-10-07 16:00')
    // As measured: the price axis band over rows 651 to 758 of the page, the time axis band from
    // column 856 through 1005.
    const price = named(band(d.priceAxisPaneViews()[0]!, { width: 66, height: 849 }), 'fillRect')
    expect(price.map((c) => [c.args, c.fillStyle])).toEqual([[[1, 609, 66, 108], 'rgba(41, 98, 255, 0.25)']])
    const time = named(band(d.timeAxisPaneViews()[0]!, { width: 1173, height: 28 }), 'fillRect')
    expect(time.map((c) => [c.args, c.fillStyle])).toEqual([[[800, 0, 150, 28], 'rgba(41, 98, 255, 0.25)']])
  })
})

describe('the line family', () => {
  it('runs a ray on past its second point to the pane’s edge, and an extended line past both, one stroke each', () => {
    const r = strokes(frame(make('ray', [at(T1, P1), at(T2, P2)])))
    expect(r).toHaveLength(1)
    expect(r[0]!.path[0]).toEqual(['M', 800.46, 718])
    expect(r[0]!.path[1]![1]).toBe(1173)
    const e = strokes(frame(make('extended', [at(T1, P1), at(T2, P2)])))
    expect(e).toHaveLength(1)
    // As measured, from the bottom edge to the right edge of the pane.
    expect([e[0]!.path[0]![2], e[0]!.path[1]![1]]).toEqual([849, 1173])
  })

  it('heads an arrow with an open V at its tip, its arms 10px back and 10px across, in one path with its shaft', () => {
    const calls = frame(make('arrow', [at(T1, P1), at(T2, P2)]))
    const len = Math.hypot(X2 - X1, Y2 - Y1)
    const [ux, uy] = [(X2 - X1) / len, (Y2 - Y1) / len]
    const r = (v: number): number => Math.round(v * 100) / 100
    // As measured: M 1003.6 664 L 1005.7 650 L 991.7 647.9 M 856.5 760 L 1005.7 650 on the page.
    expect(strokes(calls)).toEqual([
      {
        path: [
          ['M', r(X2 - 10 * ux - 10 * uy), r(Y2 - 10 * uy + 10 * ux)],
          ['L', r(X2), Y2],
          ['L', r(X2 - 10 * ux + 10 * uy), r(Y2 - 10 * uy - 10 * ux)],
          ['M', X1, Y1],
          ['L', r(X2), Y2],
        ],
        strokeStyle: '#2962ff',
        lineWidth: 2,
        lineCap: 'round',
        lineJoin: 'round',
        dash: [],
      },
    ])
    expect([r(X2 - 10 * ux - 10 * uy) + 56, r(Y2 - 10 * uy + 10 * ux) + 42].map((v) => Math.round(v * 10) / 10)).toEqual([1003.5, 664])
  })

  it('stands an info line’s stats in a grey box below and right of its middle, three rows each led by its mark', () => {
    const d = make('info_line', [at(T1, P1), at(T2, P2)])
    d.setTickSize(0.01)
    const calls = frame(d)
    // As measured: the box's corner at (943, 716) on the page, 94px tall, rounded at 4.
    const box = named(calls, 'roundRect')[0]!
    const widest = '13 bars (23h 30m), distance: 185 px'.length * 12 * 0.6
    expect([box.args, box.fillStyle]).toEqual([[887, 674, Math.round(42 + widest + 13), 94, 4], 'rgba(70, 70, 70, 0.9)'])
    expect(named(calls, 'fillText').map((c) => [c.args, c.fillStyle, c.font, c.textAlign, c.textBaseline])).toEqual(
      [
        ['36.03 (0.47%), 3,603', 929, 695],
        ['13 bars (23h 30m), distance: 185 px', 929, 721],
        ['36.4°', 929, 747],
      ].map((args) => [args, '#ffffff', expect.stringMatching(/^12px /), 'start', 'middle']),
    )
    // Each mark in #f9f9f9 strokes 1px wide about 21px in from the box's left.
    const marks = strokes(calls).filter((s) => s.strokeStyle === '#f9f9f9')
    expect(marks.map((m) => [m.path[0], m.lineWidth])).toEqual([
      [['M', 902, 688.5], 1],
      [['M', 901.5, 715], 1],
      [['M', 902, 752.5], 1],
    ])
  })

  it('stands the box above and right of a line that falls, and leaves out a row whose stats are all off', () => {
    const d = make('info_line', [at(T1, P2), at(T2, P1)], { showAngle: false, showBarsRange: false, showDateTimeRange: false, showDistance: false })
    const calls = frame(d)
    const box = named(calls, 'roundRect')[0]!
    expect(box.args[1]).toBe(Math.round((Y1 + Y2) / 2 - 11 - (16 + 26)))
    expect(named(calls, 'fillText').map((c) => c.args[0])).toEqual(['-36.03 (-0.47%)'])
  })

  it('marks a trend angle with a dotted level 50px long and an arc of radius 50 to the line, its angle to one place after them', () => {
    const calls = frame(make('trend_angle', [at(T1, P1), at(T2, P2)]))
    const angle = Math.atan2(Y2 - Y1, X2 - X1)
    const mark = strokes(calls)[1]!
    expect(mark).toEqual({
      path: [['M', 800.46, 718], ['L', 850.46, 718], ['A', 800.46, 718, 50, 0, Math.round(angle * 100) / 100, true]],
      strokeStyle: '#2962ff',
      lineWidth: 1,
      lineCap: 'butt',
      lineJoin: 'miter',
      dash: [1, 2],
    })
    // As measured: "36.4º" at (915, 761) on the page, 12px in the line's color.
    const label = named(calls, 'fillText')[0]!
    expect([label.args, label.fillStyle, label.font, label.textAlign, label.textBaseline]).toEqual([['36.4°', X1 + 58.5, Y1 + 1], '#2962ff', expect.stringMatching(/^12px /), 'start', 'middle'])
  })

  it('invites no words on a trend angle, which reads its angle instead', () => {
    const d = make('trend_angle', [at(T1, P1), at(T2, P2)])
    d.setState('selected')
    expect(named(frame(d), 'fillText').map((c) => c.args[0])).toEqual(['36.4°'])
  })

  it('paints its words where it invites them, turned with it, and lays the editor there', () => {
    const d = ray({ text: 'Hi' })
    const calls = frame(d)
    const angle = Math.atan2(Y2 - Y1, X2 - X1)
    expect(named(calls, 'rotate')[0]!.args[0]).toBeCloseTo(angle, 9)
    const text = named(calls, 'fillText')[0]!
    // Centred on the place: the word's left half its width before it, its middle on it.
    expect([text.args[0], text.args[1], text.args[2], text.fillStyle]).toEqual(['Hi', -('Hi'.length * 14 * 0.6) / 2, 0, '#2962ff'])
    const frameOf = (d as unknown as { textFrame(v: Viewport): { x: number; y: number; angle: number; lineHeight: number; align: string } }).textFrame(viewport)
    expect([frameOf.angle, frameOf.lineHeight, frameOf.align]).toEqual([angle, 14, 'center'])
    // The words' box, turned: a click inside it types into them, one beside the line does not.
    const mid = { x: (X1 + X2) / 2 + 11 * Math.sin(angle), y: (Y1 + Y2) / 2 - 11 * Math.cos(angle) }
    expect(d.wordsAt(mid, viewport)).toBe(true)
    expect(d.wordsAt({ x: X1, y: Y1 }, viewport)).toBe(false)
  })
})

describe('the cursor over a line', () => {
  const cursor = (d: Live, x: number, y: number): string | undefined => (d as unknown as { hitTest(x: number, y: number): { cursorStyle?: string } | null }).hitTest(x, y)?.cursorStyle

  it('is the pointer on the line, the arrow on a round handle, and over a selected line’s words or invitation the text cursor', () => {
    const d = ray()
    expect(cursor(d, (X1 + X2) / 2, (Y1 + Y2) / 2)).toBe('pointer')
    expect(cursor(d, X1, Y1)).toBe('default')
    const angle = Math.atan2(Y2 - Y1, X2 - X1)
    const invitation = { x: (X1 + X2) / 2 + 11 * Math.sin(angle), y: (Y1 + Y2) / 2 - 11 * Math.cos(angle) }
    expect(cursor(d, invitation.x, invitation.y)).toBeUndefined()
    d.setState('selected')
    frame(d)
    expect(cursor(d, invitation.x, invitation.y)).toBe('text')
  })

  it('reads as words over the whole body of a selected arrow', () => {
    const d = make('arrow', [at(T1, P1), at(T2, P2)])
    expect(cursor(d, (X1 + X2) / 2, (Y1 + Y2) / 2)).toBe('pointer')
    d.setState('selected')
    expect(cursor(d, (X1 + X2) / 2, (Y1 + Y2) / 2)).toBe('text')
  })

  it('resizes up and down over a horizontal line’s square handle and across over a vertical line’s', () => {
    const level = make('horizontal_line', [at(T1, 7656.77)])
    expect(cursor(level, 1173 * 0.9, viewport.yOf(7656.77)!)).toBe('ns-resize')
    expect(cursor(level, 300, viewport.yOf(7656.77)!)).toBe('pointer')
    const time = make('vertical_line', [at(T1, 7656.77)])
    expect(cursor(time, X1, 849 * 0.9)).toBe('ew-resize')
  })
})

describe('the level lines', () => {
  /** The measured level: 7,656.77, on the page's row 700. */
  const LEVEL = 7656.77

  it('strokes a horizontal line across the pane on the pixel grid, its square handle nine tenths of the way across', () => {
    const d = make('horizontal_line', [at(T1, LEVEL)], {}, { lineWidth: 1 })
    expect(strokes(frame(d))).toEqual([{ path: [['M', 0, 658.5], ['L', 1173, 658.5]], strokeStyle: '#2962ff', lineWidth: 1, lineCap: 'butt', lineJoin: 'miter', dash: [] }])
    d.setHovered(true)
    // As measured: the thin square from (1106.5, 694.5) to (1118.5, 706.5) on the page.
    expect(named(frame(d), 'roundRect').map((c) => [c.args, c.lineWidth])).toEqual([[[1050.5, 652.5, 12, 12, 3.3], 1]])
    d.setHovered(false)
    d.setState('selected')
    // And selected, the square from (1107, 695) to (1118, 706).
    expect(named(frame(d), 'roundRect').map((c) => [c.args, c.lineWidth])).toEqual([[[1051, 653, 11, 11, 3.3], 2]])
    expect(d.getControlPoints(viewport)).toEqual([{ index: 0, x: 1173 * 0.9, y: viewport.yOf(LEVEL) }])
  })

  it('invites its words where they would stand, level: right of the pane above the line, its plus on the pixel grid', () => {
    const d = make('horizontal_line', [at(T1, LEVEL)], { textHAlign: 'right', textVAlign: 'top' }, { lineWidth: 1 })
    d.setState('selected')
    const calls = frame(d)
    expect(named(calls, 'translate')[0]!.args).toEqual([1173 - 7, 658.5 - 10])
    expect(named(calls, 'rotate')).toEqual([])
    const words = 'Add text'.length * 12 * 0.6
    expect(named(calls, 'fillText')[0]!.args).toEqual(['Add text', -words, 0])
    // As measured: the plus from 1162 to 1173 across and 685 to 696 down, about (1167.5, 690.5).
    const plus = strokes(calls)[1]!.path.map((p) => [p[0], Math.round((Number(p[1]) + 1166) * 100) / 100, Math.round((Number(p[2]) + 648.5) * 100) / 100])
    const cx = Math.round(1166 - words - 14 + 5.5 - 0.5) + 0.5
    expect(plus).toEqual([['M', cx - 5.5, 648.5], ['L', cx + 5.5, 648.5], ['M', cx, 643], ['L', cx, 654]])
  })

  it('carries its own price pill in its color, and selected adds a band but no second pill', () => {
    const d = make('horizontal_line', [at(T1, LEVEL)], {}, { lineColor: '#ffffff' })
    const [pill] = d.priceAxisViews()
    expect([pill!.visible(), pill!.backColor(), pill!.textColor(), pill!.text()]).toEqual([true, '#ffffff', '#000000', '7,656.77'])
    expect(d.timeAxisViews()).toEqual([])
    d.setState('selected')
    expect([pill!.visible(), pill!.backColor()]).toEqual([true, '#ffffff'])
    // As measured: one row of band, the row above the line's.
    expect(named(band(d.priceAxisPaneViews()[0]!, { width: 66, height: 849 }), 'fillRect').map((c) => c.args)).toEqual([[1, 657, 66, 1]])
    expect(band(d.timeAxisPaneViews()[0]!, { width: 1173, height: 28 })).toEqual([])
    d.applyProps({ showPrice: false })
    expect([pill!.visible(), pill!.backColor(), pill!.textColor()]).toEqual([true, '#2962ff', '#ffffff'])
  })

  it('runs a horizontal ray from its point, its round handle on it, and selected marks its time too', () => {
    const d = make('horizontal_ray', [at(T1, LEVEL)], {}, { lineWidth: 1 })
    expect(strokes(frame(d))[0]!.path).toEqual([['M', 800.46, 658.5], ['L', 1173, 658.5]])
    d.setState('selected')
    const calls = frame(d)
    expect(rings(calls)).toEqual([[800.5, 658.5, 5.5, 2]])
    // A selected ray invites no words.
    expect(named(calls, 'fillText')).toEqual([])
    const [time] = d.timeAxisViews()
    expect([time!.visible(), time!.backColor(), time!.coordinate()]).toEqual([true, '#2962ff', X1])
    expect(named(band(d.timeAxisPaneViews()[0]!, { width: 1173, height: 28 }), 'fillRect').map((c) => c.args)).toEqual([[800, 0, 1, 28]])
  })

  it('strokes a vertical line down the pane on the pixel grid, its square handle nine tenths of the way down', () => {
    const d = make('vertical_line', [at(T1, LEVEL)], {}, { lineWidth: 1 })
    expect(strokes(frame(d))[0]!.path).toEqual([['M', 800.5, 0], ['L', 800.5, 849]])
    d.setState('selected')
    // As measured for the 849px pane: the square about y 806 on the page.
    expect(named(frame(d), 'roundRect').map((c) => c.args)).toEqual([[795, 759, 11, 11, 3.3]])
    expect(d.getControlPoints(viewport)).toEqual([{ index: 0, x: X1, y: 849 * 0.9 }])
    const [time] = d.timeAxisViews()
    expect([time!.visible(), time!.backColor()]).toEqual([true, '#2962ff'])
    expect(d.priceAxisViews()).toEqual([])
    expect(named(band(d.timeAxisPaneViews()[0]!, { width: 1173, height: 28 }), 'fillRect').map((c) => c.args)).toEqual([[800, 0, 1, 28]])
  })

  it('invites a vertical line’s words reading across it at the pane’s bottom, centred on it', () => {
    const d = make('vertical_line', [at(T1, LEVEL)], { textOrientation: 'horizontal', textVAlign: 'bottom', textHAlign: 'center' }, { lineWidth: 1 })
    d.setState('selected')
    const calls = frame(d)
    // As measured: the words' middle 11px above the pane's bottom, the pair centred on the line.
    expect(named(calls, 'translate')[0]!.args).toEqual([800.5, 849 - 11])
    const words = 'Add text'.length * 14 * 0.6
    expect(named(calls, 'fillText')[0]!.args).toEqual(['Add text', -(16 + words) / 2 + 16, 0])
  })

  it('crosses a cross line at its point on the pixel grid, its round handle on the crossing and its pills on both axes', () => {
    const d = make('cross_line', [at(T1, LEVEL)])
    expect(strokes(frame(d)).map((s) => s.path)).toEqual([
      [['M', 0, 658], ['L', 1173, 658]],
      [['M', 800, 0], ['L', 800, 849]],
    ])
    d.setState('selected')
    expect(rings(frame(d))).toEqual([[800.5, 658.5, 5.5, 2]])
    expect([...d.priceAxisViews(), ...d.timeAxisViews()].map((v) => [v.visible(), v.backColor()])).toEqual([
      [true, '#2962ff'],
      [true, '#2962ff'],
    ])
    expect(named(band(d.priceAxisPaneViews()[0]!, { width: 66, height: 849 }), 'fillRect').map((c) => c.args)).toEqual([[1, 657, 66, 1]])
  })
})

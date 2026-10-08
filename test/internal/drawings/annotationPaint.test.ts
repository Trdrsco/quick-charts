// What the text tools, the annotation tools and the table paint from their settings: a text's
// background, border and wrapped words on their switches, a note's line to its point and its label's
// own border, a callout's border at its width, a price label's pill, a price note's tag, a table's
// words where its alignment stands them, and a signpost's plate held its height over its bar.
import { describe, expect, it } from 'vitest'
import { drawingTools } from '../../../src/drawings/index'
import type { Anchor, IDrawing, Viewport } from '../../../src/internal/drawings/index'

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

interface Call {
  name: string
  args: unknown[]
  fillStyle?: unknown
  strokeStyle?: unknown
  lineWidth?: unknown
  textAlign?: unknown
  font?: unknown
}

function painted(d: IDrawing): Call[] {
  const calls: Call[] = []
  const state = new Map<string | symbol, unknown>()
  const ctx = new Proxy({} as CanvasRenderingContext2D, {
    get: (_t, p) => {
      if (p === 'measureText') return (text: string) => ({ width: text.length * 7 })
      if (state.has(p)) return state.get(p)
      return (...args: unknown[]) => {
        calls.push({ name: String(p), args, fillStyle: state.get('fillStyle'), strokeStyle: state.get('strokeStyle'), lineWidth: state.get('lineWidth'), textAlign: state.get('textAlign'), font: state.get('font') })
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
const words = (d: IDrawing): unknown[] => named(painted(d), 'fillText').map((c) => c.args[0])

const make = (type: string, points: Anchor[], props: Record<string, unknown> = {}): IDrawing => {
  const d = drawingTools.create(type, type, points)!
  d.applyProps(props)
  return d
}
const at = (time: number, price: number): Anchor => ({ time: time as never, price })

describe('a text', () => {
  it('paints its background and its border only on their switches', () => {
    const d = make('text', [at(100, 300)], { text: 'Hi' })
    expect([named(painted(d), 'fill'), named(painted(d), 'stroke')]).toEqual([[], []])
    d.applyProps({ fillBackground: true, drawBorder: true })
    expect(named(painted(d), 'fill').map((c) => c.fillStyle)).toEqual(['rgba(41, 98, 255, 0.25)'])
    expect(named(painted(d), 'stroke').map((c) => c.strokeStyle)).toEqual(['#707070'])
  })

  it('wraps its words at their width while wrap is on', () => {
    const d = make('text', [at(100, 300)], { text: 'one two three four' })
    expect(words(d)).toEqual(['one two three four'])
    d.applyProps({ wordWrap: true, wordWrapWidth: 60 })
    expect(words(d)).toEqual(['one two', 'three', 'four'])
  })
})

describe('a note', () => {
  it('runs a line in its stroke color from its point to its label, the label’s border in a color of its own', () => {
    const d = make('note', [at(100, 300), at(200, 200)], { text: 'Hi' })
    const calls = painted(d)
    expect(named(calls, 'stroke').map((c) => c.strokeStyle)).toEqual(['#dbdbdb'])
    expect(named(calls, 'fill').map((c) => c.fillStyle)).toEqual(['rgba(46, 46, 46, 1)'])
    d.applyProps({ drawBorder: true, fillBackground: false })
    const bordered = painted(d)
    expect(named(bordered, 'stroke').map((c) => c.strokeStyle)).toEqual(['#dbdbdb', '#4a4a4a'])
    expect(named(bordered, 'fill')).toEqual([])
  })
})

describe('a note saved on one point', () => {
  it('keeps its point and stands its label up and to the right of it once it is on a pane', () => {
    const saved = { v: 2, id: 'old', type: 'note', anchors: [at(100, 300)], style: { fillColor: '#1b1f27', fillOpacity: 0.95 }, options: {}, props: { text: 'Hi', align: 'left' } }
    const note = drawingTools.restore(saved as never)!
    expect(note.anchors).toEqual([at(100, 300), at(100, 300)])
    expect(note.props).toEqual({ text: 'Hi', fillBackground: true, drawBorder: true, borderColor: '#4a4a4a' })
    ;(note as unknown as { getViewport(): Viewport }).getViewport = () => viewport
    ;(note as unknown as { attached(p: unknown): void }).attached({ chart: {}, series: {}, requestUpdate: () => undefined })
    // The point stays where it was saved; the label stands 20px right of it and 40px up.
    expect(note.anchors).toEqual([at(100, 300), at(120, 340)])
  })
})

describe('a callout and a price label', () => {
  it('draws a callout’s border and its tether at the drawing’s width', () => {
    const d = make('callout', [at(100, 300), at(200, 200)], { text: 'Hi' })
    expect(named(painted(d), 'stroke').map((c) => [c.strokeStyle, c.lineWidth])).toEqual([
      ['#0097a7', 2],
      ['#0097a7', 2],
    ])
  })

  it('fills a price label’s pill in its fill, borders it in its stroke, and writes the price bold', () => {
    const d = make('price_label', [at(100, 250)])
    const calls = painted(d)
    expect(named(calls, 'fill').map((c) => c.fillStyle)).toEqual(['rgba(41, 98, 255, 1)', 'rgba(41, 98, 255, 1)'])
    expect(named(calls, 'stroke').map((c) => c.strokeStyle)).toEqual(['#2962ff', '#2962ff'])
    const price = named(calls, 'fillText')[0]!
    expect([price.args[0], price.fillStyle, String(price.font).includes('600')]).toEqual(['250.00', '#ffffff', true])
  })
})

describe('a price note', () => {
  it('runs its line to a tag reading its first point’s price in the tag’s own style, its words above the line', () => {
    const d = make('price_note', [at(100, 200), at(300, 200)], { text: 'Buy', labelFontSize: 16 })
    const calls = painted(d)
    expect(named(calls, 'stroke').map((c) => c.strokeStyle)).toEqual(['#2962ff', '#2962ff'])
    const tag = named(calls, 'roundRect')[0]!
    expect(tag.args[0]).toBe(300)
    const [price, note] = named(calls, 'fillText')
    expect([price!.args[0], price!.fillStyle, String(price!.font).includes('16px')]).toEqual(['200.00', '#ffffff', true])
    expect([note!.args[0], note!.fillStyle]).toEqual(['Buy', '#2962ff'])
  })
})

describe('a table', () => {
  it('stands each cell’s words at the left, the middle or the right of the cell', () => {
    const d = make('table', [at(100, 300)], { cells: [['a', 'b']] })
    const first = (): Call => named(painted(d), 'fillText')[0]!
    expect([first().args[1], first().textAlign]).toEqual([108, 'left'])
    d.applyProps({ textHAlign: 'center' })
    expect([first().args[1], first().textAlign]).toEqual([160, 'center'])
    d.applyProps({ textHAlign: 'right' })
    expect([first().args[1], first().textAlign]).toEqual([212, 'right'])
  })
})

describe('a signpost', () => {
  /** Bars every ten from time 100 to 200, each from 100 up to 150. */
  const bars = Array.from({ length: 11 }, (_, i) => ({ time: (100 + i * 10) as never, open: 110, high: 150, low: 100, close: 140 }))
  const post = (): IDrawing => {
    const d = make('signpost', [at(150, 250)], { text: 'Hi' })
    ;(d as unknown as { setBarSource(s: () => typeof bars): void }).setBarSource(() => bars)
    ;(d as unknown as { getViewport(): Viewport }).getViewport = () => viewport
    return d
  }

  it('holds its plate a share of the pane’s height over its bar, above its high or below its low', () => {
    const d = post()
    d.updateAnchor(0, at(150, 250))
    // The foot on the bar's high at 250 down the pane, the plate 100 above it.
    expect([d.props.position, d.anchors[0]!.price]).toEqual([25, 150])
    expect(d.anchorToPixel(d.anchors[0]!, viewport)).toEqual({ x: 150, y: 150 })
    d.updateAnchor(0, at(150, 60))
    expect([d.props.position, d.anchors[0]!.price]).toEqual([-10, 100])
    expect(d.anchorToPixel(d.anchors[0]!, viewport)).toEqual({ x: 150, y: 340 })
  })

  it('keeps its height when it moves to another bar keeping its foot’s price', () => {
    const d = post()
    d.updateAnchor(0, at(150, 250))
    d.updateAnchor(0, at(170, 150))
    expect([d.props.position, Number(d.anchors[0]!.time)]).toEqual([25, 170])
  })

  it('writes its words in the ink that reads on its plate', () => {
    const d = post()
    d.updateAnchor(0, at(150, 250))
    const plate = named(painted(d), 'fill').at(-1)!
    expect(plate.fillStyle).toBe('#2962ff')
    expect(named(painted(d), 'fillText').map((c) => [c.args[0], c.fillStyle])).toEqual([['Hi', '#ffffff']])
    d.updateStyle({ lineColor: '#ffeb3b' })
    expect(named(painted(d), 'fillText')[0]!.fillStyle).toBe('#000000')
  })
})

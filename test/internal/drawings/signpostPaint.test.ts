// @vitest-environment happy-dom
// What a signpost paints, held to measured pixels of a signpost on a bar whose low is at row 364,
// its plate below it with its bottom-centre on (558, 700): a one pixel post from four pixels below
// the bar down to the plate, the plate an outline in the chart's edge ink with corners rounded at 6
// and no fill, its widest line and 18px wide and 15px a line and 11px tall, its 12px words centred
// on lines 15px tall in the chart's text ink, its placeholder at half strength, and a square handle
// on its point when it is selected.
import { beforeAll, describe, expect, it } from 'vitest'
import { drawingTools } from '../../../src/drawings/index'
import type { IDrawing, TextDraft, Viewport } from '../../../src/internal/drawings/index'
import { drawingInksOf } from '../../../src/internal/drawings/core/inks'
import { BUILT_IN_THEMES } from '../../../src/theme/palettes'
import { advance, measureInTrebuchet, named, painted, type PaintCall } from './measuredFont'

beforeAll(measureInTrebuchet)

/** A pane where a time is its own x and a price stands that far up from a thousand. */
const viewport: Viewport = {
  width: 1200,
  height: 900,
  xOf: (time) => Number(time),
  yOf: (price) => 1000 - price,
  timeAt: (x) => x as never,
  priceAt: (y) => 1000 - y,
  barsBetween: (a, b) => Number(b) - Number(a),
  logicalOf: (time) => Number(time),
  timeOfLogical: (logical) => logical as never,
}

/** The bar the signpost stands on: its high at row 344, its low at row 364. */
const bars = [{ time: 558 as never, open: 650, high: 656, low: 636, close: 640 }]

function signpost(words: string, how: { selected?: boolean; draft?: Partial<TextDraft> } = {}): IDrawing {
  const d = drawingTools.create('signpost', 's', [{ time: 558 as never, price: 300 }])!
  const host = d as unknown as { setBarSource(s: () => typeof bars): void; getViewport(): Viewport; setInks(s: () => unknown): void }
  host.setBarSource(() => bars)
  host.getViewport = () => viewport
  host.setInks(() => drawingInksOf(BUILT_IN_THEMES.dark))
  // Stood below the bar, its point at row 700.
  d.updateAnchor(0, { time: 558 as never, price: 300 })
  d.applyProps({ text: how.draft ? '' : words })
  if (how.selected || how.draft) d.setState('selected')
  if (how.draft) d.setTextDraft({ value: words, selectionStart: words.length, selectionEnd: words.length, composition: null, caret: false, ...how.draft })
  return d
}

/** The plate's pixels: its outline stands half a pixel in from them. */
function plate(calls: PaintCall[]): { x: number; y: number; width: number; height: number; radius: unknown; ink: unknown; filled: boolean } {
  const rect = named(calls, 'roundRect')[0]!
  const [x, y, w, h, radius] = rect.args as [number, number, number, number, unknown]
  const outline = named(calls, 'stroke').at(-1)!
  return { x: x - 0.5, y: y - 0.5, width: w + 1, height: h + 1, radius, ink: outline.strokeStyle, filled: named(calls, 'fill').length > 0 }
}

describe('a signpost, against measured pixels', () => {
  it('two lines at rest: a plate [518, 660, 80, 41], outlined and empty, its words centred on 15px lines', () => {
    const calls = painted(signpost('Hello world\nSecond line'), viewport)
    expect(plate(calls)).toEqual({ x: 518, y: 660, width: 80, height: 41, radius: 6, ink: '#2e2e2e', filled: false })
    const words = named(calls, 'fillText').map((c) => [c.args[0], (c.args[1] as number) + advance(String(c.args[0]), 12) / 2, c.args[2], c.fillStyle, c.baseline])
    expect(words).toEqual([
      ['Hello world', 558, 674, '#dbdbdb', 'middle'],
      ['Second line', 558, 689, '#dbdbdb', 'middle'],
    ])
  })

  it('runs its post from four pixels below the bar’s low to the plate, one pixel wide in grey', () => {
    const calls = painted(signpost('Hello world'), viewport)
    expect([named(calls, 'moveTo')[0]!.args, named(calls, 'lineTo')[0]!.args]).toEqual([
      [558.5, 368],
      [558.5, 675],
    ])
    expect(named(calls, 'stroke')[0]).toMatchObject({ strokeStyle: '#808080', lineWidth: 1 })
  })

  it('editing: the plate grows up a line at a time, [518, 675, 80, 26] then [518, 660, 80, 41]', () => {
    expect(plate(painted(signpost('Hello world', { draft: {} }), viewport))).toMatchObject({ x: 518, y: 675, width: 80, height: 26 })
    expect(plate(painted(signpost('Hello world\nSecond line', { draft: {} }), viewport))).toMatchObject({ x: 518, y: 660, width: 80, height: 41 })
  })

  it('placed: the plate fits the placeholder, 64 across, the placeholder at half strength', () => {
    const calls = painted(signpost('', { draft: {} }), viewport)
    expect(plate(calls)).toMatchObject({ x: 526, y: 675, width: 64, height: 26 })
    expect(named(calls, 'fillText').map((c) => [c.args[0], c.alpha, c.fillStyle])).toEqual([['Add text', 0.5, '#dbdbdb']])
    // #dbdbdb at half over the dark chart's #0f0f0f reads #757575, as measured.
    expect(Math.round((0xdb + 0x0f) / 2).toString(16)).toBe('75')
  })

  it('has a square handle on its point, which moves the plate up and down over its bar alone', () => {
    const d = signpost('Hello world', { selected: true })
    expect(d.getControlPoints(viewport).map((p) => [p.x, p.y])).toEqual([[558, 700]])
    expect((d as unknown as { handleShape(): string }).handleShape()).toBe('square')
    const time = d.anchors[0]!.time
    d.dragAnchorTo(0, { time: 600 as never, price: 260 })
    expect(d.anchors[0]!.time).toBe(time)
    expect(d.getControlPoints(viewport).map((p) => [p.x, p.y])).toEqual([[558, 740]])
  })

  it('takes a press on its plate as one on its words, and not one on its post', () => {
    const d = signpost('Hello world', { selected: true })
    expect([d.wordsAt({ x: 558, y: 690 }, viewport), d.wordsAt({ x: 558, y: 500 }, viewport), d.testHit({ x: 558, y: 500 }, viewport)]).toEqual([true, false, true])
  })
})

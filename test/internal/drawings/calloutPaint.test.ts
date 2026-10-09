// @vitest-environment happy-dom
// What a callout paints, held to measured pixels of a callout whose tail's tip is on (558, 700) and
// whose box's right edge is on (731.17, 620), its words black at 12px on a white box with a 1px black
// border, wrapping at 165.692: a box 20px wider than the wrap width and 20px taller than its lines,
// centred on its point up and down, corners rounded at 6; a tail whose root runs 8px each way from
// the middle of the box's bottom edge to a tip below the box, or 8px along each side from the
// bottom-left corner to a tip beyond the box's left edge too; the border stroked under the fill; the
// words 10px in from the box's left, their tallest letters 10px under its top; the placeholder at
// half strength; and a handle on each point when it is selected.
import { beforeAll, describe, expect, it } from 'vitest'
import { drawingTools } from '../../../src/drawings/index'
import type { IDrawing, TextDraft } from '../../../src/internal/drawings/index'
import { advance, identityViewport, measureInTrebuchet, named, painted, type PaintCall } from './measuredFont'

beforeAll(measureInTrebuchet)

const WRAP = 165.692

/** A callout in the measured look, its tip and its box's point where given. */
function callout(words: string, how: { tip?: [number, number]; at?: [number, number]; selected?: boolean; draft?: Partial<TextDraft> } = {}): IDrawing {
  const [tx, ty] = how.tip ?? [558, 700]
  const [bx, by] = how.at ?? [731.17, 620]
  const d = drawingTools.create('callout', 'c', [
    { time: tx as never, price: ty },
    { time: bx as never, price: by },
  ])!
  d.updateStyle({ textColor: '#000000', fontSize: 12, fillColor: '#ffffff', fillOpacity: 1, lineColor: '#000000', lineWidth: 1 })
  d.applyProps({ text: how.draft ? '' : words, wordWrap: true, wordWrapWidth: WRAP })
  if (how.selected || how.draft) d.setState('selected')
  if (how.draft) d.setTextDraft({ value: words, selectionStart: words.length, selectionEnd: words.length, composition: null, caret: false, ...how.draft })
  return d
}

const r2 = (n: unknown): number => Math.round(Number(n) * 100) / 100

/** The outline the callout traced: its box from its corners, the corners' radius, and its tail's
 *  root and tip, in the order the walk round the box meets them. */
function outline(calls: PaintCall[]): { box: number[]; radius: unknown; tail: number[][] } {
  const corners = named(calls, 'arcTo').map((c) => [Number(c.args[0]), Number(c.args[1])] as const)
  const xs = corners.map(([x]) => x)
  const ys = corners.map(([, y]) => y)
  const box = [Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)].map(r2)
  return { box, radius: named(calls, 'arcTo')[0]!.args[4], tail: named(calls, 'lineTo').map((c) => c.args.map(r2)) }
}

describe('a callout, against measured pixels', () => {
  it('placed: a box [545.48, 604, 185.69, 32] left of its point and centred on it, its tail from the middle of its bottom edge', () => {
    const calls = painted(callout('', { draft: {} }))
    expect(outline(calls)).toEqual({
      box: [545.48, 604, 185.69, 32],
      radius: 6,
      tail: [
        [646.32, 636],
        [558, 700],
        [630.32, 636],
      ],
    })
    // As measured: the tail's root from 630.35 to 646.24 on the box's bottom edge, and the
    // placeholder's capitals from row 614, 10px under the box's top, standing on row 623.
    expect(named(calls, 'fillText').map((c) => [c.args[0], r2(c.args[1]), c.args[2], c.alpha, c.fillStyle])).toEqual([['Add text', 555.48, 620, 0.5, '#000000']])
  })

  it('strokes its border under its fill, so the fill covers the border’s inner half', () => {
    const calls = painted(callout('Hello world'))
    const stroke = named(calls, 'stroke')[0]!
    const fill = named(calls, 'fill')[0]!
    expect([stroke.strokeStyle, stroke.lineWidth, fill.fillStyle]).toEqual(['#000000', 1, 'rgba(255, 255, 255, 1)'])
    expect(calls.indexOf(stroke)).toBeLessThan(calls.indexOf(fill))
  })

  it('two lines at rest: a box [545.48, 598, 185.69, 44], its words 10px in on 12px lines, their tallest letters on rows 608 and 620', () => {
    const calls = painted(callout('Hello world\nSecond line'))
    expect(outline(calls).box).toEqual([545.48, 598, 185.69, 44])
    const lines = named(calls, 'fillText')
    expect(lines.map((c) => [c.args[0], r2(c.args[1]), c.args[2], c.baseline, c.fillStyle])).toEqual([
      ['Hello world', 555.48, 614, 'middle', '#000000'],
      ['Second line', 555.48, 626, 'middle', '#000000'],
    ])
    // Painted at the middle of the em box, a line's baseline lands 3.39px below it at 12px, on row
    // 617 and 629, and its tallest letters, 8.85px tall, start on rows 608 and 620, as measured.
    const baseline = (middle: number): number => Math.round(middle + (12 * (1510 - 420)) / 1930 / 2)
    expect(lines.map((c) => baseline(Number(c.args[2])))).toEqual([617, 629])
    expect(lines.map((c) => Math.floor(baseline(Number(c.args[2])) - (12 * 1510) / 2048))).toEqual([608, 620])
  })

  it('wraps its words at the wrap width and keeps the box that wide', () => {
    const calls = painted(callout('one two three four five six seven eight nine ten eleven'))
    const lines = named(calls, 'fillText').map((c) => String(c.args[0]))
    expect(lines.length).toBeGreaterThan(1)
    for (const line of lines) expect(advance(line.trimEnd(), 12)).toBeLessThanOrEqual(WRAP)
    expect(outline(calls).box[2]).toBe(185.69)
    expect(outline(calls).box[3]).toBe(lines.length * 12 + 20)
  })

  it('emptied while typing, keeps one line and no placeholder, and runs its tail from the corner a tip beyond its left edge lies past', () => {
    // As measured on an emptied callout whose tip is on (35, 180) and box's point on (254, 60).
    const d = callout('Hi', { tip: [35, 180], at: [254, 60] })
    d.setState('selected')
    d.setTextDraft({ value: '', selectionStart: 0, selectionEnd: 0, composition: null, caret: true })
    const emptied = painted(d)
    expect(outline(emptied)).toEqual({
      box: [68.31, 44, 185.69, 32],
      radius: 6,
      tail: [
        [76.31, 76],
        [35, 180],
        [68.31, 68],
      ],
    })
    // Three corners round; the tail takes the fourth. Its edges run as measured: 0.2976 and 0.3975
    // across for each pixel down.
    expect(named(emptied, 'arcTo')).toHaveLength(3)
    const [from, tip, to] = outline(emptied).tail as [number[], number[], number[]]
    expect(r2((to[0]! - tip[0]!) / (tip[1]! - to[1]!))).toBe(0.3)
    expect(r2((from[0]! - tip[0]!) / (tip[1]! - from[1]!))).toBe(0.4)
    expect(named(emptied, 'fillText')).toEqual([])
  })

  it('has a handle on each point; a drag on its box moves its box alone, and a press on its box is one on its words', () => {
    const d = callout('Hello world', { selected: true })
    expect(d.getControlPoints(identityViewport).map((p) => [p.x, p.y])).toEqual([
      [558, 700],
      [731.17, 620],
    ])
    expect(d.grabbedAnchors({ x: 640, y: 620 }, identityViewport)).toEqual([1])
    expect(d.grabbedAnchors({ x: 600, y: 660 }, identityViewport)).toBeNull()
    expect([d.wordsAt({ x: 640, y: 620 }, identityViewport), d.wordsAt({ x: 600, y: 660 }, identityViewport)]).toEqual([true, false])
    expect([d.testHit({ x: 600, y: 660 }, identityViewport), d.testHit({ x: 700, y: 680 }, identityViewport)]).toEqual([true, false])
  })

  it('without wrap, takes its widest line and 20px across', () => {
    const d = callout('Hello world')
    d.applyProps({ wordWrap: false })
    expect(outline(painted(d)).box).toEqual([r2(731.17 - advance('Hello world', 12) - 20), 604, r2(advance('Hello world', 12) + 20), 32])
  })

  it('keeps a format-2 save’s look, its box’s top-left on its second point and a line to its first', () => {
    const save = { ...callout('Hi').toJSON(), v: 2 as const, props: { text: 'Hi' } }
    const restored = drawingTools.restore(save)!
    expect(restored.props).toMatchObject({ savedLook: {}, borderWidth: 1 })
    const calls = painted(restored)
    expect(named(calls, 'roundRect')[0]!.args.slice(0, 2)).toEqual([731.17, 620])
    expect(named(calls, 'arcTo')).toEqual([])
    restored.applyProps({ wordWrap: false })
    expect(restored.props.savedLook).toBeNull()
  })
})

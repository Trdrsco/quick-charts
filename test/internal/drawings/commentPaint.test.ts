// @vitest-environment happy-dom
// What a comment paints, held to measured pixels of a comment on the point (558, 700): a bubble whose
// pixels run from the one left of the point to the one below it, its widest line and 26px wide and
// 16px a line and 26px tall, three corners rounded at 21 and the one on the point nearly square,
// its white words 13px in, its placeholder at half strength, a two pixel caret, and one handle on
// the point when it is selected.
import { beforeAll, describe, expect, it } from 'vitest'
import { drawingTools } from '../../../src/drawings/index'
import type { IDrawing, TextDraft } from '../../../src/internal/drawings/index'
import { identityViewport, measureInTrebuchet, named, painted, type PaintCall } from './measuredFont'

beforeAll(measureInTrebuchet)

function comment(words: string, how: { selected?: boolean; draft?: Partial<TextDraft>; committed?: string } = {}): IDrawing {
  const d = drawingTools.create('comment', 'c', [{ time: 558 as never, price: 700 }])!
  d.applyProps({ text: how.draft ? (how.committed ?? '') : words })
  if (how.selected || how.draft) d.setState('selected')
  if (how.draft) d.setTextDraft({ value: words, selectionStart: words.length, selectionEnd: words.length, composition: null, caret: false, ...how.draft })
  return d
}

/** The bubble's pixels: its path stands half a pixel in from them, its border riding the edge. */
function bubble(calls: PaintCall[]): { x: number; y: number; width: number; height: number; radii: unknown; fill: unknown; border: unknown } {
  const rect = named(calls, 'roundRect')[0]!
  const [x, y, w, h, radii] = rect.args as [number, number, number, number, unknown]
  return { x: x - 0.5, y: y - 0.5, width: w + 1, height: h + 1, radii, fill: named(calls, 'fill')[0]?.fillStyle, border: named(calls, 'stroke')[0]?.strokeStyle }
}

describe('a comment, against measured pixels', () => {
  it('placed: the bubble fits the placeholder, [557, 659, 88, 42], the placeholder white at half strength', () => {
    const calls = painted(comment('', { draft: {} }))
    expect(bubble(calls)).toEqual({ x: 557, y: 659, width: 88, height: 42, radii: [21, 21, 21, 2], fill: 'rgba(41, 98, 255, 1)', border: '#2962ff' })
    expect(named(calls, 'fillText').map((c) => [c.args[0], c.args[1], c.args[2], c.alpha, c.fillStyle, c.baseline])).toEqual([['Add text', 570, 681, 0.5, '#ffffff', 'middle']])
    // White at half over #2962FF is the measured #94b1ff.
    expect([255 / 2 + 41 / 2, 255 / 2 + 98 / 2, 255].map(Math.floor)).toEqual([0x94, 0xb0, 0xff])
  })

  it('typing: the bubble grows right with the words, [557, 659, 108, 42]', () => {
    const calls = painted(comment('Hello world', { draft: {} }))
    expect(bubble(calls)).toMatchObject({ x: 557, y: 659, width: 108, height: 42 })
    expect(named(calls, 'fillText').map((c) => [c.args[0], c.args[1], c.args[2], c.alpha])).toEqual([['Hello world', 570, 681, 1]])
  })

  it('grows up a line at a time, its corner on the point never moving: [557, 643, 108, 58], then [557, 627, 108, 74]', () => {
    expect(bubble(painted(comment('Hello world\n', { draft: {} })))).toMatchObject({ x: 557, y: 643, width: 108, height: 58 })
    const calls = painted(comment('Hello world\nL2\n', { draft: {} }))
    expect(bubble(calls)).toMatchObject({ x: 557, y: 627, width: 108, height: 74 })
    expect(named(calls, 'fillText').map((c) => [c.args[0], c.args[2]])).toEqual([
      ['Hello world', 649],
      ['L2', 665],
    ])
  })

  it('two lines at rest: [557, 643, 108, 58], the words on 16px lines 13px in', () => {
    const calls = painted(comment('Hello world\nSecond line'))
    expect(bubble(calls)).toMatchObject({ x: 557, y: 643, width: 108, height: 58 })
    expect(named(calls, 'fillText').map((c) => [c.args[0], c.args[1], c.args[2]])).toEqual([
      ['Hello world', 570, 665],
      ['Second line', 570, 681],
    ])
  })

  it('emptied during an edit: no placeholder, the bubble closing on its padding', () => {
    const calls = painted(comment('', { draft: {}, committed: 'Hi' }))
    expect(bubble(calls)).toMatchObject({ width: 26, height: 42 })
    expect(named(calls, 'fillText')).toEqual([])
  })

  it('paints its caret white and two pixels wide where the words start', () => {
    const calls = painted(comment('', { draft: { caret: true } }))
    expect(named(calls, 'fillRect').map((c) => [c.args, c.fillStyle])).toEqual([[[569, 672, 2, 16], '#ffffff']])
  })

  it('has one handle, on its point, and no frame', () => {
    const d = comment('Hello world', { selected: true })
    expect(d.getControlPoints(identityViewport)).toEqual([{ index: 0, x: 558, y: 700 }])
    expect(named(painted(d), 'strokeRect')).toEqual([])
  })

  it('keeps a format-2 save’s look, a box above and to the right of its point with a tail down to it', () => {
    const save = { ...comment('Hi').toJSON(), v: 2 as const, props: { text: 'Hi' } }
    const restored = drawingTools.restore(save)!
    const calls = painted(restored)
    expect(named(calls, 'roundRect')[0]!.args.slice(0, 2)).toEqual([568, 700 - 14 - (Math.round(16 * 1.35) + 12)])
    expect(named(calls, 'lineTo').map((c) => c.args)).toContainEqual([558, 700])
  })
})

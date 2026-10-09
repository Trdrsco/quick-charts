// @vitest-environment happy-dom
// What a note paints, held to measured pixels of a note on the point (558, 700) with its label at
// (615, 700): a dot on the point, a one pixel line on the point's row to the label, and a box whose
// left edge is on the label, centred on it, its widest line and 16px wide and 14px a line and 12px
// tall, corners rounded at 4, a soft shadow under it, its words 8px in and 6px down, its
// placeholder at half strength, and a handle on each point when it is selected.
import { beforeAll, describe, expect, it } from 'vitest'
import { drawingTools } from '../../../src/drawings/index'
import type { IDrawing, TextDraft } from '../../../src/internal/drawings/index'
import { identityViewport, measureInTrebuchet, named, painted, type PaintCall } from './measuredFont'

beforeAll(measureInTrebuchet)

function note(words: string, how: { selected?: boolean; draft?: Partial<TextDraft> } = {}): IDrawing {
  const d = drawingTools.create('note', 'n', [
    { time: 558 as never, price: 700 },
    { time: 615 as never, price: 700 },
  ])!
  d.applyProps({ text: how.draft ? '' : words })
  if (how.selected || how.draft) d.setState('selected')
  if (how.draft) d.setTextDraft({ value: words, selectionStart: words.length, selectionEnd: words.length, composition: null, caret: false, ...how.draft })
  return d
}

const box = (calls: PaintCall[]) => {
  const rect = named(calls, 'roundRect')[0]!
  const fill = named(calls, 'fill').find((c) => c.fillStyle === 'rgba(46, 46, 46, 1)')!
  return { rect: rect.args, shadow: fill.shadow }
}

describe('a note, against measured pixels', () => {
  it('placed: the box fits the placeholder, [615, 687, 70, 26], under a soft shadow, the placeholder at half strength', () => {
    const calls = painted(note('', { draft: {} }))
    expect(box(calls)).toEqual({ rect: [615, 687, 70, 26, 4], shadow: { color: 'rgba(0, 0, 0, 0.5)', blur: 6, x: undefined, y: 2 } })
    expect(named(calls, 'fillText').map((c) => [c.args[0], c.args[1], c.args[2], c.alpha, c.fillStyle])).toEqual([['Add text', 623, 701, 0.5, '#dbdbdb']])
    // #dbdbdb at half over the #2e2e2e box reads about #848484, as measured.
    expect(Math.round((0xdb + 0x2e) / 2).toString(16)).toBe('85')
  })

  it('grows with the words, and evenly up and down a line at a time: [615, 687, 88, 26], [615, 680, 88, 40], [615, 673, 88, 54]', () => {
    expect(box(painted(note('Hello world', { draft: {} }))).rect).toEqual([615, 687, 88, 26, 4])
    expect(box(painted(note('Hello world\n', { draft: {} }))).rect).toEqual([615, 680, 88, 40, 4])
    expect(box(painted(note('Hello world\nL2\n', { draft: {} }))).rect).toEqual([615, 673, 88, 54, 4])
  })

  it('at rest: the dot on its point, the line on the point’s row, and the words 8px in on 14px lines', () => {
    const calls = painted(note('Hello world\nSecond line'))
    expect(named(calls, 'arc').map((c) => c.args.slice(0, 3))).toEqual([[558, 700, 3.5]])
    expect([named(calls, 'moveTo')[0]!.args, named(calls, 'lineTo')[0]!.args]).toEqual([
      [558.5, 700.5],
      [615.5, 700.5],
    ])
    expect(named(calls, 'stroke').map((c) => [c.strokeStyle, c.lineWidth])).toEqual([['#dbdbdb', 1]])
    expect(box(calls).rect).toEqual([615, 680, 88, 40, 4])
    expect(named(calls, 'fillText').map((c) => [c.args[0], c.args[1], c.args[2], c.baseline])).toEqual([
      ['Hello world', 623, 694, 'middle'],
      ['Second line', 623, 708, 'middle'],
    ])
    // The line and the dot paint under the box, whose shadow darkens the line's end.
    expect(calls.indexOf(named(calls, 'stroke')[0]!)).toBeLessThan(calls.indexOf(named(calls, 'roundRect')[0]!))
  })

  it('draws no line while its label stands on its point', () => {
    const d = drawingTools.create('note', 'n', [
      { time: 558 as never, price: 700 },
      { time: 558 as never, price: 700 },
    ])!
    expect(named(painted(d), 'stroke')).toEqual([])
  })

  it('has a handle on each point, and a drag on its box moves its label alone', () => {
    const d = note('Hello world', { selected: true })
    expect(d.getControlPoints(identityViewport).map((p) => [p.x, p.y])).toEqual([
      [558, 700],
      [615, 700],
    ])
    expect(d.grabbedAnchors({ x: 640, y: 700 }, identityViewport)).toEqual([1])
    expect(d.grabbedAnchors({ x: 590, y: 700 }, identityViewport)).toBeNull()
    expect([d.wordsAt({ x: 640, y: 700 }, identityViewport), d.wordsAt({ x: 590, y: 700 }, identityViewport)]).toEqual([true, false])
  })

  it('keeps a format-2 save’s look, its label’s top-left on its second point', () => {
    const save = { ...note('Hi').toJSON(), v: 2 as const, props: { text: 'Hi' } }
    const restored = drawingTools.restore(save)!
    expect(restored.props).toMatchObject({ savedLook: {}, drawBorder: true })
    const calls = painted(restored)
    expect(named(calls, 'roundRect')[0]!.args.slice(0, 2)).toEqual([615, 700])
  })
})

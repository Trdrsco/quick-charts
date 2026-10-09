// @vitest-environment happy-dom
// What a pin paints, held to measured pixels of a pin on (558, 700): a marker whose head is a circle
// of radius 11.75 round (558.5, 682.5) with a hole of radius 5 through it, its sides curving in to a
// tip on (558.5, 700.5); and, while the pin is hovered, selected or typed into, a box 236px wide
// centred over it, its bottom on row 657, a pointer under it toward the marker, its words 12px in
// on lines 19px tall, the first line's letters standing on row 623 for two lines.
import { beforeAll, describe, expect, it } from 'vitest'
import { drawingTools } from '../../../src/drawings/index'
import type { IDrawing, TextDraft } from '../../../src/internal/drawings/index'
import { identityViewport, measureInTrebuchet, named, painted, type PaintCall } from './measuredFont'

beforeAll(measureInTrebuchet)

function pin(words: string, how: { hovered?: boolean; selected?: boolean; draft?: Partial<TextDraft> } = {}): IDrawing {
  const d = drawingTools.create('pin', 'p', [{ time: 558 as never, price: 700 }])!
  d.applyProps({ text: how.draft ? '' : words })
  if (how.hovered) d.setHovered(true)
  if (how.selected || how.draft) d.setState('selected')
  if (how.draft) d.setTextDraft({ value: words, selectionStart: words.length, selectionEnd: words.length, composition: null, caret: false, ...how.draft })
  return d
}

const box = (calls: PaintCall[]): unknown[] | undefined => named(calls, 'roundRect')[0]?.args

describe('a pin, against measured pixels', () => {
  it('at rest shows its marker alone: a holed head round (558.5, 682.5), its sides curving in to a tip on (558.5, 700.5)', () => {
    const calls = painted(pin('Hello world'))
    expect(box(calls)).toBeUndefined()
    expect(named(calls, 'moveTo')[0]!.args).toEqual([558.5, 700.5])
    expect(named(calls, 'quadraticCurveTo').map((c) => c.args)).toEqual([
      [546.75, 690.5, 546.75, 682.5],
      [570.25, 690.5, 558.5, 700.5],
    ])
    expect(named(calls, 'arc').map((c) => c.args.slice(0, 3))).toEqual([
      [558.5, 682.5, 11.75],
      [558.5, 682.5, 5],
    ])
    const fill = named(calls, 'fill')[0]!
    expect([fill.args, fill.fillStyle]).toEqual([['evenodd'], '#2962ff'])
    expect(named(calls, 'fillText')).toEqual([])
  })

  it('hovered, stands its box over the marker: [440, 600, 236, 57] for two lines, its pointer under it, a soft shadow', () => {
    const calls = painted(pin('Hello world\nSecond line', { hovered: true }))
    expect(box(calls)).toEqual([440, 600, 236, 57, 4])
    expect([named(calls, 'moveTo')[2]!.args, ...named(calls, 'lineTo').map((c) => c.args)]).toEqual([
      [552, 657],
      [558.5, 665],
      [565, 657],
    ])
    const fill = named(calls, 'fill')[1]!
    expect([fill.fillStyle, fill.shadow]).toEqual(['rgba(46, 46, 46, 1)', { color: 'rgba(0, 0, 0, 0.5)', blur: 6, x: undefined, y: 2 }])
    // Painted at the middle of a 19px line, the words stand on rows 623 and 642, as measured.
    expect(named(calls, 'fillText').map((c) => [c.args[0], c.args[1], c.args[2], c.baseline, c.fillStyle])).toEqual([
      ['Hello world', 452, 619.5, 'middle', '#dbdbdb'],
      ['Second line', 452, 638.5, 'middle', '#dbdbdb'],
    ])
    expect([619.5, 638.5].map((middle) => Math.round(middle + (14 * (1510 - 420)) / 1930 / 2))).toEqual([623, 642])
  })

  it('placed, shows one line with its placeholder at half strength and a caret as tall as the type in the middle of the line', () => {
    const calls = painted(pin('', { draft: { caret: true } }))
    expect(box(calls)).toEqual([440, 619, 236, 38, 4])
    expect(named(calls, 'fillText').map((c) => [c.args[0], c.alpha])).toEqual([['Add text', 0.5]])
    // As measured: the caret two pixels wide on columns 451 and 452, rows 631 to 644.
    expect(named(calls, 'fillRect').map((c) => c.args)).toEqual([[451, 631, 2, 14]])
  })

  it('wraps its words at 212px, its box growing up a line at a time', () => {
    const calls = painted(pin('one two three four five six seven eight nine ten eleven twelve thirteen', { selected: true }))
    const lines = named(calls, 'fillText').length
    expect(lines).toBeGreaterThan(1)
    expect(box(calls)).toEqual([440, 657 - (lines * 19 + 19), 236, lines * 19 + 19, 4])
  })

  it('shows a small ring on its point; its box takes a press on its words, its marker does not', () => {
    const d = pin('Hello world', { selected: true })
    expect((d as unknown as { handleShape(): string }).handleShape()).toBe('small')
    expect([d.wordsAt({ x: 500, y: 640 }, identityViewport), d.wordsAt({ x: 558, y: 680 }, identityViewport)]).toEqual([true, false])
    expect([d.testHit({ x: 558, y: 680 }, identityViewport), d.testHit({ x: 500, y: 640 }, identityViewport)]).toEqual([true, true])
    d.setState('normal')
    expect([d.testHit({ x: 558, y: 680 }, identityViewport), d.testHit({ x: 500, y: 640 }, identityViewport)]).toEqual([true, false])
  })

  it('keeps a format-2 save’s look, its words under a smaller marker at all times', () => {
    const save = { ...pin('Hi').toJSON(), v: 2 as const, props: { text: 'Hi' } }
    const restored = drawingTools.restore(save)!
    expect(restored.props).toMatchObject({ savedLook: {}, fillBackground: true, drawBorder: false })
    const calls = painted(restored)
    expect(named(calls, 'fillText').map((c) => c.args[0])).toEqual(['Hi'])
    expect(named(calls, 'arc')[0]!.args.slice(0, 3)).toEqual([558, 686, 7])
  })
})

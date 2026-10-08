// @vitest-environment happy-dom
// What a text paints in each state, held to measured pixels. The words are measured in the font the
// measurements were painted in (Trebuchet MS, its advances at 14px), so every box comes out at the
// measured pixels: the frame's two-pixel bands just outside the words' box, the placeholder and the
// frame at 40% while an edit shows the placeholder, the selection's wash behind the selected glyphs,
// and no frame at rest.
import { beforeAll, describe, expect, it } from 'vitest'
import { drawingTools } from '../../../src/drawings/index'
import type { IDrawing, TextDraft, Viewport } from '../../../src/internal/drawings/index'

/** Trebuchet MS's advances, in its units of 2048 to the em. It kerns none of these. */
const UNITS: Record<string, number> = {
  ' ': 617, '2': 1074, A: 1208, H: 1340, S: 985, c: 1014, d: 1141, e: 1117, h: 1119, i: 584, l: 604, n: 1119, o: 1099, r: 796, t: 812, w: 1524, x: 1026,
}
const advance = (text: string, px: number): number => [...text].reduce((sum, c) => sum + (UNITS[c] ?? 1100), 0) * (px / 2048)
const pxOf = (font: string): number => Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 14)

beforeAll(() => {
  // The shared measurer the drawings lay their words out with, in that font.
  const measurer = {
    font: '',
    measureText(this: { font: string }, text: string) {
      return { width: advance(text, pxOf(this.font)) }
    },
  }
  HTMLCanvasElement.prototype.getContext = (() => measurer) as unknown as typeof HTMLCanvasElement.prototype.getContext
})

/** A pane where a time is its own x and a price its own y. */
const viewport: Viewport = {
  width: 800,
  height: 800,
  xOf: (time) => Number(time),
  yOf: (price) => price,
  timeAt: (x) => x as never,
  priceAt: (y) => y,
  barsBetween: (a, b) => Number(b) - Number(a),
  logicalOf: (time) => Number(time),
  timeOfLogical: (logical) => logical as never,
}

interface Call {
  name: string
  args: number[] | unknown[]
  fillStyle: unknown
  strokeStyle: unknown
  lineWidth: unknown
  alpha: number
  baseline: unknown
}

/** Paint a drawing on a context that records each call with the state it was made in. The context
 *  reports the font's ascent and descent at 14px. */
function painted(d: IDrawing): Call[] {
  const calls: Call[] = []
  let state = new Map<string | symbol, unknown>([['globalAlpha', 1]])
  const stack: Map<string | symbol, unknown>[] = []
  const ctx = new Proxy({} as CanvasRenderingContext2D, {
    get: (_t, p) => {
      if (p === 'measureText') return (text: string) => ({ width: advance(text, pxOf(String(state.get('font') ?? ''))), fontBoundingBoxAscent: (1923 / 2048) * 14, fontBoundingBoxDescent: (455 / 2048) * 14 })
      if (p === 'save') return () => void stack.push(new Map(state))
      if (p === 'restore') return () => void (state = stack.pop() ?? state)
      if (state.has(p)) return state.get(p)
      return (...args: unknown[]) => {
        calls.push({ name: String(p), args, fillStyle: state.get('fillStyle'), strokeStyle: state.get('strokeStyle'), lineWidth: state.get('lineWidth'), alpha: Number(state.get('globalAlpha')), baseline: state.get('textBaseline') })
      }
    },
    set: (_t, p, v) => {
      state.set(p, v)
      return true
    },
  })
  ;(d as unknown as { paint(c: CanvasRenderingContext2D, v: Viewport): void }).paint(ctx, viewport)
  return calls
}
const named = (calls: Call[], name: string): Call[] => calls.filter((c) => c.name === name)

/** A text at a box top-left, its words, selected or not, with an edit's draft or none. */
function text(x: number, y: number, words: string, how: { selected?: boolean; draft?: Partial<TextDraft> } = {}): IDrawing {
  const d = drawingTools.create('text', 't', [{ time: x as never, price: y }])!
  d.applyProps({ text: how.draft ? '' : words })
  if (how.selected || how.draft) d.setState('selected')
  if (how.draft) d.setTextDraft({ value: words, selectionStart: words.length, selectionEnd: words.length, composition: null, caret: false, ...how.draft })
  return d
}

/** The frame's four two-pixel bands, as the pixel columns and rows they fill, with its ink. */
function frame(calls: Call[]): { left: number[]; right: number[]; top: number[]; bottom: number[]; color: unknown; alpha: number } | null {
  const rect = named(calls, 'strokeRect')[0]
  if (!rect) return null
  const [x, y, w, h] = rect.args as number[]
  expect(rect.lineWidth).toBe(2)
  // A two-pixel stroke centred on a whole pixel edge fills the pixel either side of it.
  return { left: [x! - 1, x!], right: [x! + w! - 1, x! + w!], top: [y! - 1, y!], bottom: [y! + h! - 1, y! + h!], color: rect.strokeStyle, alpha: rect.alpha }
}

describe('a text, against measured pixels', () => {
  it('placed: the frame and the placeholder at 40%, the frame’s bands two pixels outside the box', () => {
    const calls = painted(text(114, 90, '', { draft: {} }))
    expect(frame(calls)).toEqual({ left: [112, 113], right: [172, 173], top: [88, 89], bottom: [109, 110], color: '#2962ff', alpha: 0.4 })
    const words = named(calls, 'fillText')
    expect(words.map((c) => [c.args[0], c.args[1], c.alpha])).toEqual([['Add text', 116, 0.4]])
    // 40% of #2962FF over the dark chart's #0f0f0f is the measured rgb(25, 48, 111).
    expect([41, 98, 255].map((c) => Math.round(15 + (c - 15) * 0.4))).toEqual([25, 48, 111])
  })

  it('placed at (558, 700): the empty frame’s box reads [556, 698, 62, 23]', () => {
    const f = frame(painted(text(558, 700, '', { draft: {} })))!
    expect([f.left[0], f.top[0], f.right[1] - f.left[0] + 1, f.bottom[1] - f.top[0] + 1]).toEqual([556, 698, 62, 23])
  })

  it('typing: the frame at full strength around the words as they grow', () => {
    expect(frame(painted(text(54, 40, 'Hel', { draft: {} })))).toEqual({ left: [52, 53], right: [80, 81], top: [38, 39], bottom: [59, 60], color: '#2962ff', alpha: 1 })
    const calls = painted(text(54, 40, 'Hello world', { draft: {} }))
    expect(frame(calls)).toEqual({ left: [52, 53], right: [132, 133], top: [38, 39], bottom: [59, 60], color: '#2962ff', alpha: 1 })
    // The words start two pixels into the box, painted on their line's middle and a pixel more.
    expect(named(calls, 'fillText').map((c) => [c.args[0], c.args[1], c.args[2], c.baseline, c.fillStyle, c.alpha])).toEqual([['Hello world', 56, 50, 'middle', '#2962ff', 1]])
  })

  it('a new line grows the frame down by one line', () => {
    expect(frame(painted(text(43, 39, 'Hello world\n', { draft: {} })))).toMatchObject({ left: [41, 42], right: [121, 122], top: [37, 38], bottom: [72, 73] })
    const calls = painted(text(43, 39, 'Hello world\nline2\n', { draft: {} }))
    expect(frame(calls)).toMatchObject({ left: [41, 42], right: [121, 122], top: [37, 38], bottom: [86, 87] })
    expect(named(calls, 'fillText').map((c) => [c.args[0], c.args[1], c.args[2]])).toEqual([
      ['Hello world', 45, 49],
      ['line2', 45, 63],
    ])
  })

  it('selected words: a white wash at a fifth behind the selected glyphs, a line tall', () => {
    const calls = painted(text(54, 40, 'Hello world', { draft: { selectionStart: 6, selectionEnd: 11 } }))
    const wash = named(calls, 'fillRect').filter((c) => c.fillStyle === 'rgba(255, 255, 255, 0.2)')
    // The wash covers columns 93 to 128 and rows 42 to 55, as measured.
    expect(wash.map((c) => c.args)).toEqual([[93, 42, 36, 14]])
    // The wash is laid before the words, which keep their color over it.
    expect(calls.indexOf(wash[0]!)).toBeLessThan(calls.indexOf(named(calls, 'fillText')[0]!))
    // White at a fifth reads 63 over the chart's 15 and 99 over its grid's 60, as measured.
    expect([15, 60].map((c) => Math.round(c + (255 - c) * 0.2))).toEqual([63, 99])
  })

  it('committed and still selected: the same frame, at full strength', () => {
    expect(frame(painted(text(43, 39, 'Hello world\nline2\n', { selected: true })))).toEqual({ left: [41, 42], right: [121, 122], top: [37, 38], bottom: [86, 87], color: '#2962ff', alpha: 1 })
  })

  it('two lines at (558, 700): the frame’s box reads [556, 698, 82, 37]', () => {
    const calls = painted(text(558, 700, 'Hello world\nSecond line', { selected: true }))
    const f = frame(calls)!
    expect([f.left[0], f.top[0], f.right[1] - f.left[0] + 1, f.bottom[1] - f.top[0] + 1]).toEqual([556, 698, 82, 37])
    expect(named(calls, 'fillText').map((c) => [c.args[0], c.args[1]])).toEqual([
      ['Hello world', 560],
      ['Second line', 560],
    ])
  })

  it('deselected: the words alone, with no frame and no handle', () => {
    const calls = painted(text(43, 39, 'Hello world\nline2\n'))
    expect(frame(calls)).toBeNull()
    expect(named(calls, 'arc')).toEqual([])
    expect(named(calls, 'fillText').map((c) => c.args[0])).toEqual(['Hello world', 'line2'])
  })

  it('emptied and selected: the frame at full strength, the placeholder at 40%', () => {
    const calls = painted(text(43, 39, '', { selected: true }))
    expect(frame(calls)).toEqual({ left: [41, 42], right: [101, 102], top: [37, 38], bottom: [58, 59], color: '#2962ff', alpha: 1 })
    expect(named(calls, 'fillText').map((c) => [c.args[0], c.alpha])).toEqual([['Add text', 0.4]])
  })

  it('paints the caret two pixels wide on its place and a line tall, in the words’ color, and only while it is lit', () => {
    const lit = painted(text(54, 40, 'Hello world', { draft: { caret: true, selectionStart: 5, selectionEnd: 5 } }))
    const caret = named(lit, 'fillRect').filter((c) => c.fillStyle === '#2962ff')
    expect(caret.map((c) => c.args)).toEqual([[Math.round(56 + advance('Hello', 14)) - 1, 42, 2, 14]])
    expect(named(painted(text(54, 40, 'Hello world', { draft: { caret: false } })), 'fillRect')).toEqual([])
    // A selection shows its wash and no caret.
    expect(named(painted(text(54, 40, 'Hello world', { draft: { caret: true, selectionStart: 0, selectionEnd: 5 } })), 'fillRect').map((c) => c.fillStyle)).toEqual(['rgba(255, 255, 255, 0.2)'])
  })

  it('underlines a composing run on its line’s last row', () => {
    const calls = painted(text(54, 40, 'Hello world', { draft: { composition: { start: 6, end: 11 } } }))
    expect(named(calls, 'fillRect').map((c) => c.args)).toEqual([[93, 55, 36, 1]])
  })

  it('takes its placeholder from the host, in the viewer’s language', () => {
    const d = text(43, 39, '', { selected: true })
    d.setTextPlaceholder(() => 'Texte')
    expect(named(painted(d), 'fillText').map((c) => c.args[0])).toEqual(['Texte'])
  })

  it('shows no placeholder for words emptied during an edit: the box closes on the caret’s pixel and the frame stays at full strength', () => {
    const d = text(54, 40, 'Hi', { selected: true })
    d.setTextDraft({ value: '', selectionStart: 0, selectionEnd: 0, composition: null, caret: false })
    const calls = painted(d)
    expect(named(calls, 'fillText')).toEqual([])
    expect(frame(calls)).toEqual({ left: [52, 53], right: [60, 61], top: [38, 39], bottom: [59, 60], color: '#2962ff', alpha: 1 })
  })
})

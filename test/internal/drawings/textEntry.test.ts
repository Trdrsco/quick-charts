// The words a drawing types on the chart, as lines that keep their place in the words: where each
// line starts and ends, where a caret offset stands, and which stretch of each line a run covers,
// with and without a wrap width.
import { describe, expect, it } from 'vitest'
import { caretPlace, layoutTextBlock, lineLeft, lineOf, runSpans } from '../../../src/internal/drawings/core/textEntry'

/** Seven pixels a character. */
const measure = (line: string): number => line.length * 7

describe('a block of words in lines', () => {
  it('is one line per line break, each keeping its offsets and its width, the widest the block’s', () => {
    const block = layoutTextBlock('Hello world\nline2\n', measure)
    expect(block.lines).toEqual([
      { text: 'Hello world', start: 0, end: 11, width: 77 },
      { text: 'line2', start: 12, end: 17, width: 35 },
      { text: '', start: 18, end: 18, width: 0 },
    ])
    expect(block.width).toBe(77)
    expect(layoutTextBlock('', measure).lines).toEqual([{ text: '', start: 0, end: 0, width: 0 }])
  })

  it('wraps at the space before a word that would run past the width, a word wider than it breaking where it must', () => {
    const block = layoutTextBlock('one two three four', measure, 60)
    expect(block.lines.map((l) => [l.text, l.start, l.end])).toEqual([
      ['one two', 0, 7],
      ['three', 8, 13],
      ['four', 14, 18],
    ])
    expect(layoutTextBlock('abcdefghijkl', measure, 30).lines.map((l) => l.text)).toEqual(['abcd', 'efgh', 'ijkl'])
    // Spaces a line keeps stay in it, so every offset has a place.
    expect(layoutTextBlock(' a  b', measure, 100).lines.map((l) => [l.text, l.start, l.end])).toEqual([[' a  b', 0, 5]])
    expect(layoutTextBlock('ab\ncd ef', measure, 20).lines.map((l) => l.text)).toEqual(['ab', 'cd', 'ef'])
  })

  it('stands a caret on its line at its distance from the line’s start, and one at a wrap point at the end of the line before it', () => {
    const block = layoutTextBlock('Hello world\nline2\n', measure)
    expect(caretPlace(block, 0, measure)).toEqual({ line: 0, x: 0 })
    expect(caretPlace(block, 11, measure)).toEqual({ line: 0, x: 77 })
    expect(caretPlace(block, 12, measure)).toEqual({ line: 1, x: 0 })
    expect(caretPlace(block, 14, measure)).toEqual({ line: 1, x: 14 })
    expect(caretPlace(block, 18, measure)).toEqual({ line: 2, x: 0 })
    const wrapped = layoutTextBlock('one two three', measure, 60)
    expect(lineOf(wrapped, 7)).toBe(0)
    expect(lineOf(wrapped, 8)).toBe(1)
    expect(caretPlace(wrapped, 7, measure)).toEqual({ line: 0, x: 49 })
  })

  it('covers a run line by line, from either end', () => {
    const block = layoutTextBlock('Hello world\nline2', measure)
    expect(runSpans(block, 6, 11, measure)).toEqual([{ line: 0, x0: 42, x1: 77 }])
    expect(runSpans(block, 11, 6, measure)).toEqual([{ line: 0, x0: 42, x1: 77 }])
    expect(runSpans(block, 8, 14, measure)).toEqual([
      { line: 0, x0: 56, x1: 77 },
      { line: 1, x0: 0, x1: 14 },
    ])
    expect(runSpans(block, 4, 4, measure)).toEqual([])
    // A run that ends where a line starts covers nothing of that line.
    expect(runSpans(block, 0, 12, measure).map((s) => s.line)).toEqual([0])
  })

  it('stands each line across its block for its alignment', () => {
    const block = layoutTextBlock('wide line\nab', measure)
    expect([0, 1].map((i) => lineLeft(block, i, 'left'))).toEqual([0, 0])
    expect([0, 1].map((i) => lineLeft(block, i, 'center'))).toEqual([0, 24.5])
    expect([0, 1].map((i) => lineLeft(block, i, 'right'))).toEqual([0, 49])
    expect(lineLeft(block, 1, 'center', 100)).toBe(43)
  })
})

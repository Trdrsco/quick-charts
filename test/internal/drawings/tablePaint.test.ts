// @vitest-environment happy-dom
// What a table paints and how its grid answers the pointer, held to the measured table placed with
// its top-left on (455, 570): three by three cells, columns 120px wide, rows of empty cells 31px tall,
// grid lines on columns 455, 575, 695 and 815 and rows 570, 601, 632 and 663. A row with one line of
// words is 32px tall and each line more adds 18.2px; a cell's first line has its middle 17px under
// the row's top, on a whole pixel, and its words stand 9px in. The cell being typed in wears a 2px
// frame just inside its grid lines; a hovered grid line wears a band 7px wide; the corners carry
// round handles that scale the columns, rows keeping their words' height.
import { beforeAll, describe, expect, it } from 'vitest'
import { drawingTools } from '../../../src/drawings/index'
import { nextCell, TableNote, withColumn, withoutColumn, withoutRow, withRow, type TableProps, type Viewport } from '../../../src/internal/drawings/index'
import { drawingInksOf } from '../../../src/internal/drawings/core/inks'
import { BUILT_IN_THEMES } from '../../../src/theme/palettes'
import { identityViewport, measureInTrebuchet, named, painted, type PaintCall } from './measuredFont'

beforeAll(measureInTrebuchet)

const vp: Viewport = identityViewport

function table(cells?: string[][], props: Partial<TableProps> = {}): TableNote {
  const d = drawingTools.create('table', 't', [{ time: 455 as never, price: 570 }])! as unknown as TableNote
  d.setInks(() => drawingInksOf(BUILT_IN_THEMES.dark))
  d.applyProps({ ...(cells ? { cells } : {}), ...props })
  return d
}

/** The grid lines a paint drew: their pixel columns and rows. */
function grid(calls: PaintCall[]): { xs: number[]; ys: number[] } {
  const moves = named(calls, 'moveTo').map((c) => c.args as [number, number])
  const lines = named(calls, 'lineTo').map((c) => c.args as [number, number])
  const xs: number[] = []
  const ys: number[] = []
  moves.forEach(([x, y], i) => {
    const [x2, y2] = lines[i]!
    if (x === x2) xs.push(x - 0.5)
    else if (y === y2) ys.push(y - 0.5)
  })
  return { xs, ys }
}

describe('a table, against measured pixels', () => {
  it('placed: three by three, its grid on columns 455 to 815 and rows 570 to 663, its ground in its fill', () => {
    const calls = painted(table())
    expect(grid(calls)).toEqual({ xs: [455, 575, 695, 815], ys: [570, 601, 632, 663] })
    expect(named(calls, 'stroke')[0]).toMatchObject({ strokeStyle: '#575757', lineWidth: 1 })
    expect(named(calls, 'fillRect')[0]).toMatchObject({ args: [455, 570, 361, 94], fillStyle: 'rgba(15, 15, 15, 1)' })
    expect(named(calls, 'roundRect')).toEqual([])
  })

  it('grows a row with its words, 32px for a line and 18.2px a line more, its words 9px in and 17px down', () => {
    const calls = painted(table([['A\nB\n', '', ''], ['E', '', ''], ['', '', '']]))
    // As measured: rows from 570, 638.4 and 670.4.
    expect(grid(calls).ys).toEqual([570, 638, 670, 701])
    expect(named(calls, 'fillText').map((c) => [c.args[0], c.args[1], Math.round(Number(c.args[2]) * 10) / 10, c.baseline, c.fillStyle])).toEqual([
      ['A', 464, 587, 'middle', '#dbdbdb'],
      ['B', 464, 605.2, 'middle', '#dbdbdb'],
      ['E', 464, 655, 'middle', '#dbdbdb'],
    ])
  })

  it('frames the cell being typed in 2px inside its grid lines, in the accent', () => {
    const d = table()
    d.setState('selected')
    d.editCell({ row: 1, col: 1 })
    d.setTextDraft({ value: '', selectionStart: 0, selectionEnd: 0, composition: null, caret: false })
    const calls = painted(d)
    // As measured: the frame covers [576, 602, 119, 30].
    expect(named(calls, 'strokeRect').map((c) => [c.args, c.strokeStyle, c.lineWidth])).toEqual([[[577, 603, 117, 28], '#2962ff', 2]])
    // No placeholder stands in a cell.
    expect(named(calls, 'fillText')).toEqual([])
  })

  it('lays the field over the cell being typed in, and grows the row as lines are typed', () => {
    const d = table()
    d.editCell({ row: 1, col: 1 })
    d.setTextDraft({ value: 'C', selectionStart: 1, selectionEnd: 1, composition: null, caret: true })
    expect(d.textFrame(vp)).toMatchObject({ x: 584, y: 607.9, width: 102, lines: 1, lineHeight: 18.2, align: 'left', wrapWidth: null })
    d.setTextDraft({ value: 'C\nD', selectionStart: 3, selectionEnd: 3, composition: null, caret: true })
    expect(grid(painted(d)).ys).toEqual([570, 601, 651, 682])
  })

  it('stands a band 7px wide over the grid line under the pointer of a selected table, in the accent at 20%', () => {
    const d = table()
    d.setState('selected')
    d.setPointer({ x: 575, y: 654 })
    const band = named(painted(d), 'fillRect').find((c) => c.alpha === 0.2)!
    expect([band.args, band.fillStyle]).toEqual([[572, 570, 7, 94], '#2962ff'])
    d.setPointer({ x: 600, y: 601 })
    expect(named(painted(d), 'fillRect').find((c) => c.alpha === 0.2)!.args).toEqual([455, 598, 361, 7])
    d.setPointer({ x: 600, y: 590 })
    expect(named(painted(d), 'fillRect').filter((c) => c.alpha === 0.2)).toEqual([])
  })

  it('wears round handles on its corners and none on its point, and answers the pointer with resize and typing cursors', () => {
    const d = table()
    d.setState('selected')
    expect(d.getControlPoints(vp)).toEqual([])
    expect(d.resizeHandles(vp)).toEqual([
      { x: 455, y: 570 },
      { x: 815, y: 570 },
      { x: 815, y: 663 },
      { x: 455, y: 663 },
    ])
    expect(d.gripShape()).toBe('circle')
    const cursor = (x: number, y: number): string | null => (d as unknown as { cursorAt(p: { x: number; y: number }, v: Viewport): string | null }).cursorAt({ x, y }, vp)
    expect([cursor(575, 620), cursor(815, 620), cursor(600, 601), cursor(600, 663), cursor(455, 570), cursor(815, 570), cursor(600, 620)]).toEqual([
      'ew-resize',
      'ew-resize',
      'ns-resize',
      'ns-resize',
      'nwse-resize',
      'nesw-resize',
      'text',
    ])
  })

  it('scales its columns from a corner, its rows keeping their words’ height', () => {
    const d = table([['A\nB\n', '', '', '', ''], ['E', '', '', '', ''], ['', '', '', '', '']], { colWidths: [160.22, 120, 120, 120, 120] })
    // As measured: 60px off the width takes [160.2, 120 x4] to [145.2, 108.8 x4].
    d.resizeTo(2, { x: 455 + 640.22 - 60, y: 570 + 131.4 - 20 }, vp)
    expect(d.props.colWidths.map((w) => Math.round(w * 10) / 10)).toEqual([145.2, 108.8, 108.8, 108.8, 108.8])
    expect(d.props.rowHeights.map((h) => Math.round(h * 10) / 10)).toEqual([68.4, 32, 31])
  })

  it('resizes a column from its line and a row from its line, never below its words', () => {
    const d = table([['', '', ''], ['E', '', ''], ['', '', '']])
    d.resizeTo(4, { x: 615, y: 600 }, vp)
    expect(d.props.colWidths).toEqual([160, 120, 120])
    d.resizeTo(4 + 2, { x: 600, y: 590 }, vp)
    expect(d.props.rowHeights[0]).toBe(31)
  })

  it('keeps a format-2 table’s look, rows 26px tall in a rounded card', () => {
    const save = { ...table([['a', 'b']]).toJSON(), v: 2 as const, props: { cells: [['a', 'b']], headerRow: false, colWidths: [], rowHeights: [] } }
    const restored = drawingTools.restore(save)!
    expect(restored.props).toMatchObject({ savedLook: {}, colWidths: [96, 96] })
    expect(named(painted(restored), 'roundRect')[0]!.args).toEqual([455, 570, 192, 26, 4])
  })
})

describe('a table’s rows and columns', () => {
  const props = (cells: string[][]): TableProps => ({ cells, headerRow: false, textHAlign: 'left', colWidths: [], rowHeights: [], savedLook: null })

  it('adds a column at the right end, or right of a cell’s column', () => {
    expect(withColumn(props([['a', 'b']]), null)).toEqual({ cells: [['a', 'b', '']], colWidths: [120, 120, 120] })
    expect(withColumn(props([['a', 'b']]), 0)).toEqual({ cells: [['a', '', 'b']], colWidths: [120, 120, 120] })
  })

  it('adds a row at the bottom, or below a cell’s row', () => {
    expect(withRow(props([['a'], ['b']]), null)).toEqual({ cells: [['a'], ['b'], ['']], rowHeights: [0, 0, 0] })
    expect(withRow(props([['a'], ['b']]), 0)).toEqual({ cells: [['a'], [''], ['b']], rowHeights: [0, 0, 0] })
  })

  it('removes a row or a column, never the last', () => {
    expect(withoutRow(props([['a'], ['b']]), 0)).toEqual({ cells: [['b']], rowHeights: [] })
    expect(withoutColumn(props([['a', 'b']]), 1)).toEqual({ cells: [['a']], colWidths: [] })
    expect([withoutRow(props([['a']]), 0), withoutColumn(props([['a']]), 0)]).toEqual([null, null])
  })

  it('takes cells in reading order, from the last back to the first, and back again', () => {
    const p = props([['', '', ''], ['', '', ''], ['', '', '']])
    expect([nextCell(p, { row: 1, col: 1 }), nextCell(p, { row: 1, col: 2 }), nextCell(p, { row: 2, col: 2 }), nextCell(p, { row: 0, col: 0 }, true)]).toEqual([
      { row: 1, col: 2 },
      { row: 2, col: 0 },
      { row: 0, col: 0 },
      { row: 2, col: 2 },
    ])
  })
})

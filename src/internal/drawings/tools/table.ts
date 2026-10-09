import type { ControlPoint, Point, Viewport } from '../core/types'
import { Drawing } from '../core/drawing'
import { endSavedLook, type SavedLook } from '../core/savedLook'
import { layoutTextBlock, type TextEditFrame } from '../core/textEntry'
import { fillPaint, fontOf, lineMeasure, withAlpha, type HandleShape } from '../render/canvas'
import { paintTextEntry } from '../render/textEntry'

export type TableProps = {
  /** Row-major cell text. The grid's shape IS this array's shape. */
  cells: string[][]
  /** The first row banded as a header. */
  headerRow: boolean
  /** Where each cell's words stand across it. */
  textHAlign: 'left' | 'center' | 'right'
  /** Per-column widths in px; a column beyond the array is 120px wide. */
  colWidths: number[]
  /** Per-row heights in px; a row beyond the array, or of height 0, takes its words' height, and no
   *  row stands shorter than its words. */
  rowHeights: number[]
  /** A format-2 table's look, its rows 26px tall around one line of words each and its border
   *  rounded at 4, painted as format 2 did until the table's settings change. */
  savedLook: SavedLook
}

/** A cell of a table, by its row and column. */
export interface TableCell {
  row: number
  col: number
}

/** A table's columns' width where none is set, the bounds a resize holds a column and a row to,
 *  how far a cell's words stand in from its grid line across and down, its lines' height to its
 *  type, how much shorter a row of empty cells stands than a row of one line, the band a hovered
 *  grid line wears on each side of its pixel, and how far in from a cell's grid lines the frame
 *  round the cell being typed in stands. */
const CELL_WIDTH = 120
const MIN_COL = 28
const MAX_COL = 600
const MIN_ROW = 16
const MAX_ROW = 400
const CELL_INSET = 9
const CELL_PAD = 6.9
const LINE_HEIGHT = 1.3
const EMPTY_ROW_SHORTER = 1
const LINE_BAND = { half: 3, alpha: 0.2 }
const CELL_FRAME = 2

/** A format-2 table's rows, and the room its words kept from a cell's side. */
const SAVED_ROW = 26
const SAVED_PAD = 8

/** A cell's lines: its words split at their line breaks, none for an empty cell. */
const linesOf = (text: string): string[] => (text === '' ? [] : text.split('\n'))

/** A table's props with a column added: right of `after`, or at the right end where it is null. */
export function withColumn(props: Readonly<TableProps>, after: number | null): Pick<TableProps, 'cells' | 'colWidths'> {
  const cols = props.cells[0]?.length ?? 0
  const at = after === null ? cols : Math.min(cols, Math.max(0, after + 1))
  const colWidths = Array.from({ length: cols }, (_, c) => props.colWidths[c] ?? CELL_WIDTH)
  colWidths.splice(at, 0, CELL_WIDTH)
  return { cells: props.cells.map((row) => [...row.slice(0, at), '', ...row.slice(at)]), colWidths }
}

/** A table's props with a row added: below `after`, or at the bottom where it is null. */
export function withRow(props: Readonly<TableProps>, after: number | null): Pick<TableProps, 'cells' | 'rowHeights'> {
  const rows = props.cells.length
  const cols = props.cells[0]?.length ?? 0
  const at = after === null ? rows : Math.min(rows, Math.max(0, after + 1))
  const rowHeights = Array.from({ length: rows }, (_, r) => props.rowHeights[r] ?? 0)
  rowHeights.splice(at, 0, 0)
  const cells = props.cells.map((row) => [...row])
  cells.splice(at, 0, Array.from({ length: cols }, () => ''))
  return { cells, rowHeights }
}

/** A table's props without a row, or null where it is the table's last. */
export function withoutRow(props: Readonly<TableProps>, row: number): Pick<TableProps, 'cells' | 'rowHeights'> | null {
  if (props.cells.length <= 1 || row < 0 || row >= props.cells.length) return null
  return { cells: props.cells.filter((_, r) => r !== row), rowHeights: props.rowHeights.filter((_, r) => r !== row) }
}

/** A table's props without a column, or null where it is the table's last. */
export function withoutColumn(props: Readonly<TableProps>, col: number): Pick<TableProps, 'cells' | 'colWidths'> | null {
  const cols = props.cells[0]?.length ?? 0
  if (cols <= 1 || col < 0 || col >= cols) return null
  return { cells: props.cells.map((row) => row.filter((_, c) => c !== col)), colWidths: props.colWidths.filter((_, c) => c !== col) }
}

/** The cell after another in reading order, wrapping from the last to the first; backward, the one
 *  before it. */
export function nextCell(props: Readonly<TableProps>, cell: TableCell, backward = false): TableCell {
  const rows = props.cells.length
  const cols = props.cells[0]?.length ?? 1
  const count = Math.max(1, rows * cols)
  const at = (cell.row * cols + cell.col + (backward ? count - 1 : 1)) % count
  return { row: Math.floor(at / cols), col: at % cols }
}

/**
 * Table: a grid of cells whose top-left stands on a chart point. Its columns are 120px wide unless
 * resized, and each row is as tall as its tallest cell's words, lines 1.3 times their size with
 * 6.9px above and below them, a row of empty cells a pixel shorter than one of a line; a row resized
 * taller keeps its height. The table is the drawing's fill, its grid one pixel lines in its stroke
 * color, and a cell's words stand 9px in from its grid line on the side they align to. Selected, it
 * shows a round handle on each corner, which scales the table, and a hovered grid line wears a band
 * 7px wide and resizes its column or row; a click on a cell of the selected table types into it,
 * framed 2px in from its grid lines.
 */
export class TableNote extends Drawing<TableProps> {
  readonly type = 'table'

  protected override defaultProps(): TableProps {
    return {
      cells: [
        ['', '', ''],
        ['', '', ''],
        ['', '', ''],
      ],
      headerRow: false,
      textHAlign: 'left',
      colWidths: [],
      rowHeights: [],
      savedLook: null,
    }
  }

  /** A format-2 table's columns stood 96px wide where it set no width, its rows 26px tall, its border
   *  and grid took its stroke color at 45%, and a save naming no cells or header was two by two with
   *  a header row; it paints so until its settings change. */
  protected override keepSavedLook(saved: Readonly<Record<string, unknown>>): void {
    // A save naming no cells or header drew two by two with a header row.
    if (!('cells' in saved)) this._props = { ...this._props, cells: [['', ''], ['', '']] }
    if (!('headerRow' in saved)) this._props = { ...this._props, headerRow: true }
    const cols = this._props.cells[0]?.length ?? 0
    const colWidths = Array.from({ length: cols }, (_, c) => this._props.colWidths[c] ?? 96)
    this._props = { ...this._props, colWidths, savedLook: {} }
    this._style = { ...this._style, lineColor: withAlpha(this._style.lineColor, 0.45) }
  }

  override applyProps(patch: Partial<TableProps>): void {
    super.applyProps(endSavedLook(patch))
  }

  requiredAnchors(): number {
    return 1
  }

  // ── The cell being typed in ─────────────────────────────────────────────────────────────────

  private _editingCell: TableCell | null = null

  /** The cell being typed in, or the one last typed in that an edit of the table's rows and
   *  columns acts on (transient view state, never serialized); it wears a frame. */
  get editingCell(): TableCell | null {
    return this._editingCell
  }

  editCell(cell: TableCell | null): void {
    this._editingCell = cell
    this.requestUpdate()
  }

  /** The words a cell shows: the open edit's draft in the cell being typed in, its own elsewhere. */
  private wordsOf(row: number, col: number): string {
    const cell = this._editingCell
    const draft = this.textDraft
    if (draft && cell && cell.row === row && cell.col === col) return draft.value
    return this.props.cells[row]?.[col] ?? ''
  }

  /** The words a cell holds, committed, for an editor opened on it. */
  cellWords(cell: TableCell): string {
    return this.props.cells[cell.row]?.[cell.col] ?? ''
  }

  // ── Geometry ────────────────────────────────────────────────────────────────────────────────

  private lineHeight(): number {
    return Math.round(this.style.fontSize * LINE_HEIGHT * 10) / 10
  }

  private colWidth(i: number): number {
    if (this.props.savedLook) return Math.max(MIN_COL, this.props.colWidths[i] ?? CELL_WIDTH)
    return Math.min(MAX_COL, Math.max(MIN_COL, this.props.colWidths[i] ?? CELL_WIDTH))
  }

  /** How tall a row's words stand: its tallest cell's lines and the room above and below them. */
  private rowContent(r: number): number {
    const lh = this.lineHeight()
    const cols = this.props.cells[0]?.length ?? 0
    let lines = 0
    for (let c = 0; c < cols; c++) lines = Math.max(lines, linesOf(this.wordsOf(r, c)).length)
    return lines === 0 ? lh + CELL_PAD * 2 - EMPTY_ROW_SHORTER : lines * lh + CELL_PAD * 2
  }

  private rowHeight(r: number): number {
    if (this.props.savedLook) return Math.max(MIN_ROW, this.props.rowHeights[r] || SAVED_ROW)
    return Math.max(this.rowContent(r), this.props.rowHeights[r] ?? 0)
  }

  /** Left offsets per column boundary (0..cols) and top offsets per row boundary (0..rows). */
  private offsets(): { xs: number[]; ys: number[] } {
    const rows = this.props.cells.length
    const cols = this.props.cells[0]?.length ?? 0
    const xs = [0]
    for (let c = 0; c < cols; c++) xs.push(xs[c]! + this.colWidth(c))
    const ys = [0]
    for (let r = 0; r < rows; r++) ys.push(ys[r]! + this.rowHeight(r))
    return { xs, ys }
  }

  protected frame(viewport: Viewport): { x: number; y: number; width: number; height: number } | null {
    const anchor = this.anchors[0]
    if (!anchor) return null
    const p = this.anchorToPixel(anchor, viewport)
    if (!p) return null
    const { xs, ys } = this.offsets()
    if (xs.length < 2 || ys.length < 2) return null
    return { x: p.x, y: p.y, width: xs[xs.length - 1]!, height: ys[ys.length - 1]! }
  }

  /** The pixel columns of the table's vertical grid lines and the pixel rows of its horizontal
   *  ones, outer edges included. */
  private gridPixels(viewport: Viewport): { xs: number[]; ys: number[] } | null {
    const f = this.frame(viewport)
    if (!f) return null
    const { xs, ys } = this.offsets()
    return { xs: xs.map((x) => Math.round(f.x + x)), ys: ys.map((y) => Math.round(f.y + y)) }
  }

  /** The cell under a pane point, with its rect: where a click on the selected table types. */
  cellAt(point: Point, viewport: Viewport): { row: number; col: number; rect: { x: number; y: number; width: number; height: number } } | null {
    const f = this.frame(viewport)
    if (!f) return null
    const { xs, ys } = this.offsets()
    const dx = point.x - f.x
    const dy = point.y - f.y
    if (dx < 0 || dy < 0 || dx > f.width || dy > f.height) return null
    let col = 0
    while (col < xs.length - 2 && dx >= xs[col + 1]!) col++
    let row = 0
    while (row < ys.length - 2 && dy >= ys[row + 1]!) row++
    return {
      row,
      col,
      rect: { x: f.x + xs[col]!, y: f.y + ys[row]!, width: xs[col + 1]! - xs[col]!, height: ys[row + 1]! - ys[row]! },
    }
  }

  /** Where a cell's words stand: their first line's box, its width across the cell, and the
   *  height of a line. */
  private cellWordsPlace(cell: TableCell, viewport: Viewport): { x: number; y: number; width: number; lineHeight: number } | null {
    const f = this.frame(viewport)
    if (!f) return null
    const { xs, ys } = this.offsets()
    const left = xs[cell.col]
    const right = xs[cell.col + 1]
    const top = ys[cell.row]
    if (left === undefined || right === undefined || top === undefined) return null
    const lh = this.lineHeight()
    // The first line's middle stands on a whole pixel, as far down as the room and half a line and
    // a pixel more.
    const middle = Math.round(f.y + top + CELL_PAD + lh / 2 + 1)
    return { x: f.x + left + CELL_INSET, y: middle - lh / 2 - 1, width: right - left - CELL_INSET * 2, lineHeight: lh }
  }

  override textFrame(viewport: Viewport): TextEditFrame | null {
    const cell = this._editingCell
    if (!cell) return null
    const at = this.cellWordsPlace(cell, viewport)
    if (!at) return null
    const lines = Math.max(1, linesOf(this.wordsOf(cell.row, cell.col)).length)
    return { x: at.x, y: at.y, width: at.width, lines, lineHeight: at.lineHeight, font: fontOf(this.style), align: this.props.textHAlign ?? 'left', wrapWidth: null, angle: 0 }
  }

  // ── Painting ────────────────────────────────────────────────────────────────────────────────

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    if (this.props.savedLook) {
      this.paintSaved(ctx, viewport)
      return
    }
    const grid = this.gridPixels(viewport)
    if (!grid) return
    const rows = this.props.cells.length
    const cols = this.props.cells[0]?.length ?? 0
    const left = grid.xs[0]!
    const right = grid.xs[grid.xs.length - 1]!
    const top = grid.ys[0]!
    const bottom = grid.ys[grid.ys.length - 1]!
    ctx.save()
    ctx.setLineDash([])
    const base = fillPaint(this.style)
    if (base) {
      ctx.fillStyle = base
      ctx.fillRect(left, top, right - left + 1, bottom - top + 1)
    }
    if (this.props.headerRow) {
      ctx.fillStyle = withAlpha(this.style.lineColor, 0.16)
      ctx.fillRect(left, top, right - left + 1, grid.ys[1]! - top)
    }
    // The grid, every line on its pixel.
    ctx.strokeStyle = this.style.lineColor
    ctx.lineWidth = 1
    ctx.beginPath()
    for (const y of grid.ys) {
      ctx.moveTo(left, y + 0.5)
      ctx.lineTo(right + 1, y + 0.5)
    }
    for (const x of grid.xs) {
      ctx.moveTo(x + 0.5, top)
      ctx.lineTo(x + 0.5, bottom + 1)
    }
    ctx.stroke()
    // Each cell's words, clipped to the cell.
    const measure = lineMeasure(this.style)
    const align = this.props.textHAlign ?? 'left'
    const editing = this._editingCell
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const typing = !!editing && editing.row === r && editing.col === c && !!this.textDraft
        const words = this.wordsOf(r, c)
        if (!words && !typing) continue
        const at = this.cellWordsPlace({ row: r, col: c }, viewport)
        if (!at) continue
        ctx.save()
        ctx.beginPath()
        ctx.rect(grid.xs[c]! + 1, grid.ys[r]! + 1, grid.xs[c + 1]! - grid.xs[c]! - 1, grid.ys[r + 1]! - grid.ys[r]! - 1)
        ctx.clip()
        paintTextEntry(ctx, {
          x: at.x,
          y: at.y,
          width: at.width,
          lineHeight: at.lineHeight,
          font: fontOf(this.style),
          color: this.style.textColor,
          align,
          block: layoutTextBlock(words, measure),
          placeholder: null,
          draft: typing ? this.textDraft : null,
          measure,
        })
        ctx.restore()
      }
    }
    const inks = this.inks()
    // The hovered grid line's band, over the whole table.
    const line = this.state === 'selected' ? this.hoveredLine(viewport) : null
    if (line) {
      ctx.globalAlpha = LINE_BAND.alpha
      ctx.fillStyle = inks.accent
      if (line.across === 'column') ctx.fillRect(line.at - LINE_BAND.half, top, LINE_BAND.half * 2 + 1, bottom - top + 1)
      else ctx.fillRect(left, line.at - LINE_BAND.half, right - left + 1, LINE_BAND.half * 2 + 1)
      ctx.globalAlpha = 1
    }
    // The frame round the cell being typed in.
    if (editing && editing.row < rows && editing.col < cols) {
      const x0 = grid.xs[editing.col]!
      const y0 = grid.ys[editing.row]!
      ctx.strokeStyle = inks.accent
      ctx.lineWidth = CELL_FRAME
      ctx.strokeRect(x0 + CELL_FRAME, y0 + CELL_FRAME, grid.xs[editing.col + 1]! - x0 - CELL_FRAME - 1, grid.ys[editing.row + 1]! - y0 - CELL_FRAME - 1)
    }
    ctx.restore()
  }

  /** A format-2 table: a card rounded at 4 in its fill, its grid in its stroke, one line of words in
   *  each cell. */
  private paintSaved(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const f = this.frame(viewport)
    if (!f) return
    const rows = this.props.cells.length
    const cols = this.props.cells[0]?.length ?? 0
    const { xs, ys } = this.offsets()
    ctx.save()
    ctx.setLineDash([])
    const base = fillPaint(this.style)
    if (base) {
      ctx.fillStyle = base
      ctx.beginPath()
      ctx.roundRect(f.x, f.y, f.width, f.height, 4)
      ctx.fill()
    }
    if (this.props.headerRow) {
      ctx.fillStyle = withAlpha(this.style.lineColor, 0.16)
      ctx.beginPath()
      ctx.roundRect(f.x, f.y, f.width, ys[1]!, 4)
      ctx.fill()
    }
    ctx.strokeStyle = this.style.lineColor
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.roundRect(f.x, f.y, f.width, f.height, 4)
    ctx.stroke()
    ctx.beginPath()
    for (let r = 1; r < rows; r++) {
      ctx.moveTo(f.x, f.y + ys[r]!)
      ctx.lineTo(f.x + f.width, f.y + ys[r]!)
    }
    for (let c = 1; c < cols; c++) {
      ctx.moveTo(f.x + xs[c]!, f.y)
      ctx.lineTo(f.x + xs[c]!, f.y + f.height)
    }
    ctx.stroke()
    ctx.font = fontOf(this.style)
    ctx.textBaseline = 'middle'
    const align = this.props.textHAlign ?? 'left'
    ctx.textAlign = align
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const text = this.props.cells[r]![c]
        if (!text) continue
        ctx.save()
        ctx.beginPath()
        ctx.rect(f.x + xs[c]! + 1, f.y + ys[r]! + 1, xs[c + 1]! - xs[c]! - 2, ys[r + 1]! - ys[r]! - 2)
        ctx.clip()
        ctx.fillStyle = this.style.textColor
        const x = align === 'left' ? f.x + xs[c]! + SAVED_PAD : align === 'right' ? f.x + xs[c + 1]! - SAVED_PAD : f.x + (xs[c]! + xs[c + 1]!) / 2
        ctx.fillText(text, x, f.y + (ys[r]! + ys[r + 1]!) / 2)
        ctx.restore()
      }
    }
    ctx.restore()
  }

  // ── Handles, lines and the pointer ──────────────────────────────────────────────────────────

  /** No anchor handle: the corners' handles stand for the table. */
  override getControlPoints(viewport: Viewport): ControlPoint[] {
    return this.props.savedLook ? super.getControlPoints(viewport) : []
  }

  /** The four corners, each a round handle that scales the table. */
  override resizeHandles(viewport: Viewport): Point[] {
    const f = this.frame(viewport)
    if (!f) return []
    return [
      { x: f.x, y: f.y },
      { x: f.x + f.width, y: f.y },
      { x: f.x + f.width, y: f.y + f.height },
      { x: f.x, y: f.y + f.height },
    ]
  }

  override gripShape(): HandleShape | null {
    return this.props.savedLook ? null : 'circle'
  }

  /** Handle indices: 0-3 corners, then column dividers, row dividers, and the four outer edges
   *  (left, right, top, bottom). */
  private edgeBase(): number {
    const rows = this.props.cells.length
    const cols = this.props.cells[0]?.length ?? 0
    return 4 + Math.max(0, cols - 1) + Math.max(0, rows - 1)
  }

  /**
   * The grid line under a point that resizes its column or row, grabbable anywhere along it (±4px):
   * an inner line, or the right or bottom edge. Returns the `resizeTo`-compatible handle index;
   * corners win first (the host checks grips before calling this).
   */
  dividerHandleIndex(point: Point, viewport: Viewport): number | null {
    const f = this.frame(viewport)
    if (!f) return null
    const { xs, ys } = this.offsets()
    const inY = point.y >= f.y - 4 && point.y <= f.y + f.height + 4
    const inX = point.x >= f.x - 4 && point.x <= f.x + f.width + 4
    if (inY) {
      for (let c = 1; c < xs.length - 1; c++) {
        if (Math.abs(point.x - (f.x + xs[c]!)) <= 4) return 4 + (c - 1)
      }
    }
    if (inX) {
      for (let r = 1; r < ys.length - 1; r++) {
        if (Math.abs(point.y - (f.y + ys[r]!)) <= 4) return 4 + (xs.length - 2) + (r - 1)
      }
    }
    const edge = this.edgeBase()
    if (inY && Math.abs(point.x - (f.x + f.width)) <= 4) return edge + 1
    if (inX && Math.abs(point.y - (f.y + f.height)) <= 4) return edge + 3
    return null
  }

  /** The grid line under the pointer that a drag would resize: the pixel it stands on, and whether
   *  it runs down a column's side or across a row's. */
  private hoveredLine(viewport: Viewport): { across: 'column' | 'row'; at: number } | null {
    const p = this.pointer
    const grid = this.gridPixels(viewport)
    if (!p || !grid) return null
    if (this.resizeHandles(viewport).some((g) => Math.hypot(g.x - p.x, g.y - p.y) <= 9)) return null
    const index = this.dividerHandleIndex(p, viewport)
    if (index === null) return null
    const cols = this.props.cells[0]?.length ?? 0
    const edge = this.edgeBase()
    if (index === edge + 1) return { across: 'column', at: grid.xs[grid.xs.length - 1]! }
    if (index === edge + 3) return { across: 'row', at: grid.ys[grid.ys.length - 1]! }
    const divider = index - 4
    return divider < cols - 1 ? { across: 'column', at: grid.xs[divider + 1]! } : { across: 'row', at: grid.ys[divider - (cols - 1) + 1]! }
  }

  /** Over the selected table: resize cursors over the corners and the lines, and typing over a
   *  cell. An unselected table takes the plain pointer. */
  protected override cursorAt(point: Point, viewport: Viewport): string | null {
    const f = this.frame(viewport)
    if (!f || this.state !== 'selected') return null
    const corners = this.resizeHandles(viewport)
    for (let i = 0; i < corners.length; i++) {
      if (Math.hypot(point.x - corners[i]!.x, point.y - corners[i]!.y) <= 9) return i % 2 === 0 ? 'nwse-resize' : 'nesw-resize'
    }
    const divider = this.dividerHandleIndex(point, viewport)
    if (divider !== null) {
      const cols = this.props.cells[0]?.length ?? 0
      const edge = this.edgeBase()
      if (divider >= edge) return divider - edge < 2 ? 'ew-resize' : 'ns-resize'
      return divider - 4 < cols - 1 ? 'ew-resize' : 'ns-resize'
    }
    return this.cellAt(point, viewport) ? 'text' : null
  }

  override resizeTo(handleIndex: number, point: Point, viewport: Viewport): void {
    const f = this.frame(viewport)
    if (!f) return
    const rows = this.props.cells.length
    const cols = this.props.cells[0]?.length ?? 0
    if (!rows || !cols) return

    if (handleIndex < 4) {
      // Corner drag: the opposite corner pins, every column scales with the width, and every row
      // with the height, no row shorter than its words.
      const pin = [
        { x: f.x + f.width, y: f.y + f.height },
        { x: f.x, y: f.y + f.height },
        { x: f.x, y: f.y },
        { x: f.x + f.width, y: f.y },
      ][handleIndex]!
      const newW = Math.max(cols * MIN_COL, Math.abs(point.x - pin.x))
      const newH = Math.max(rows * MIN_ROW, Math.abs(point.y - pin.y))
      const scaleX = newW / f.width
      const scaleY = newH / f.height
      const colWidths = Array.from({ length: cols }, (_, c) => Math.min(MAX_COL, Math.max(MIN_COL, this.colWidth(c) * scaleX)))
      const rowHeights = Array.from({ length: rows }, (_, r) => Math.min(MAX_ROW, Math.max(this.rowContent(r), this.rowHeight(r) * scaleY)))
      this.applyProps({ colWidths, rowHeights } as Partial<TableProps>)
      // Keep the pinned corner where it was: the anchor is the box's top-left.
      const { xs, ys } = this.offsets()
      const width = xs[xs.length - 1]!
      const height = ys[ys.length - 1]!
      const left = point.x < pin.x ? pin.x - width : pin.x
      const top = point.y < pin.y ? pin.y - height : pin.y
      const time = viewport.timeAt(left)
      const price = viewport.priceAt(top)
      if (time !== null && price !== null) this.updateAnchor(0, { time, price })
      return
    }

    const { xs, ys } = this.offsets()
    const edge = this.edgeBase()
    if (handleIndex >= edge) {
      const which = handleIndex - edge
      if (which === 1) {
        const colWidths = Array.from({ length: cols }, (_, c) => this.colWidth(c))
        colWidths[cols - 1] = Math.min(MAX_COL, Math.max(MIN_COL, point.x - (f.x + xs[cols - 1]!)))
        this.applyProps({ colWidths } as Partial<TableProps>)
      } else if (which === 3) {
        const rowHeights = Array.from({ length: rows }, (_, r) => this.props.rowHeights[r] ?? 0)
        rowHeights[rows - 1] = Math.min(MAX_ROW, Math.max(this.rowContent(rows - 1), point.y - (f.y + ys[rows - 1]!)))
        this.applyProps({ rowHeights } as Partial<TableProps>)
      }
      return
    }

    const divider = handleIndex - 4
    if (divider < cols - 1) {
      const colWidths = Array.from({ length: cols }, (_, c) => this.colWidth(c))
      colWidths[divider] = Math.min(MAX_COL, Math.max(MIN_COL, point.x - (f.x + xs[divider]!)))
      this.applyProps({ colWidths } as Partial<TableProps>)
      return
    }
    const rowIndex = divider - (cols - 1)
    if (rowIndex < rows - 1) {
      const rowHeights = Array.from({ length: rows }, (_, r) => this.props.rowHeights[r] ?? 0)
      rowHeights[rowIndex] = Math.min(MAX_ROW, Math.max(this.rowContent(rowIndex), point.y - (f.y + ys[rowIndex]!)))
      this.applyProps({ rowHeights } as Partial<TableProps>)
    }
  }

  testHit(point: Point, viewport: Viewport): boolean {
    const f = this.frame(viewport)
    if (!f) return false
    return point.x >= f.x - 2 && point.x <= f.x + f.width + 2 && point.y >= f.y - 2 && point.y <= f.y + f.height + 2
  }
}

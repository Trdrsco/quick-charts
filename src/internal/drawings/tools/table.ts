import type { Point, Viewport } from '../core/types'
import { Drawing } from '../core/drawing'
import { fillPaint, fontOf, withAlpha } from '../render/canvas'

export type TableProps = {
  /** Row-major cell text. The grid's shape IS this array's shape. */
  cells: string[][]
  headerRow: boolean
  /** Per-column widths / per-row heights in px; entries beyond the arrays use the defaults, so
   *  row/column appends never have to touch them. */
  colWidths: number[]
  rowHeights: number[]
}

const CELL_WIDTH = 96
const CELL_HEIGHT = 26
const CELL_PAD = 8
const MIN_COL = 28
const MAX_COL = 600
const MIN_ROW = 16
const MAX_ROW = 200

/**
 * Floating table pinned to a chart point (anchor = top-left). Corners scale the whole grid,
 * grips on the internal dividers resize single columns/rows, and the host edits cells inline
 * through `cellAt`.
 */
export class TableNote extends Drawing<TableProps> {
  readonly type = 'table'

  protected override defaultProps(): TableProps {
    return {
      cells: [
        ['', ''],
        ['', ''],
      ],
      headerRow: true,
      colWidths: [],
      rowHeights: [],
    }
  }

  requiredAnchors(): number {
    return 1
  }

  private colWidth(i: number): number {
    return Math.max(MIN_COL, this.props.colWidths[i] ?? CELL_WIDTH)
  }

  private rowHeight(r: number): number {
    return Math.max(MIN_ROW, this.props.rowHeights[r] ?? CELL_HEIGHT)
  }

  /** Left offsets per column boundary (0..cols) and top offsets per row boundary (0..rows). */
  private offsets(): { xs: number[]; ys: number[] } {
    const rows = this.props.cells.length
    const cols = this.props.cells[0]?.length ?? 0
    const xs = [0]
    for (let c = 0; c < cols; c++) xs.push(xs[c] + this.colWidth(c))
    const ys = [0]
    for (let r = 0; r < rows; r++) ys.push(ys[r] + this.rowHeight(r))
    return { xs, ys }
  }

  protected frame(viewport: Viewport): { x: number; y: number; width: number; height: number } | null {
    const anchor = this.anchors[0]
    if (!anchor) return null
    const p = this.anchorToPixel(anchor, viewport)
    if (!p) return null
    const { xs, ys } = this.offsets()
    if (xs.length < 2 || ys.length < 2) return null
    return { x: p.x, y: p.y, width: xs[xs.length - 1], height: ys[ys.length - 1] }
  }

  /** The cell under a pane point, with its rect — the host's inline editor opens there. */
  cellAt(point: Point, viewport: Viewport): { row: number; col: number; rect: { x: number; y: number; width: number; height: number } } | null {
    const f = this.frame(viewport)
    if (!f) return null
    const { xs, ys } = this.offsets()
    const dx = point.x - f.x
    const dy = point.y - f.y
    if (dx < 0 || dy < 0 || dx > f.width || dy > f.height) return null
    let col = 0
    while (col < xs.length - 2 && dx >= xs[col + 1]) col++
    let row = 0
    while (row < ys.length - 2 && dy >= ys[row + 1]) row++
    return {
      row,
      col,
      rect: { x: f.x + xs[col], y: f.y + ys[row], width: xs[col + 1] - xs[col], height: ys[row + 1] - ys[row] },
    }
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const f = this.frame(viewport)
    if (!f) return
    const rows = this.props.cells.length
    const cols = this.props.cells[0]?.length ?? 0
    const { xs, ys } = this.offsets()
    ctx.save()
    ctx.setLineDash([])
    // Card base + optional header band — the base paints from the background channel.
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
      ctx.roundRect(f.x, f.y, f.width, ys[1], 4)
      ctx.fill()
    }
    // Grid lines.
    ctx.strokeStyle = withAlpha(this.style.lineColor, 0.45)
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.roundRect(f.x, f.y, f.width, f.height, 4)
    ctx.stroke()
    ctx.beginPath()
    for (let r = 1; r < rows; r++) {
      ctx.moveTo(f.x, f.y + ys[r])
      ctx.lineTo(f.x + f.width, f.y + ys[r])
    }
    for (let c = 1; c < cols; c++) {
      ctx.moveTo(f.x + xs[c], f.y)
      ctx.lineTo(f.x + xs[c], f.y + f.height)
    }
    ctx.stroke()
    // Cell text, clipped per cell.
    ctx.font = fontOf(this.style)
    ctx.textBaseline = 'middle'
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const text = this.props.cells[r][c]
        if (!text) continue
        ctx.save()
        ctx.beginPath()
        ctx.rect(f.x + xs[c] + 1, f.y + ys[r] + 1, xs[c + 1] - xs[c] - 2, ys[r + 1] - ys[r] - 2)
        ctx.clip()
        ctx.fillStyle = this.style.textColor
        ctx.fillText(text, f.x + xs[c] + CELL_PAD, f.y + (ys[r] + ys[r + 1]) / 2)
        ctx.restore()
      }
    }
    ctx.restore()
  }

  /** Corner grips only — the internal dividers drag as LINES (see `dividerHandleIndex`), so no
   *  stray squares float mid-table. */
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

  /** Handle indices: 0-3 corners, then column dividers, row dividers, and the four outer edges
   *  (left, right, top, bottom). */
  private edgeBase(): number {
    const rows = this.props.cells.length
    const cols = this.props.cells[0]?.length ?? 0
    return 4 + Math.max(0, cols - 1) + Math.max(0, rows - 1)
  }

  /**
   * The divider or outer edge under a point — grabbable ANYWHERE along the line (±4px). Returns
   * the `resizeTo`-compatible handle index; corners win first (the host checks grips before
   * calling this).
   */
  dividerHandleIndex(point: Point, viewport: Viewport): number | null {
    const f = this.frame(viewport)
    if (!f) return null
    const { xs, ys } = this.offsets()
    const inY = point.y >= f.y - 4 && point.y <= f.y + f.height + 4
    const inX = point.x >= f.x - 4 && point.x <= f.x + f.width + 4
    if (inY) {
      for (let c = 1; c < xs.length - 1; c++) {
        if (Math.abs(point.x - (f.x + xs[c])) <= 4) return 4 + (c - 1)
      }
    }
    if (inX) {
      for (let r = 1; r < ys.length - 1; r++) {
        if (Math.abs(point.y - (f.y + ys[r])) <= 4) return 4 + (xs.length - 2) + (r - 1)
      }
    }
    const edge = this.edgeBase()
    if (inY && Math.abs(point.x - f.x) <= 4) return edge
    if (inY && Math.abs(point.x - (f.x + f.width)) <= 4) return edge + 1
    if (inX && Math.abs(point.y - f.y) <= 4) return edge + 2
    if (inX && Math.abs(point.y - (f.y + f.height)) <= 4) return edge + 3
    return null
  }

  /** Hover feedback: resize cursors over the corners and divider lines. */
  protected override cursorAt(point: Point, viewport: Viewport): string | null {
    const f = this.frame(viewport)
    if (!f) return null
    const corners = this.resizeHandles(viewport)
    for (let i = 0; i < corners.length; i++) {
      if (Math.hypot(point.x - corners[i].x, point.y - corners[i].y) <= 8) {
        return i % 2 === 0 ? 'nwse-resize' : 'nesw-resize'
      }
    }
    const divider = this.dividerHandleIndex(point, viewport)
    if (divider === null) return null
    const cols = this.props.cells[0]?.length ?? 0
    const edge = this.edgeBase()
    if (divider >= edge) return divider - edge < 2 ? 'col-resize' : 'row-resize'
    return divider - 4 < cols - 1 ? 'col-resize' : 'row-resize'
  }

  override resizeTo(handleIndex: number, point: Point, viewport: Viewport): void {
    const f = this.frame(viewport)
    if (!f) return
    const rows = this.props.cells.length
    const cols = this.props.cells[0]?.length ?? 0
    if (!rows || !cols) return

    if (handleIndex < 4) {
      // Corner drag: the opposite corner pins, every column/row scales proportionally.
      const pin = [
        { x: f.x + f.width, y: f.y + f.height },
        { x: f.x, y: f.y + f.height },
        { x: f.x, y: f.y },
        { x: f.x + f.width, y: f.y },
      ][handleIndex]
      const newW = Math.max(cols * MIN_COL, Math.abs(point.x - pin.x))
      const newH = Math.max(rows * MIN_ROW, Math.abs(point.y - pin.y))
      const scaleX = newW / f.width
      const scaleY = newH / f.height
      const colWidths = Array.from({ length: cols }, (_, c) => Math.min(MAX_COL, Math.max(MIN_COL, this.colWidth(c) * scaleX)))
      const rowHeights = Array.from({ length: rows }, (_, r) => Math.min(MAX_ROW, Math.max(MIN_ROW, this.rowHeight(r) * scaleY)))
      this.applyProps({ colWidths, rowHeights } as Partial<TableProps>)
      // Keep the pinned corner where it was: the anchor is the box's top-left.
      const left = Math.min(pin.x, point.x)
      const top = Math.min(pin.y, point.y)
      const time = viewport.timeAt(left)
      const price = viewport.priceAt(top)
      if (time !== null && price !== null) this.updateAnchor(0, { time, price })
      return
    }

    const { xs, ys } = this.offsets()
    const edge = this.edgeBase()
    if (handleIndex >= edge) {
      const which = handleIndex - edge
      const colWidths = Array.from({ length: cols }, (_, c) => this.colWidth(c))
      const rowHeights = Array.from({ length: rows }, (_, r) => this.rowHeight(r))
      if (which === 0) {
        // Left edge: the first column grows toward the pointer, the right side stays pinned.
        colWidths[0] = Math.min(MAX_COL, Math.max(MIN_COL, f.x + xs[1] - point.x))
        this.applyProps({ colWidths } as Partial<TableProps>)
        const time = viewport.timeAt(f.x + xs[1] - colWidths[0])
        const price = viewport.priceAt(f.y)
        if (time !== null && price !== null) this.updateAnchor(0, { time, price })
      } else if (which === 1) {
        colWidths[cols - 1] = Math.min(MAX_COL, Math.max(MIN_COL, point.x - (f.x + xs[cols - 1])))
        this.applyProps({ colWidths } as Partial<TableProps>)
      } else if (which === 2) {
        // Top edge: the first row grows toward the pointer, the bottom stays pinned.
        rowHeights[0] = Math.min(MAX_ROW, Math.max(MIN_ROW, f.y + ys[1] - point.y))
        this.applyProps({ rowHeights } as Partial<TableProps>)
        const time = viewport.timeAt(f.x)
        const price = viewport.priceAt(f.y + ys[1] - rowHeights[0])
        if (time !== null && price !== null) this.updateAnchor(0, { time, price })
      } else {
        rowHeights[rows - 1] = Math.min(MAX_ROW, Math.max(MIN_ROW, point.y - (f.y + ys[rows - 1])))
        this.applyProps({ rowHeights } as Partial<TableProps>)
      }
      return
    }

    const divider = handleIndex - 4
    if (divider < cols - 1) {
      const colWidths = Array.from({ length: cols }, (_, c) => this.colWidth(c))
      colWidths[divider] = Math.min(MAX_COL, Math.max(MIN_COL, point.x - (f.x + xs[divider])))
      this.applyProps({ colWidths } as Partial<TableProps>)
      return
    }
    const rowIndex = divider - (cols - 1)
    if (rowIndex < rows - 1) {
      const rowHeights = Array.from({ length: rows }, (_, r) => this.rowHeight(r))
      rowHeights[rowIndex] = Math.min(MAX_ROW, Math.max(MIN_ROW, point.y - (f.y + ys[rowIndex])))
      this.applyProps({ rowHeights } as Partial<TableProps>)
    }
  }

  testHit(point: Point, viewport: Viewport): boolean {
    const f = this.frame(viewport)
    if (!f) return false
    return point.x >= f.x - 2 && point.x <= f.x + f.width + 2 && point.y >= f.y - 2 && point.y <= f.y + f.height + 2
  }
}

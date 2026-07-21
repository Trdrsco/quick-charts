import type { Point, Viewport } from '../core/types'
import { Drawing } from '../core/drawing'
import { fontOf, withAlpha } from '../render/canvas'

export type TableProps = {
  /** Row-major cell text. The grid's shape IS this array's shape. */
  cells: string[][]
  headerRow: boolean
}

const CELL_WIDTH = 96
const CELL_HEIGHT = 26
const CELL_PAD = 8

/** Floating table pinned to a chart point (anchor = top-left). Cells edit in the settings modal. */
export class TableNote extends Drawing<TableProps> {
  readonly type = 'table'

  protected override defaultProps(): TableProps {
    return {
      cells: [
        ['', ''],
        ['', ''],
      ],
      headerRow: true,
    }
  }

  requiredAnchors(): number {
    return 1
  }

  protected frame(viewport: Viewport): { x: number; y: number; width: number; height: number } | null {
    const anchor = this.anchors[0]
    if (!anchor) return null
    const p = this.anchorToPixel(anchor, viewport)
    if (!p) return null
    const rows = this.props.cells.length
    const cols = this.props.cells[0]?.length ?? 0
    if (!rows || !cols) return null
    return { x: p.x, y: p.y, width: cols * CELL_WIDTH, height: rows * CELL_HEIGHT }
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const f = this.frame(viewport)
    if (!f) return
    const rows = this.props.cells.length
    const cols = this.props.cells[0]?.length ?? 0
    ctx.save()
    ctx.setLineDash([])
    // Card base + optional header band.
    ctx.fillStyle = withAlpha('#1b1f27', 0.95)
    ctx.beginPath()
    ctx.roundRect(f.x, f.y, f.width, f.height, 4)
    ctx.fill()
    if (this.props.headerRow) {
      ctx.fillStyle = withAlpha(this.style.lineColor, 0.16)
      ctx.beginPath()
      ctx.roundRect(f.x, f.y, f.width, CELL_HEIGHT, 4)
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
      ctx.moveTo(f.x, f.y + r * CELL_HEIGHT)
      ctx.lineTo(f.x + f.width, f.y + r * CELL_HEIGHT)
    }
    for (let c = 1; c < cols; c++) {
      ctx.moveTo(f.x + c * CELL_WIDTH, f.y)
      ctx.lineTo(f.x + c * CELL_WIDTH, f.y + f.height)
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
        ctx.rect(f.x + c * CELL_WIDTH + 1, f.y + r * CELL_HEIGHT + 1, CELL_WIDTH - 2, CELL_HEIGHT - 2)
        ctx.clip()
        ctx.fillStyle = this.style.textColor
        ctx.fillText(text, f.x + c * CELL_WIDTH + CELL_PAD, f.y + r * CELL_HEIGHT + CELL_HEIGHT / 2)
        ctx.restore()
      }
    }
    ctx.restore()
  }

  testHit(point: Point, viewport: Viewport): boolean {
    const f = this.frame(viewport)
    if (!f) return false
    return point.x >= f.x - 2 && point.x <= f.x + f.width + 2 && point.y >= f.y - 2 && point.y <= f.y + f.height + 2
  }
}

import type { IPrimitivePaneRenderer, IPrimitivePaneView, PrimitivePaneViewZOrder } from 'lightweight-charts'
import type { CanvasRenderingTarget2D } from 'fancy-canvas'

import type { AnyDrawing } from '../core/drawing'
import { hoveredIndex, paintHandles, paintResizeGrips } from './canvas'

/** How near a mouse stands a handle out, and a grip: as near as a press grabs each. */
const HANDLE_REACH = 11
const GRIP_REACH = 9

/**
 * The one pane view every drawing uses. It owns the canvas plumbing (coordinate space,
 * visibility, selection handles) so tool classes only implement `paint` in CSS pixels.
 */
export class DrawingPaneView implements IPrimitivePaneView, IPrimitivePaneRenderer {
  private readonly _drawing: AnyDrawing

  constructor(drawing: AnyDrawing) {
    this._drawing = drawing
  }

  zOrder(): PrimitivePaneViewZOrder {
    return 'normal'
  }

  renderer(): IPrimitivePaneRenderer {
    return this
  }

  draw(target: CanvasRenderingTarget2D): void {
    const drawing = this._drawing
    if (!drawing.isVisibleNow()) return
    const viewport = drawing.getViewport()
    if (!viewport) return

    target.useMediaCoordinateSpace(({ context: ctx }) => {
      ctx.save()
      try {
        if (drawing.isValid()) {
          drawing.paint(ctx, viewport)
        } else {
          drawing.paintConstruction(ctx, viewport)
        }
        const state = drawing.state
        const inks = drawing.inks()
        const handleInks = { ring: inks.handleRing, center: inks.handleCenter }
        if (state === 'selected' || state === 'editing') {
          // The invitation to type stands under the handles, so a handle on it stays whole.
          if (drawing.isValid()) drawing.paintTextHint(ctx, viewport)
          const points = drawing.getControlPoints(viewport)
          if (points.length > 0) paintHandles(ctx, points, handleInks, drawing.handleShape(), hoveredIndex(points, drawing.pointer, HANDLE_REACH))
          const grips = drawing.resizeHandles(viewport)
          const gripShape = drawing.gripShape()
          if (grips.length > 0 && gripShape) paintHandles(ctx, grips, handleInks, gripShape, hoveredIndex(grips, drawing.pointer, GRIP_REACH))
          else if (grips.length > 0) paintResizeGrips(ctx, grips, drawing.style.lineColor)
        } else if (drawing.hovered && drawing.handlesOnHover() && drawing.isValid()) {
          // A drawing that shows its handles under the pointer shows them thin until it is selected.
          const points = drawing.getControlPoints(viewport)
          if (points.length > 0) paintHandles(ctx, points, handleInks, drawing.handleShape(), null, 'thin')
        }
      } finally {
        ctx.restore()
      }
    })
    // An editor laid over the words follows them wherever this paint stood them.
    drawing.noteTextFrame(viewport)
  }
}

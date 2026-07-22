import type { IPrimitivePaneRenderer, IPrimitivePaneView, PrimitivePaneViewZOrder } from 'lightweight-charts'
import type { CanvasRenderingTarget2D } from 'fancy-canvas'

import type { AnyDrawing } from '../core/drawing'
import { paintHandles, paintResizeGrips } from './canvas'

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
        if (state === 'selected' || state === 'editing') {
          const points = drawing.getControlPoints(viewport)
          if (points.length > 0) paintHandles(ctx, points, drawing.style.lineColor)
          const grips = drawing.resizeHandles(viewport)
          if (grips.length > 0) paintResizeGrips(ctx, grips, drawing.style.lineColor)
          if (drawing.isValid()) drawing.paintTextHint(ctx, viewport)
        }
      } finally {
        ctx.restore()
      }
    })
  }
}

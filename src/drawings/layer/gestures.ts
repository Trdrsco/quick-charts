// The pointer and keyboard grammar of the drawing layer: placing every kind of tool, moving,
// resizing and selecting drawings, the two transient tools, and the keys.
//
// PLACEMENT follows the tool's declared shape. A fixed tool collects exactly its anchor count by
// press-drag-release or click then click; an instant tool lands whole from one press; a multipoint
// tool adds a point per click until a double-click ends the run; a freehand tool captures the drag
// as a stroke. A text-bearing tool opens the inline editor the moment it lands, and Shift holds a
// two-point placement or an anchor drag to 45 degree rays. The magnet pulls every placed or
// dragged anchor unless Shift owns the gesture, and never pulls a freehand stroke.
//
// MEASURE and ZOOM arm like tools and keep nothing: their two-anchor shape is a transient drawing
// that the next gesture clears, and the zoom box becomes the visible range. The ERASER removes
// whatever it presses and stays armed.
//
// The handlers close over one context the attach module builds, so the state they share (the
// draft, the drag, the armed tool) has one owner.
import type { IChartApi, ISeriesApi, SeriesType, Time } from 'lightweight-charts'
import { magnetSnap, toolRegistry, viewportOf, type Anchor, type IDrawing, type Viewport } from '../../internal/drawings/index'
import { drawingTools, type DrawingTool } from '../tools'
import { editRefused } from '../lockModel'
import { toolAfterPlacement } from '../cursorModel'
import { stampNewScope } from './scope'
import { inlineTextRules, settingsOnDoubleClick } from './inlineText'
import { constrain45, instantPositionAnchors, barsShifted, type Px } from './geometry'
import type { DrawingsWorkflow } from './types'
import { presetPropsFor, type PresetCache } from './presets'

/** Pixels of pointer travel that turn the opening press into a drag (vs a click then click). */
const PLACE_DRAG_PX = 6
/** Pixels of travel before a grab counts as a move (an unmoved grab mutates nothing). */
const MOVE_EPSILON_PX = 2
/** Grab radius around an anchor handle: generous, independent of the small visual dot. */
const HANDLE_GRAB_PX = 11
/** Grab radius around a scale grip (an image corner). */
const GRIP_GRAB_PX = 9

// A FINGER IS NOT A POINTER TIP. A touch covers a pad of skin, wobbles as it lands and lifts, and
// hides the point it presses, so a touch press reads the chart more generously than a mouse does:
// it takes a drawing it lands near rather than on, grabs a handle from a thumb's width away, lets a
// tap wobble without turning into a drag, moves a drawing only once the finger has clearly set off,
// and shows the point it places or drags through the crosshair, whose lines and scale labels stand
// clear of the finger. A mouse and a pen keep the exact values above.

/** Pixels around a touch that still take a drawing the touch did not land on. */
const TOUCH_REACH_PX = 14
/** Grab radius around an anchor handle or a grip, for a touch. */
const TOUCH_GRAB_PX = 22
/** Pixels of travel that turn an opening touch into a drag. */
const TOUCH_PLACE_DRAG_PX = 12
/** Pixels of travel before a touch on a drawing moves it. */
const TOUCH_MOVE_PX = 6
/** A freehand stroke keeps a point every this many pixels of travel. */
const STROKE_STEP_PX = 3

export interface Draft {
  drawing: IDrawing
  required: number
  placed: number
  downX: number
  downY: number
  /** The opening press is still undecided: release-in-place = click then click, travel = drag. */
  pendingDrag: boolean
  hasText: boolean
  mode: 'fixed' | 'freehand' | 'multipoint'
  lastX: number
  lastY: number
}

export interface Drag {
  mode: 'move' | 'anchor' | 'resize'
  drawing: IDrawing
  anchorIndex: number | null
  grabX: number
  grabY: number
  origPixels: (Px | null)[]
  /** Anchor bar indices at grab: a move translates every anchor by the SAME whole-bar count, so
   *  handles never wobble apart on independent per-anchor time rounding. */
  origLogicals: (number | null)[]
  moved: boolean
  /** A Control- or Command-drag duplicate: the drag moves a fresh copy, and an unmoved release
   *  discards it. */
  cloned?: boolean
  /** The grabbed drawing was already the selection when the press began. */
  selectedBefore?: boolean
  /** The anchors a move carries, where the drawing moves only some of them for a grab there (a
   *  note's label); absent, it carries them all. */
  only?: readonly number[]
}

/** What the gestures read and write. The attach module owns every field. */
export interface GestureContext {
  chart: IChartApi
  series: ISeriesApi<SeriesType>
  container: HTMLElement
  manager: {
    add(drawing: IDrawing): void
    remove(id: string): void
    get(id: string): IDrawing | undefined
    select(id: string): void
    deselect(): void
    selected(): IDrawing | null
    hitTest(point: Px): IDrawing | null
  }
  presets: PresetCache
  workflow(): DrawingsWorkflow
  chartId: string | undefined
  nextId(): string
  /** The armed tool, and the props seeding the next placement. */
  armed(): string | null
  presetProps(): Record<string, unknown> | null
  setArmed(type: string | null): void
  /** Whether editing is suspended across the layer (either lock-all door). */
  locked(): boolean
  draft: Draft | null
  drag: Drag | null
  transient: Set<string>
  textEditOpen(): boolean
  /** Open the inline editor on a drawing's text, deferred past the gesture: as part of placing the
   *  drawing, from a click on it, or from a command. */
  openTextEdit(drawing: IDrawing, x: number, y: number, fresh: boolean, how?: 'placement' | 'click' | 'command'): void
  openCellEdit(drawing: IDrawing, cell: { row: number; col: number; rect: { x: number; y: number; width: number; height: number } }): void
  /** End the open or opening text edit, keeping what an inline edit typed. */
  endTextEdit(): void
  /** Ask for the selected drawing's settings. */
  openSettings(): void
  /** The gestures hear here that the armed tool changed; they set it as they bind. */
  toolChanged?: () => void
  setHovered(id: string | null): void
  persist(): void
  changed(): void
  clearTransients(): void
  /** The tool's own cursor over the chart, from the cursor mode. */
  cursorCss(): string
  /** Freeze or release the chart's own navigation and the container's touch action together. */
  lockPointer(locked: boolean): void
  /** Whether a new drawing may be made as a copy of one of this type. */
  copies(type: string): boolean
}

const isTransientArmed = (tool: string | null): tool is 'measure' | 'zoom' | 'eraser' => tool === 'measure' || tool === 'zoom' || tool === 'eraser'

export function bindGestures(ctx: GestureContext): () => void {
  const { chart, series, container, manager } = ctx

  const viewport = (): Viewport | null => viewportOf(chart, series)

  const localXY = (e: { clientX: number; clientY: number }): Px => {
    const rect = container.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  /** The cursor this layer last wrote on the box. Another surface on the same box (a trade line's
   *  control under the pointer) writes its own, and that claim stands: the layer restates its
   *  cursor only over a box that is bare or still wearing the layer's own. */
  let ownCursor = ''
  const wearCursor = (css: string): void => {
    const current = container.style.cursor
    if (current !== '' && current !== ownCursor) return
    if (current !== css) container.style.cursor = css
    ownCursor = css
  }

  /** The raw anchor under a pane point. The viewport's time mapping extrapolates into empty future
   *  space, which is where a ghost feed lives. */
  const anchorAt = (p: Px): Anchor | null => {
    const vp = viewport()
    if (!vp) return null
    const price = vp.priceAt(p.y)
    const time = vp.timeAt(p.x)
    if (price == null || time == null) return null
    return { time, price }
  }

  /** The magnet-aware anchor for placement and anchor drags. A snapped anchor is the bar's own
   *  OHLC value, exact rather than whatever price the pixel landed on; weak answers null when
   *  nothing is near enough and the raw point stands. Shift suspends the magnet: the angle
   *  constraint owns the gesture. */
  const snappedAnchorAt = (p: Px, shift: boolean): Anchor | null => {
    const raw = anchorAt(p)
    if (!raw || shift) return raw
    const mode = ctx.workflow().magnet
    if (mode === 'off') return raw
    return magnetSnap(chart, series, p, mode) ?? raw
  }

  /** Whether the gesture under way is a finger's. */
  let touching = false

  /** The drawing a press at `p` takes: the one under it, or for a touch the nearest one within the
   *  finger's reach, read ring by ring outward. */
  const hitAt = (p: Px): IDrawing | null => {
    const under = manager.hitTest(p)
    if (under || !touching) return under
    for (const radius of [TOUCH_REACH_PX / 2, TOUCH_REACH_PX]) {
      for (let k = 0; k < 8; k++) {
        const angle = (k * Math.PI) / 4
        const near = manager.hitTest({ x: p.x + radius * Math.cos(angle), y: p.y + radius * Math.sin(angle) })
        if (near) return near
      }
    }
    return null
  }

  /** The crosshair stands on the point a finger places or drags, its lines and scale labels clear
   *  of the finger that hides the point itself. A mouse needs no help to see its own pointer. */
  const showPoint = (anchor: Anchor | null): void => {
    if (!touching || !anchor) return
    try {
      chart.setCrosshairPosition(anchor.price, anchor.time as Time, series)
    } catch {
      /* a point off the series' data */
    }
  }
  const hidePoint = (): void => {
    if (!touching) return
    try {
      chart.clearCrosshairPosition()
    } catch {
      /* no crosshair to clear */
    }
  }

  /** Nearest anchor handle of a drawing within the grab radius. */
  const anchorHit = (drawing: IDrawing, p: Px): number | null => {
    const vp = viewport()
    if (!vp) return null
    let best: number | null = null
    let bestD = touching ? TOUCH_GRAB_PX : HANDLE_GRAB_PX
    for (const cp of drawing.getControlPoints(vp)) {
      const d = Math.hypot(cp.x - p.x, cp.y - p.y)
      if (d <= bestD) {
        bestD = d
        best = cp.index
      }
    }
    return best
  }

  const freezePan = (frozen: boolean): void => ctx.lockPointer(frozen)

  const startDrag = (mode: Drag['mode'], drawing: IDrawing, anchorIndex: number | null, p: Px): void => {
    const vp = viewport()
    if (!vp) return
    ctx.drag = {
      mode,
      drawing,
      anchorIndex,
      grabX: p.x,
      grabY: p.y,
      origPixels: drawing.anchors.map((a) => drawing.anchorToPixel(a, vp)),
      origLogicals: drawing.anchors.map((a) => vp.logicalOf(a.time)),
      moved: false,
    }
    freezePan(true)
  }

  /** A new drawing of a tool under the remembered default and the seeded props, bound to this
   *  chart when sync is off. */
  const create = (tool: DrawingTool, anchors: Anchor[]): IDrawing | null => {
    const preset = ctx.presets.defaultFor(tool.type)
    const drawing = drawingTools.create(tool.type, ctx.nextId(), anchors, preset.style)
    if (!drawing) return null
    if (preset.props) drawing.applyProps(presetPropsFor(drawing, preset.props))
    const seeded = ctx.presetProps()
    if (seeded) drawing.applyProps(seeded)
    stampNewScope(drawing, ctx.chartId, ctx.workflow().syncAcrossPanes)
    return drawing
  }

  /** A placement finished. Freehand tools keep drawing successive strokes; other permanent
   *  tools follow Stay in drawing mode. The model owns the rule. */
  const finalize = (): void => {
    ctx.draft = null
    ctx.setArmed(toolAfterPlacement(ctx.armed(), ctx.workflow().stayInDrawingMode))
  }

  const completePlacement = (draft: Draft, at: Px): void => {
    // Bar-capturing tools snapshot their range the moment placement completes, before persisting.
    if (drawingTools.get(draft.drawing.type)?.capturesBars) (draft.drawing as unknown as { capture?: () => void }).capture?.()
    finalize()
    manager.select(draft.drawing.id)
    // The edit opens before the persist, so a drawing that is nothing until it holds words is not
    // written while it holds none.
    if (draft.hasText) ctx.openTextEdit(draft.drawing, at.x, at.y, true, 'placement')
    ctx.persist()
    if (!draft.hasText) ctx.changed()
  }

  const addTransient = (type: string, anchors: Anchor[], style?: Parameters<typeof drawingTools.create>[3]): IDrawing | null => {
    const drawing = drawingTools.create(type, ctx.nextId(), anchors, style)
    if (!drawing) return null
    ctx.transient.add(drawing.id)
    manager.add(drawing)
    return drawing
  }

  /** Measure and zoom completion, shared by drag-release and the second click.
   *
   *  Both tools run ONCE: the action completes here and the tool releases with it, whatever Stay in
   *  Drawing Mode says, because the viewer asked to measure this rather than to keep measuring.
   *  Releasing hands the chart its own pan and zoom back, so the next drag navigates. The measure
   *  readout stays on screen until that next gesture clears it; the zoom box becomes the range. */
  const completeTransient = (draft: Draft, tool: 'measure' | 'zoom', at: Px): void => {
    ctx.draft = null
    ctx.setArmed(null)
    if (tool !== 'zoom') return
    const [a, b] = draft.drawing.anchors
    ctx.clearTransients()
    if (!a || !b || Math.abs(at.x - draft.downX) <= 5) return
    const from = Math.min(Number(a.time), Number(b.time))
    const to = Math.max(Number(a.time), Number(b.time))
    if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) return
    try {
      chart.timeScale().setVisibleRange({ from: from as Time, to: to as Time })
    } catch {
      /* range outside data */
    }
  }

  /** A right-click that took back a half-placed drawing keeps the chart's menu shut for its own
   *  menu event, and for no later one. */
  let menuShut: ((e: Event) => void) | null = null
  const reopenMenu = (): void => {
    if (menuShut) container.removeEventListener('contextmenu', menuShut, true)
    menuShut = null
  }

  /** The drawing a click would place, under the pointer while a tool that previews is armed: a
   *  transient drawing, never the viewer's. */
  let preview: IDrawing | null = null
  const dropPreview = (): void => {
    if (!preview) return
    ctx.transient.delete(preview.id)
    manager.remove(preview.id)
    preview = null
  }
  const followPreview = (p: Px): void => {
    const tool = ctx.armed()
    if (!tool || ctx.draft || ctx.drag || ctx.locked() || !toolRegistry.get(tool)?.previewed) {
      dropPreview()
      return
    }
    const anchor = snappedAnchorAt(p, false)
    if (!anchor) return
    // A preview of another tool, or one a cleared screen took away, makes room for a new one.
    if (preview && (preview.type !== tool || !manager.get(preview.id))) dropPreview()
    if (preview) {
      preview.updateAnchor(0, anchor)
      return
    }
    const def = drawingTools.get(tool)
    const drawing = def ? create(def, [anchor]) : null
    if (!drawing) return
    preview = drawing
    ctx.transient.add(drawing.id)
    manager.add(drawing)
  }
  ctx.toolChanged = dropPreview

  const onDown = (e: PointerEvent): void => {
    reopenMenu()
    dropPreview()
    // A right-click while a drawing is half placed takes it back and puts the tool down.
    if (e.button === 2 && ctx.draft) {
      manager.remove(ctx.draft.drawing.id)
      ctx.draft = null
      ctx.clearTransients()
      ctx.setArmed(null)
      menuShut = (menu: Event) => {
        menu.preventDefault()
        menu.stopPropagation()
        reopenMenu()
      }
      container.addEventListener('contextmenu', menuShut, true)
      return
    }
    if (e.button !== 0) return
    touching = e.pointerType === 'touch'
    // A press while the inline editor is open belongs to the editor, which commits itself on it.
    if (ctx.textEditOpen()) return
    wearCursor(ctx.cursorCss())
    container.focus({ preventScroll: true })
    const p = localXY(e)
    const tool = ctx.armed()

    // A lingering measure readout or zoom box clears on the next gesture, unless that gesture IS
    // a fresh measure or zoom press, which replaces it below.
    if (!ctx.draft && ctx.transient.size && tool !== 'measure' && tool !== 'zoom') ctx.clearTransients()

    if (tool === 'eraser') {
      if (ctx.locked()) return
      const hit = hitAt(p)
      if (hit && !editRefused('erase', hit.options, false)) {
        manager.remove(hit.id)
        ctx.persist()
        ctx.changed()
      }
      return // stays armed; Escape or the cursor button releases it
    }

    if (tool === 'measure' || tool === 'zoom') {
      if (ctx.draft) {
        const end = anchorAt(p)
        if (end) ctx.draft.drawing.updateAnchor(1, end)
        completeTransient(ctx.draft, tool, p)
        return
      }
      ctx.clearTransients()
      const anchor = anchorAt(p)
      if (!anchor) return
      const drawing =
        tool === 'measure'
          ? addTransient('measure', [{ ...anchor }, { ...anchor }])
          : addTransient('rectangle', [{ ...anchor }, { ...anchor }], { lineStyle: 'dashed', fillOpacity: 0.06 })
      if (!drawing) return
      ctx.draft = { drawing, required: 2, placed: 1, downX: p.x, downY: p.y, pendingDrag: true, hasText: false, mode: 'fixed', lastX: p.x, lastY: p.y }
      return
    }

    // ---- Cursor: select, move, resize ----
    if (!tool) {
      // Lock-all suspends the whole layer and clears any selection, so the settings surfaces
      // cannot offer an edit that would be refused.
      if (ctx.locked()) {
        manager.deselect()
        return
      }
      const sel = manager.selected()
      if (sel && !editRefused('resize', sel.options, false)) {
        // The "add text" hint above the selection becomes the editor in place.
        if (sel.hitTextHint(p)) {
          const hint = sel.textHintAnchor()
          ctx.openTextEdit(sel, hint?.x ?? p.x, hint?.y ?? p.y, false)
          return
        }
        const vp = viewport()
        if (vp) {
          // Scale grips (an image's corners) take precedence over anchor handles.
          const gripReach = touching ? TOUCH_GRAB_PX : GRIP_GRAB_PX
          const grip = sel.resizeHandles(vp).findIndex((g) => Math.hypot(g.x - p.x, g.y - p.y) <= gripReach)
          if (grip !== -1) {
            startDrag('resize', sel, grip, p)
            return
          }
          // A table's dividers drag as lines, grabbable anywhere along the boundary.
          const table = sel as IDrawing & { dividerHandleIndex?: (point: Px, viewport: Viewport) => number | null }
          const divider = table.dividerHandleIndex?.(p, vp)
          if (divider != null) {
            startDrag('resize', sel, divider, p)
            return
          }
        }
        const ai = anchorHit(sel, p)
        if (ai !== null) {
          startDrag('anchor', sel, ai, p)
          return
        }
      }
      const hit = hitAt(p)
      if (hit) {
        // A Control- or Command-drag duplicates: the gesture grabs a fresh copy and moves that. A
        // drawing whose tool may not be copied is moved itself, as a plain drag moves it.
        if ((e.ctrlKey || e.metaKey) && !editRefused('cloneDrag', hit.options, false) && ctx.copies(hit.type)) {
          const copy = drawingTools.restore({ ...hit.toJSON(), id: ctx.nextId() })
          if (copy) {
            // The copy is a NEW drawing, so it takes the ownership a new drawing takes; the source
            // keeps the one it already had.
            stampNewScope(copy, ctx.chartId, ctx.workflow().syncAcrossPanes)
            manager.add(copy)
            manager.select(copy.id)
            startDrag('move', copy, null, p)
            if (ctx.drag) ctx.drag.cloned = true
            return
          }
        }
        // Selecting a locked drawing is allowed, so it can be inspected and unlocked.
        const selectedBefore = sel?.id === hit.id
        if (!selectedBefore) manager.select(hit.id)
        if (!editRefused('move', hit.options, false)) startDrag('move', hit, null, p)
        if (ctx.drag) {
          ctx.drag.selectedBefore = selectedBefore
          // A drawing may move only some of its anchors for a grab where it is pressed.
          const vp = viewport()
          const only = vp ? hit.grabbedAnchors(p, vp) : null
          if (only) ctx.drag.only = only
        }
        return
      }
      manager.deselect()
      return
    }

    // ---- Armed tool: place ----
    if (ctx.draft) {
      // Mid-placement the matching release advances the anchor. A finger that lifted between its
      // taps left nothing for the preview to follow, so the next touch brings the live point to
      // where it lands at once.
      if (touching) followDraft(ctx.draft, p, e.shiftKey)
      return
    }
    if (ctx.locked()) return
    const def = drawingTools.get(tool)
    if (!def) return
    const anchor = snappedAnchorAt(p, e.shiftKey)
    if (!anchor) return
    const required = Math.max(1, def.anchors || 1)
    const mode = def.placement === 'instant' ? 'instant' : (def.placement ?? 'fixed')

    if (mode === 'instant') {
      const vp = viewport()
      if (!vp) return
      const anchors = instantPositionAnchors(anchor, p, { width: vp.width, height: vp.height }, vp, tool === 'short_position')
      if (!anchors) return
      const placed = create(def, anchors)
      if (!placed) {
        finalize()
        return
      }
      manager.add(placed)
      finalize()
      manager.select(placed.id) // a fresh drawing lands selected, so the settings bar follows it
      ctx.persist()
      ctx.changed()
      return
    }

    // Placement grows the anchor set: one point plus a live preview that tracks the pointer. The
    // finished geometry appears once every point exists, so a fib projection never bleeds levels
    // mid-placement.
    const initial = mode === 'freehand' || required === 1 ? [{ ...anchor }] : [{ ...anchor }, { ...anchor }]
    const drawing = create(def, initial)
    if (!drawing) {
      finalize()
      return
    }
    manager.add(drawing)
    // A tool that types on the chart shows its points' handles while its later points are placed.
    if (required > 1 && inlineTextRules(drawing)) drawing.setState('editing')
    ctx.draft = { drawing, required, placed: 1, downX: p.x, downY: p.y, pendingDrag: true, hasText: !!def.hasText, mode, lastX: p.x, lastY: p.y }
    showPoint(anchor)
    if (mode === 'fixed' && required === 1) completePlacement(ctx.draft, p)
  }

  /** The live end of a two-point fixed placement, held to 45 degree rays off the first anchor while
   *  Shift is down. */
  const constrainedEnd = (draft: Draft, p: Px, shift: boolean): Px => {
    if (!shift || draft.required !== 2 || draft.mode !== 'fixed') return p
    const vp = viewport()
    const first = vp && draft.drawing.anchors[0] ? draft.drawing.anchorToPixel(draft.drawing.anchors[0], vp) : null
    return first ? constrain45(first, p) : p
  }

  /** Bring a placement's live point to `p`, magnet and Shift as a drag of it would. */
  const followDraft = (draft: Draft, p: Px, shift: boolean): void => {
    const live = constrainedEnd(draft, p, shift)
    const anchor = isTransientArmed(ctx.armed()) ? anchorAt(live) : snappedAnchorAt(live, shift)
    if (anchor) draft.drawing.updateAnchor(draft.drawing.anchors.length - 1, anchor)
    showPoint(anchor)
  }

  const onMove = (e: PointerEvent): void => {
    const p = localXY(e)
    const drag = ctx.drag
    if (drag) {
      let { x, y } = p
      if (!drag.moved) {
        const travel = Math.abs(x - drag.grabX) + Math.abs(y - drag.grabY)
        // A finger settles as it lands: a drawing it pressed stays put until it clearly sets off.
        if (touching && travel <= TOUCH_MOVE_PX) return
        if (travel > MOVE_EPSILON_PX) drag.moved = true
      }
      const vp = viewport()
      if (!vp) return
      if (drag.mode === 'resize' && drag.anchorIndex !== null) {
        drag.drawing.resizeTo(drag.anchorIndex, { x, y }, vp)
        return
      }
      if (drag.mode === 'anchor' && drag.anchorIndex !== null) {
        // Shift constrains a two-point drawing's dragged end to 45 degree rays off its other end.
        if (e.shiftKey && drag.drawing.anchors.length === 2) {
          const other = drag.origPixels[1 - drag.anchorIndex]
          if (other) ({ x, y } = constrain45(other, { x, y }))
        }
        const anchor = snappedAnchorAt({ x, y }, e.shiftKey)
        if (anchor) drag.drawing.dragAnchorTo(drag.anchorIndex, anchor)
        showPoint(anchor)
        return
      }
      // Rigid translation: one whole-bar shift for every anchor.
      const dx = x - drag.grabX
      const dy = y - drag.grabY
      const ts = chart.timeScale()
      const la = ts.coordinateToLogical(0)
      const lb = ts.coordinateToLogical(120)
      const spacing = la !== null && lb !== null && lb !== la ? 120 / (lb - la) : null
      const dxBars = barsShifted(dx, spacing)
      for (let i = 0; i < drag.origPixels.length; i++) {
        const op = drag.origPixels[i]
        if (!op || (drag.only && !drag.only.includes(i))) continue
        const ol = drag.origLogicals[i]
        const t = ol !== null && spacing !== null ? vp.timeOfLogical(ol + dxBars) : vp.timeAt(op.x + dx)
        const price = vp.priceAt(op.y + dy)
        if (t != null && price != null) drag.drawing.updateAnchor(i, { time: t, price })
      }
      return
    }

    const draft = ctx.draft
    if (draft) {
      if (draft.mode === 'freehand') {
        // The stroke is captured raw (no magnet), thinned to a few pixels per point.
        const anchor = anchorAt(p)
        if (!anchor) return
        if (Math.hypot(p.x - draft.lastX, p.y - draft.lastY) >= STROKE_STEP_PX) {
          draft.drawing.appendAnchor(anchor)
          draft.lastX = p.x
          draft.lastY = p.y
        }
        return
      }
      // Shift constrains a two-point placement's live end against its first anchor.
      followDraft(draft, p, e.shiftKey)
      return
    }

    // At rest over the chart the pointer glyph follows the cursor mode.
    wearCursor(ctx.cursorCss())
  }

  /** The drawing under the resting pointer, reported for the surfaces that follow it. Bound to the
   *  container rather than the window, so a pointer over the toolbar or the host page reports
   *  nothing. */
  const onHover = (e: PointerEvent): void => {
    // A mouse previews what a click would place; a finger presses where it means to.
    if (ctx.armed() && e.pointerType !== 'touch') followPreview(localXY(e))
    if (ctx.drag || ctx.draft || ctx.armed()) return
    const p = localXY(e)
    ctx.setHovered(manager.hitTest(p)?.id ?? null)
    // The selected drawing's handle under a mouse stands out; a finger has no resting pointer.
    const selected = manager.selected()
    selected?.setHoveredHandle(e.pointerType === 'touch' ? null : anchorHit(selected, p))
  }
  const onLeave = (): void => {
    dropPreview()
    manager.selected()?.setHoveredHandle(null)
    ctx.setHovered(null)
  }

  /** Pixels of travel that turn an opening press into a drag, a finger's or a pointer's. */
  const placeSlop = (): number => (touching ? TOUCH_PLACE_DRAG_PX : PLACE_DRAG_PX)

  /** End a grab: keep what it moved, drop a copy it never moved, or land an unmoved press inside a
   *  table in its cell. */
  const endDrag = (drag: Drag): void => {
    ctx.drag = null
    freezePan(!!ctx.armed()) // an armed tool keeps the chart frozen; the cursor releases it
    // A modified press that duplicated but never moved leaves no copy behind.
    if (drag.cloned && !drag.moved) manager.remove(drag.drawing.id)
    // An unmoved press inside a table lands in a cell: type right there.
    if (!drag.moved && !drag.cloned && drag.mode === 'move' && drag.drawing.type === 'table') {
      const vp = viewport()
      const table = drag.drawing as IDrawing & {
        cellAt?: (point: Px, viewport: Viewport) => { row: number; col: number; rect: { x: number; y: number; width: number; height: number } } | null
      }
      const cell = vp && table.cellAt ? table.cellAt({ x: drag.grabX, y: drag.grabY }, vp) : null
      if (cell) {
        ctx.openCellEdit(drag.drawing, cell)
        return
      }
    }
    // An unmoved click on the words of a drawing that was already selected types into them, for a
    // tool that types them on the chart; the click that selected it only selects it.
    if (!drag.moved && !drag.cloned && drag.mode === 'move' && drag.selectedBefore && inlineTextRules(drag.drawing)?.clickToType && !editRefused('editText', drag.drawing.options, ctx.locked())) {
      const vp = viewport()
      if (vp && drag.drawing.wordsAt({ x: drag.grabX, y: drag.grabY }, vp)) {
        ctx.openTextEdit(drag.drawing, drag.grabX, drag.grabY, false, 'click')
        return
      }
    }
    if (drag.moved || drag.cloned) {
      ctx.persist()
      ctx.changed()
    }
  }

  const onUp = (e: PointerEvent): void => {
    const p = localXY(e)
    hidePoint()
    const drag = ctx.drag
    if (drag) {
      endDrag(drag)
      return
    }

    const draft = ctx.draft
    if (!draft) return
    const tool = ctx.armed()

    if (tool === 'measure' || tool === 'zoom') {
      const moved = Math.abs(p.x - draft.downX) + Math.abs(p.y - draft.downY) > (touching ? TOUCH_PLACE_DRAG_PX : 4)
      if (!moved && draft.pendingDrag) {
        // A click, not a drag: the preview keeps tracking the pointer until the second click.
        draft.pendingDrag = false
        return
      }
      const end = anchorAt(p)
      if (end) draft.drawing.updateAnchor(1, end)
      completeTransient(draft, tool, p)
      return
    }

    if (draft.mode === 'freehand') {
      // The stroke is whatever the drag captured; a strayed click leaves nothing worth keeping.
      if (draft.drawing.anchors.length >= draft.required) {
        completePlacement(draft, p)
      } else {
        manager.remove(draft.drawing.id)
        finalize()
      }
      return
    }

    if (draft.mode === 'multipoint') {
      // The opening press released in place fixed its point on the way down; the preview keeps
      // tracking. Every later release fixes the live point and appends the next preview, and a
      // double-click ends the run.
      if (draft.pendingDrag && Math.abs(p.x - draft.downX) + Math.abs(p.y - draft.downY) <= placeSlop()) {
        draft.pendingDrag = false
        return
      }
      draft.pendingDrag = false
      const point = snappedAnchorAt(p, e.shiftKey)
      if (point) {
        draft.drawing.updateAnchor(draft.drawing.anchors.length - 1, point)
        draft.drawing.appendAnchor(point)
        draft.placed += 1
      }
      return
    }

    const snapped = snappedAnchorAt(constrainedEnd(draft, p, e.shiftKey), e.shiftKey)
    const lastIndex = draft.drawing.anchors.length - 1
    if (snapped) draft.drawing.updateAnchor(lastIndex, snapped)
    const moved = Math.abs(p.x - draft.downX) + Math.abs(p.y - draft.downY) > placeSlop()
    // The opening press released in place is a CLICK: keep tracking; the next click fixes the end.
    if (draft.pendingDrag && !moved) {
      draft.pendingDrag = false
      return
    }
    draft.pendingDrag = false
    draft.placed += 1
    if (draft.placed >= draft.required) {
      completePlacement(draft, p)
    } else {
      const next = snapped ?? draft.drawing.anchors[lastIndex]!
      draft.drawing.appendAnchor({ ...next })
    }
  }

  /** The browser took the touch away mid-gesture: a grab ends where it stands, and a placement
   *  waits for the next press, as a tap would have left it. */
  const onCancel = (): void => {
    hidePoint()
    if (ctx.drag) endDrag(ctx.drag)
    else if (ctx.draft) ctx.draft.pendingDrag = false
  }

  /** A browser settles whether a touch scrolls the page as the touch begins, just after the press
   *  that started it. A touch the layer took there (a placement, a drawing, one of its handles) is
   *  claimed for the layer, so the drag is the drawing's to the end; any other touch stays the
   *  page's and the chart's. */
  const onTouchStart = (e: TouchEvent): void => {
    if (ctx.drag || ctx.draft) e.preventDefault()
  }

  /** A double-click ends a multipoint run, opens the settings of a drawing whose tool opens them so,
   *  and opens the editor of any other drawing's words. */
  const onDblClick = (e: MouseEvent): void => {
    if (ctx.locked()) return
    const draft = ctx.draft
    if (draft?.mode === 'multipoint') {
      // The doubled click fixed a duplicate point and appended a preview: drop both.
      const drawing = draft.drawing
      drawing.removeAnchor(drawing.anchors.length - 1)
      if (drawing.anchors.length > draft.required) drawing.removeAnchor(drawing.anchors.length - 1)
      if (drawing.anchors.length >= draft.required) {
        completePlacement(draft, localXY(e))
      } else {
        manager.remove(drawing.id)
        finalize()
      }
      return
    }
    if (ctx.armed()) return
    const p = localXY(e)
    const hit = manager.hitTest(p)
    // A click of the double-click may have begun an edit of the words; it ends keeping them as they
    // are.
    if (hit && settingsOnDoubleClick(hit)) {
      ctx.endTextEdit()
      manager.select(hit.id)
      ctx.openSettings()
      return
    }
    if (ctx.textEditOpen()) return
    if (!hit || editRefused('editText', hit.options, false)) return
    if (!drawingTools.get(hit.type)?.hasText) return
    manager.select(hit.id)
    ctx.openTextEdit(hit, p.x, p.y, false, 'click')
  }

  // The press starts on the container, but move and release bind to the WINDOW: a drag that leaves
  // the chart keeps tracking, and the release is never lost outside (losing it would strand a
  // frozen pan and a half-moved drawing).
  container.addEventListener('pointerdown', onDown)
  container.addEventListener('touchstart', onTouchStart, { passive: false })
  container.addEventListener('pointermove', onHover)
  container.addEventListener('pointerleave', onLeave)
  container.addEventListener('dblclick', onDblClick)
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onCancel)
  return () => {
    reopenMenu()
    dropPreview()
    ctx.toolChanged = undefined
    container.removeEventListener('pointerdown', onDown)
    container.removeEventListener('touchstart', onTouchStart)
    container.removeEventListener('pointermove', onHover)
    container.removeEventListener('pointerleave', onLeave)
    container.removeEventListener('dblclick', onDblClick)
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onCancel)
  }
}

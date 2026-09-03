// The widget's drawing layer: the drawing model and pixels from the internal drawing seam, mounted
// behind a framework-free pointer and keyboard binding, the revisioned drawings documents, and the
// tool presets. Every registered tool places here, the two transient tools measure and zoom, and
// the selection edits a settings surface drives: restyle, lock, stack, hide, clone, copy and
// paste, and the inline text edit.
//
// The layer owns the gesture and the mutable truth (what is armed, what is selected, what is
// hidden or locked across the layer). It CONSULTS the standing workflow choices through a getter
// and never holds a second copy, and it reports every change through its events so a toolbar and a
// settings bar render from the layer rather than from state of their own.
import type { Time } from 'lightweight-charts'
import { DrawingManager, parseIntervalContext, restoreDrawings, viewportOf, visibilityPreset } from '@trdrs/chart-drawings'
import type { IDrawing, SerializedDrawing, SourceBar } from '@trdrs/chart-drawings'
import { drawingTools } from '../tools'
import { editRefused } from '../lockModel'
import { isTransientTool, type CursorMode } from '../cursorModel'
import { cancelText, commitText, type TextEditTarget } from '../editModel'
import { pointerLock } from '../../pointerInput'
import { createDocuments } from './documents'
import { createPresets } from './presets'
import { bindGestures, type Draft, type Drag, type GestureContext } from './gestures'
import { imagePlacement, shiftedAnchors } from './geometry'
import { scopeForNew } from './scope'
import type { AttachDrawingsOptions, DrawingsHandle, DrawingsWorkflow, SelectedDrawing, TextEditSession } from './types'

/** What each cursor mode paints over the chart. The dot has no CSS keyword of its own, so it is
 *  a 5px ring drawn inline in the ink the chart hands over (its text role, so the ring follows
 *  the theme); the trailing keyword is the fallback while the data URI parses. */
function cursorCssFor(mode: CursorMode, ink: string): string {
  if (mode === 'cross') return 'crosshair'
  if (mode === 'arrow') return 'default'
  const stroke = encodeURIComponent(ink)
  return `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10'%3E%3Ccircle cx='5' cy='5' r='3.4' fill='none' stroke='${stroke}' stroke-width='1.4'/%3E%3C/svg%3E") 5 5, crosshair`
}

const DEFAULT_WORKFLOW: DrawingsWorkflow = { magnet: 'off', stayInDrawingMode: false, cursor: 'cross' }

/** The commands the keyboard verbs route through when the layer is given a door. */
const KEY_COMMANDS = {
  delete: 'chart.drawings.deleteSelected',
  cancel: 'chart.drawings.cancel',
  copy: 'chart.drawings.copy',
  paste: 'chart.drawings.paste',
} as const

let idSeq = 0
const nextId = (): string => `dww-${idSeq++}-${Date.now() % 1e9}`

/** The drawing clipboard lasts the page and is shared by every layer on it, so a drawing copied
 *  on one chart pastes on another. */
let clipboard: SerializedDrawing | null = null

/** A tool this layer places: every registered tool, plus the transient tools. */
export function placeableByWidget(type: string): boolean {
  return drawingTools.has(type) || isTransientTool(type)
}

const snapshot = (d: IDrawing | null): SelectedDrawing | null => {
  if (!d) return null
  const s = d.style
  return {
    id: d.id,
    type: d.type,
    lineColor: s.lineColor,
    lineWidth: s.lineWidth,
    lineStyle: s.lineStyle,
    fillColor: s.fillColor,
    fillOpacity: s.fillOpacity,
    textColor: s.textColor,
    fontSize: s.fontSize,
    bold: s.bold,
    italic: s.italic,
    locked: d.options.locked,
    hasText: typeof d.props.text === 'string',
    hasCells: Array.isArray(d.props.cells),
  }
}

export function attachDrawings(options: AttachDrawingsOptions): DrawingsHandle {
  const { chart, series, container } = options
  const events = options.events ?? {}
  const workflow = (): DrawingsWorkflow => options.workflow?.() ?? DEFAULT_WORKFLOW

  const manager = new DrawingManager()
  if (options.glyphSource) manager.setGlyphSource(options.glyphSource)
  manager.attach(chart, series)
  manager.setIntervalContext(parseIntervalContext(options.timeframe ?? ''))

  // Data feed for data-driven drawings, memoized by (length, last bar time) so live ticks refresh
  // it without rebuilding the array on every paint.
  if (options.bars) {
    const read = options.bars
    let cacheKey = ''
    let cached: readonly SourceBar[] = []
    manager.setBarSource(() => {
      const bars = read()
      const key = `${bars.length}:${bars.length ? bars[bars.length - 1]!.t : ''}`
      if (key === cacheKey) return cached
      cached = bars.map((b) => ({ time: b.t as Time, open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v }))
      cacheKey = key
      return cached
    })
  }

  const presets = createPresets(options.templates ?? null)

  let symbol = options.symbol
  let timeframe = options.timeframe ?? ''
  let destroyed = false
  let armed: string | null = null
  let presetProps: Record<string, unknown> | null = null
  let allLocked = false
  let hovered: string | null = null
  let textEdit: TextEditSession | null = null
  const transient = new Set<string>()
  /** The snapshot a preview session took, by drawing id: what the document carries meanwhile. */
  const previewing = new Map<string, SerializedDrawing>()

  const locked = (): boolean => allLocked || workflow().allLocked === true

  const changed = (): void => events.onChange?.()

  /** The one lock every in-chart gesture applies: the chart's pan and zoom and the container's
   *  touch action move together, so a finger drawing a line never scrolls the page under it. */
  const lockPointer = (locked: boolean): void => {
    const lock = pointerLock(locked)
    chart.applyOptions({ handleScroll: lock.handleScroll, handleScale: lock.handleScale })
    container.style.touchAction = lock.touchAction
  }

  /** The drawings on screen that are the trader's: never a transient readout, never a draft. */
  const kept = (): SerializedDrawing[] =>
    manager
      .export()
      .filter((d) => d.id !== ctx.draft?.drawing.id && !transient.has(d.id))
      .map((d) => previewing.get(d.id) ?? d)

  const documents = createDocuments({
    resources: options.resources,
    chartId: options.chartId,
    current: () => symbol,
    onDocument: (sym, list) => {
      if (sym !== symbol) return
      replaceScreen(list)
      changed()
    },
    onConflict: (info) => events.onSaveConflict?.(info),
  })

  /** Repaint the current symbol from a document, keeping the selection when it survives by id. */
  const replaceScreen = (list: readonly SerializedDrawing[]): void => {
    const selectedId = manager.selected()?.id ?? null
    cancelDraft()
    closeTextEdit(false)
    clearTransients()
    previewing.clear()
    manager.clear()
    importList(list)
    if (selectedId && manager.get(selectedId)) manager.select(selectedId)
  }

  const importList = (list: readonly SerializedDrawing[]): void => {
    // A drawing's own `visible` switch has no per-item control once it is off: it paints nothing
    // and takes no hit. So a stored `false` comes back on, and hiding lasts the session.
    const rows = list.map((d) => (d.options?.visible === false ? { ...d, options: { ...d.options, visible: true } } : d))
    for (const d of restoreDrawings(rows)) {
      try {
        manager.add(d)
      } catch {
        /* skip a drawing the series refuses */
      }
    }
  }

  const persist = (): void => {
    documents.sync(symbol, kept())
    documents.persist(symbol)
  }

  const setArmed = (type: string | null): void => {
    if (armed === type) return
    armed = type
    if (!type) presetProps = null
    // Pan and zoom freeze while a tool is armed: a drag must draw, not scroll the chart.
    lockPointer(!!type)
    events.onToolChange?.(type)
  }

  const cancelDraft = (): void => {
    if (!ctx.draft) return
    manager.remove(ctx.draft.drawing.id)
    ctx.draft = null
  }

  const clearTransients = (): void => {
    for (const id of transient) manager.remove(id)
    transient.clear()
  }

  // ── Inline text ─────────────────────────────────────────────────────────────────────────────
  const setTextEdit = (session: TextEditSession | null): void => {
    textEdit = session
    events.onTextEdit?.(session)
  }

  /** Close the editor. A fresh placement cancelled or committed empty is removed with it. */
  const closeTextEdit = (removeFresh: boolean): void => {
    const session = textEdit
    if (!session) return
    const drawing = manager.get(session.id)
    setTextEdit(null)
    if (drawing) {
      drawing.textEditing = false
      drawing.requestUpdate()
      if (removeFresh && session.fresh) manager.remove(drawing.id)
    }
  }

  const openTextEdit = (drawing: IDrawing, x: number, y: number, fresh: boolean, cell?: TextEditSession['cell']): void => {
    // Deferred past the placement gesture: an editor mounted DURING the press is blurred at once
    // by the browser's own focus handling, and a blur commits.
    setTimeout(() => {
      if (destroyed || !manager.get(drawing.id)) return
      const angle = cell ? 0 : (drawing.textHintAnchor()?.angle ?? 0)
      drawing.textEditing = true
      drawing.requestUpdate()
      const cells = (drawing.props as { cells?: string[][] }).cells
      const value = cell ? (cells?.[cell.row]?.[cell.col] ?? '') : typeof drawing.props.text === 'string' ? drawing.props.text : ''
      const s = drawing.style
      setTextEdit({ id: drawing.id, x, y, value, fresh, color: s.textColor, fontSize: s.fontSize, bold: s.bold, italic: s.italic, angle, ...(cell ? { cell } : {}) })
    }, 0)
  }

  const commitTextEdit = (value: string): void => {
    const session = textEdit
    if (!session) return
    const drawing = manager.get(session.id)
    const target: TextEditTarget = { id: session.id, fresh: session.fresh, ...(session.cell ? { cell: session.cell } : {}) }
    const commit = commitText(target, value)
    closeTextEdit(false)
    if (!drawing) return
    if (commit.kind === 'discard') {
      manager.remove(drawing.id)
      persist()
      changed()
      return
    }
    if (commit.kind === 'apply-cell') {
      const cells = (drawing.props as { cells?: string[][] }).cells
      if (Array.isArray(cells) && cells[commit.row]?.[commit.col] !== undefined) {
        const next = cells.map((row) => [...row])
        next[commit.row]![commit.col] = commit.text
        drawing.applyProps({ cells: next })
      }
    } else drawing.applyProps({ text: commit.text })
    persist()
    changed()
  }

  const cancelTextEdit = (): void => {
    const session = textEdit
    if (!session) return
    const outcome = cancelText({ id: session.id, fresh: session.fresh })
    closeTextEdit(outcome.kind === 'remove')
    if (outcome.kind === 'remove') persist()
    changed()
  }

  // ── The gesture context ─────────────────────────────────────────────────────────────────────
  const ctx: GestureContext = {
    chart,
    series,
    container,
    manager,
    presets,
    workflow,
    chartId: options.chartId,
    nextId,
    armed: () => armed,
    presetProps: () => presetProps,
    setArmed,
    locked,
    draft: null as Draft | null,
    drag: null as Drag | null,
    transient,
    textEditOpen: () => textEdit !== null,
    openTextEdit: (drawing, x, y, fresh) => openTextEdit(drawing, x, y, fresh),
    openCellEdit: (drawing, cell) => openTextEdit(drawing, cell.rect.x + cell.rect.width / 2, cell.rect.y + cell.rect.height / 2, false, { row: cell.row, col: cell.col }),
    setHovered: (id) => {
      if (id === hovered) return
      hovered = id
      events.onHover?.(id)
    },
    persist,
    changed,
    clearTransients,
    cursorCss: () => cursorCssFor(workflow().cursor, options.ink?.() ?? 'currentColor'),
    lockPointer,
  }

  // ── Selection edits ─────────────────────────────────────────────────────────────────────────
  const selection = (): IDrawing | null => manager.selected()

  /** An edit to the selection: apply, remember as the tool's default, persist, report. */
  const edit = (apply: (d: IDrawing) => void): void => {
    const sel = selection()
    if (!sel) return
    apply(sel)
    // A preview is not a choice yet: the remembered default follows the commit, not the session.
    if (!previewing.has(sel.id)) presets.remember(sel)
    persist()
    changed()
  }

  const restack = (move: 'bringToFront' | 'sendToBack' | 'bringForward' | 'sendBackward'): void => {
    const sel = selection()
    if (!sel) return
    manager[move](sel.id)
    persist()
    changed()
  }

  const placeCopy = (source: SerializedDrawing): boolean => {
    if (locked()) return false
    const copy = drawingTools.restore({ ...source, id: nextId(), anchors: shiftedAnchors(source.anchors, viewportOf(chart, series)) })
    if (!copy) return false
    copy.scope = scopeForNew(options.chartId, workflow().syncAcrossPanes !== false)
    manager.add(copy)
    manager.select(copy.id)
    persist()
    changed()
    return true
  }

  // ── The keyboard ────────────────────────────────────────────────────────────────────────────
  /** A key runs its verb through the door when one was given, so the access policy gates the
   *  keyboard as it gates every other surface; standalone, the layer runs the verb itself. */
  const run = (command: keyof typeof KEY_COMMANDS, direct: () => void): void => {
    if (options.execute) options.execute(KEY_COMMANDS[command])
    else direct()
  }

  const onKey = (e: KeyboardEvent): void => {
    const target = e.target as HTMLElement | null
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
    if (e.key === 'Escape') {
      if (!ctx.draft && !armed && !textEdit && !transient.size) return
      run('cancel', () => handle.armTool(null))
      e.preventDefault()
      e.stopPropagation()
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      if (!selection()) return
      run('delete', () => handle.deleteSelected())
      e.preventDefault()
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
      if (!selection()) return
      run('copy', () => handle.copy())
      e.preventDefault()
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
      if (!clipboard) return
      run('paste', () => handle.paste())
      e.preventDefault()
    }
  }

  const selectionChanged = (): void => {
    events.onSelectionChange?.(manager.selected()?.id ?? null)
    changed()
  }
  const offs = [
    manager.on('drawing:selected', selectionChanged),
    manager.on('drawing:deselected', selectionChanged),
    manager.on('drawing:added', changed),
    manager.on('drawing:removed', changed),
    manager.on('drawing:cleared', changed),
  ]

  // Keys bind to the CONTAINER (focused on pointerdown), never the window: an embedded widget must
  // not swallow the host page's Delete or Escape. tabIndex -1 = focusable by click and script only.
  if (!container.hasAttribute('tabindex')) container.tabIndex = -1
  container.style.outline = 'none'
  container.addEventListener('keydown', onKey)
  const unbindGestures = bindGestures(ctx)

  importList(documents.listFor(symbol))
  documents.hydrate(symbol)

  const handle: DrawingsHandle = {
    armTool(type, props) {
      if (destroyed) return
      if (type !== null && !placeableByWidget(type)) throw new Error(`drawings: unknown tool type '${type}'`)
      cancelDraft()
      cancelTextEdit()
      clearTransients()
      presetProps = props ?? null
      if (type) manager.deselect()
      setArmed(type)
    },
    activeTool: () => armed,
    select: (id) => manager.select(id),
    deselect: () => manager.deselect(),
    hasSelection: () => manager.selected() !== null,
    selected: () => snapshot(selection()),
    selectedDrawing: selection,
    hovered: () => hovered,
    deleteSelected() {
      const sel = selection()
      if (!sel || editRefused('delete', sel.options, locked())) return
      manager.remove(sel.id)
      persist()
    },
    clearAll(includeLocked = false) {
      cancelDraft()
      cancelTextEdit()
      // A locked drawing is one a person deliberately pinned down, so the sweep spares it unless
      // asked, which is why this removes by id rather than clearing the store.
      for (const d of manager.all()) if (includeLocked || !d.options.locked) manager.remove(d.id)
      persist()
    },
    count: () => kept().length,
    counts() {
      const all = manager.all().filter((d) => !transient.has(d.id) && d.id !== ctx.draft?.drawing.id)
      return { total: all.length, locked: all.filter((d) => d.options.locked).length }
    },
    updateStyle: (patch) => edit((d) => d.updateStyle(patch)),
    updateProps: (patch) => edit((d) => d.applyProps(patch)),
    setLocked(lockedFlag) {
      const sel = selection()
      if (!sel) return
      sel.updateOptions({ locked: lockedFlag })
      persist()
      changed()
    },
    commitEdit() {
      previewing.clear()
      edit(() => undefined)
    },
    beginPreview() {
      const sel = selection()
      if (sel) previewing.set(sel.id, sel.toJSON())
    },
    endPreview: () => previewing.clear(),
    clone() {
      const sel = selection()
      if (!sel || editRefused('clone', sel.options, locked())) return
      placeCopy(sel.toJSON())
    },
    copy() {
      const sel = selection()
      if (sel) clipboard = sel.toJSON()
    },
    paste: () => (clipboard ? placeCopy(clipboard) : false),
    canPaste: () => clipboard !== null,
    bringToFront: () => restack('bringToFront'),
    sendToBack: () => restack('sendToBack'),
    bringForward: () => restack('bringForward'),
    sendBackward: () => restack('sendBackward'),
    stackPosition() {
      const sel = selection()
      return sel ? manager.stackPosition(sel.id) : { atFront: true, atBack: true }
    },
    hideSelected() {
      const sel = selection()
      if (!sel) return
      sel.updateOptions({ visible: false })
      manager.deselect()
      persist()
      changed()
    },
    setVisibilityPreset(preset) {
      const sel = selection()
      if (!sel) return
      sel.updateOptions({ visibility: visibilityPreset(preset, parseIntervalContext(timeframe)) })
      persist()
      changed()
    },
    placeImage(image) {
      if (locked()) return
      const vp = viewportOf(chart, series)
      if (!vp) return
      const placed = imagePlacement(image, { width: vp.width, height: vp.height }, vp)
      if (!placed) return
      const preset = presets.defaultFor('image')
      const drawing = drawingTools.create('image', nextId(), [placed.anchor], preset.style)
      if (!drawing) return
      if (preset.props) drawing.applyProps(preset.props)
      drawing.applyProps({ dataUrl: image.dataUrl, width: placed.width, opacity: image.opacity ?? 1 })
      drawing.scope = scopeForNew(options.chartId, workflow().syncAcrossPanes !== false)
      manager.add(drawing)
      manager.select(drawing.id)
      persist()
      changed()
    },
    setAllHidden(hidden) {
      manager.setAllHidden(hidden)
      if (hidden) manager.deselect()
      changed()
    },
    allHidden: () => manager.allHidden(),
    setAllLocked(next) {
      if (allLocked === next) return
      allLocked = next
      if (next) {
        cancelDraft()
        manager.deselect()
      }
      changed()
    },
    allLocked: () => allLocked,
    textEdit: () => textEdit,
    editSelectedText() {
      const sel = selection()
      if (!sel || typeof sel.props.text !== 'string' || editRefused('editText', sel.options, locked())) return
      const vp = viewportOf(chart, series)
      const hint = sel.textHintAnchor()
      const first = vp && sel.anchors[0] ? sel.anchorToPixel(sel.anchors[0], vp) : null
      openTextEdit(sel, hint?.x ?? first?.x ?? 0, hint?.y ?? first?.y ?? 0, false)
    },
    commitText: commitTextEdit,
    cancelText: cancelTextEdit,
    presets,
    setSymbol(next) {
      if (destroyed || next === symbol) return
      cancelDraft()
      cancelTextEdit()
      clearTransients()
      documents.sync(symbol, kept())
      documents.flush() // the old symbol's pending edit goes up before the switch
      manager.deselect()
      manager.clear()
      symbol = next
      documents.bumpEpoch()
      importList(documents.listFor(next))
      documents.hydrate(next)
      changed()
    },
    setTimeframe(tf) {
      timeframe = tf
      manager.setIntervalContext(parseIntervalContext(tf))
    },
    setTick: (tick) => manager.setTickSize(tick),
    setPriceFormatter: (format) => manager.setPriceFormatter(format),
    export: kept,
    restore(list) {
      replaceScreen(list)
      persist()
      changed()
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      cancelDraft()
      closeTextEdit(false)
      documents.sync(symbol, kept())
      documents.destroy()
      presets.destroy()
      offs.forEach((off) => off())
      unbindGestures()
      container.removeEventListener('keydown', onKey)
      try {
        // The chart's navigation and the container's touch action never outlive the layer.
        lockPointer(false)
        manager.detach()
      } catch {
        /* chart already removed */
      }
    },
  }
  return handle
}

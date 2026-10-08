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
import { bundledGlyphSource, onBundledArtwork } from '../emoji'
import { DrawingManager, parseTimeframeContext, restoreDrawings, viewportOf, visibilityPreset } from '../../internal/drawings/index'
import type { IDrawing, InlineTextRules, SerializedDrawing, SourceBar, TextEditFrame } from '../../internal/drawings/index'
import { inlineTextRules } from './inlineText'
import type { ResourceRef } from '../../resources'
import { drawingTools } from '../tools'
import { editRefused } from '../lockModel'
import { isTransientTool, type CursorMode } from '../cursorModel'
import { cancelText, commitText, type TextEditTarget } from '../editModel'
import { pointerLock } from '../../pointerInput'
import { createDocuments, drawingOf, drawingShapeOf, type DrawingOwner } from './documents'
import { liveDrawingEntries, liveDrawingGroups, sameDrawingContext, type DrawingsBody } from '../document'
import { createPresets, presetPropsFor } from './presets'
import { bindGestures, type Draft, type Drag, type GestureContext } from './gestures'

const identityRebinders = new WeakMap<DrawingsHandle, (id: string) => void>()
export const rebindDrawingIdentity = (handle: DrawingsHandle, id: string): void => identityRebinders.get(handle)?.(id)
import { imagePlacement, shiftedAnchors } from './geometry'
import { ownsDrawing, stampNewScope } from './scope'
import type {
  AttachDrawingsOptions,
  DrawingApplyOutcome,
  DrawingDocumentApi,
  DrawingReadOutcome,
  DrawingRejection,
  DrawingsHandle,
  DrawingsWorkflow,
  SelectedDrawing,
  TextEditSession,
} from './types'

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

/** The command a double-click on a drawing that types its words on the chart runs through the
 *  door: its settings. */
const SETTINGS_COMMAND = 'chart.drawings.settings'

let idSeq = 0
const nextId = (): string => `dww-${idSeq++}-${Date.now() % 1e9}`

/** The drawing clipboard lasts the page and is shared by every layer on it, so a drawing copied
 *  on one chart pastes on another. */
let clipboard: SerializedDrawing | null = null

/** Command-only state stays off the low-level public handle. The widget asks this helper when it
 * registers Cancel, so a completed Measure readout remains cancellable after the tool disarms
 * without publishing another drawing-session verb. */
const canCancelByHandle = new WeakMap<DrawingsHandle, () => boolean>()

export function drawingCancelAvailable(handle: DrawingsHandle): boolean {
  return canCancelByHandle.get(handle)?.() ?? false
}

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
  let chartId = options.chartId
  const { chart, series, container } = options
  const events = options.events ?? {}
  const workflow = (): DrawingsWorkflow => options.workflow?.() ?? DEFAULT_WORKFLOW

  const manager = new DrawingManager()
  manager.setGlyphSource(options.glyphSource ?? bundledGlyphSource)
  if (options.placeholder) manager.setTextPlaceholder(options.placeholder)
  if (options.inks) manager.setInks(options.inks)
  // An emoji painted before the bundled artwork arrived painted as text: hand every drawing the
  // source again as it lands, which repaints them with the artwork.
  const stopArtwork = options.glyphSource ? null : onBundledArtwork(() => manager.setGlyphSource(bundledGlyphSource))
  manager.attach(chart, series)
  manager.setTimeframeContext(parseTimeframeContext(options.timeframe ?? ''))

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
  /** Drawings of a tool that removes an empty drawing, holding no words: none is the viewer's until
   *  it holds words, so no document and no history step carries it. */
  const wordless = new Set<string>()
  /** While the screen is replaced wholesale, a drawing the selection leaves is not judged: the
   *  screen that replaces it decides what stays. */
  let replacing = false
  const transient = new Set<string>()
  /** Drawings the viewer hid during this layer's life, by id: what an import hides again. */
  const hiddenThisSession = new Set<string>()
  /** The snapshot a preview session took, by drawing id: what the document carries meanwhile. */
  const previewing = new Map<string, SerializedDrawing>()

  const locked = (): boolean => allLocked || workflow().allLocked === true

  const changed = (): void => events.onChange?.()

  /** The one lock every in-chart gesture applies: the chart's pan and zoom and the container's
   *  touch action move together, so a finger drawing a line never scrolls the page under it. */
  const lockPointer = (locked: boolean): void => {
    const lock = pointerLock(locked, options.navigable ?? true)
    chart.applyOptions({ handleScroll: lock.handleScroll, handleScale: lock.handleScale })
    container.style.touchAction = lock.touchAction
  }

  /** The drawings on screen that are the viewer's: never a transient readout, never a draft, never
   *  a text that holds no words. */
  const kept = (): SerializedDrawing[] =>
    manager
      .export()
      .filter((d) => d.id !== ctx.draft?.drawing.id && !transient.has(d.id) && !wordless.has(d.id))
      .map((d) => previewing.get(d.id) ?? d)

  const owner: DrawingOwner = options.surface?.owner ?? { source: 'main', pane: 'main' }
  const liveSources = options.surface?.sources ?? ((): readonly string[] => [owner.source])
  const livePanes = options.surface?.panes ?? ((): readonly string[] => [owner.pane])

  const documents = createDocuments({
    ...(options.documents ? { port: options.documents } : {}),
    owner,
    ...(options.chartId === undefined ? {} : { chartId: () => chartId! }),
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
    clearScreen()
    importList(list)
    if (selectedId && manager.get(selectedId)) manager.select(selectedId)
  }

  /** Take every drawing off the screen, the words nobody wrote with them. */
  const clearScreen = (): void => {
    replacing = true
    try {
      manager.clear()
    } finally {
      replacing = false
      wordless.clear()
    }
  }

  const importList = (list: readonly SerializedDrawing[]): void => {
    // A drawing's own `visible` switch has no per-item control once it is off: it paints nothing
    // and takes no hit. So a STORED `false` comes back on, and a hidden drawing is never stranded
    // where nothing can reach it.
    const rows = list.map((d) => (d.options?.visible === false ? { ...d, options: { ...d.options, visible: true } } : d))
    for (const d of restoreDrawings(rows)) {
      try {
        manager.add(d)
      } catch {
        /* skip a drawing the series refuses */
      }
    }
    // A hide the viewer made THIS session is different: it is a standing choice, so it survives
    // every import that follows it (another symbol and back, a document landing, a restore) and
    // ends only with the layer.
    for (const id of hiddenThisSession) manager.get(id)?.updateOptions({ visible: false })
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
  // A drawing whose tool types its words on the chart shows the edit from the moment it opens: its
  // draft is the committed words with the caret after them, so the first paint after the press is
  // already the edit's. The session, which mounts the field that takes the keys, follows once the
  // gesture has ended. Committing keeps the words exactly as typed, empty included, and the edit's
  // drawing stays selected; a drawing of a tool that removes an empty drawing goes when the
  // selection leaves it without words.
  const setTextEdit = (session: TextEditSession | null): void => {
    textEdit = session
    events.onTextEdit?.(session)
  }

  /** An inline edit whose drawing already shows its draft, waiting for its gesture to end. */
  let pendingEdit: { drawing: IDrawing; timer: ReturnType<typeof setTimeout> } | null = null
  /** How the open inline edit was opened: a double-click that began with the click that opened it
   *  is the viewer asking for the drawing's settings. */
  let openedBy: 'placement' | 'click' | 'command' | null = null
  const frameListeners = new Set<(frame: TextEditFrame | null) => void>()

  /** End an inline edit's draft on its drawing without committing anything. */
  const endDraft = (drawing: IDrawing | undefined): void => {
    frameListeners.clear()
    openedBy = null
    if (!drawing) return
    drawing.textEditing = false
    drawing.setTextDraft(null)
  }

  /** Drop an inline edit that has not opened yet: its drawing shows its words again. */
  const endPendingEdit = (): void => {
    const pending = pendingEdit
    if (!pending) return
    pendingEdit = null
    clearTimeout(pending.timer)
    endDraft(pending.drawing)
  }

  /** Close the editor. A fresh placement cancelled or committed empty is removed with it. */
  const closeTextEdit = (removeFresh: boolean): void => {
    endPendingEdit()
    const session = textEdit
    if (!session) return
    const drawing = manager.get(session.id)
    setTextEdit(null)
    if (session.inline) endDraft(drawing)
    if (drawing) {
      drawing.textEditing = false
      drawing.requestUpdate()
      if (removeFresh && session.fresh) manager.remove(drawing.id)
    }
  }

  const openTextEdit = (drawing: IDrawing, x: number, y: number, fresh: boolean, how: 'placement' | 'click' | 'command', cell?: TextEditSession['cell']): void => {
    const rules = cell ? null : inlineTextRules(drawing)
    if (rules) {
      openInlineEdit(drawing, x, y, fresh, how, rules)
      return
    }
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

  const openInlineEdit = (drawing: IDrawing, x: number, y: number, fresh: boolean, how: 'placement' | 'click' | 'command', rules: InlineTextRules): void => {
    // One edit at a time: an edit open elsewhere keeps what was typed in it.
    if (textEdit && textEdit.id !== drawing.id) cancelTextEdit()
    if (textEdit?.id === drawing.id) return
    endPendingEdit()
    const value = typeof drawing.props.text === 'string' ? drawing.props.text : ''
    if (fresh && value === '' && rules.removeEmptyOnDeselect) wordless.add(drawing.id)
    drawing.textEditing = true
    drawing.setTextDraft({ value, selectionStart: value.length, selectionEnd: value.length, composition: null, caret: true }, (frame) => {
      for (const listener of frameListeners) listener(frame)
    })
    // Deferred past the gesture: a field focused DURING the press loses the focus to the press's
    // own default at once.
    const timer = setTimeout(() => {
      if (pendingEdit?.drawing !== drawing) return
      pendingEdit = null
      if (destroyed || !manager.get(drawing.id)) {
        endDraft(drawing)
        return
      }
      const s = drawing.style
      const session: TextEditSession = {
        id: drawing.id,
        x,
        y,
        value,
        fresh,
        color: s.textColor,
        fontSize: s.fontSize,
        bold: s.bold,
        italic: s.italic,
        angle: 0,
        inline: {
          frame: () => {
            const vp = viewportOf(chart, series)
            return vp ? drawing.textFrame(vp) : null
          },
          onFrame: (listener) => {
            frameListeners.add(listener)
            return () => void frameListeners.delete(listener)
          },
          update: (draft) => {
            if (textEdit === session) drawing.setTextDraft(draft)
          },
          doubleClick: () => {
            if (textEdit !== session || openedBy !== 'click' || !rules.doubleClickOpensSettings) return false
            commitTextEdit(drawing.textDraft?.value ?? value)
            openSettings()
            return true
          },
        },
      }
      openedBy = how
      setTextEdit(session)
    }, 0)
    pendingEdit = { drawing, timer }
  }

  /** Ask for the selected drawing's settings through the door. Standalone, the layer has no
   *  settings of its own to open. */
  const openSettings = (): void => {
    options.execute?.(SETTINGS_COMMAND)
  }

  /** Commit an inline edit: the words exactly as typed, the drawing still selected. */
  const commitInline = (session: TextEditSession, value: string): void => {
    const drawing = manager.get(session.id)
    closeTextEdit(false)
    if (!drawing) return
    if (value === '' && inlineTextRules(drawing)?.removeEmptyOnDeselect) wordless.add(drawing.id)
    else wordless.delete(drawing.id)
    if (drawing.props.text !== value) drawing.applyProps({ text: value })
    persist()
    changed()
  }

  const commitTextEdit = (value: string): void => {
    const session = textEdit
    if (!session) return
    if (session.inline) {
      commitInline(session, value)
      return
    }
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

  /** Cancel the open edit. An inline edit keeps what was typed, as Escape keeps it: its words are
   *  already on the chart. */
  const cancelTextEdit = (): void => {
    endPendingEdit()
    const session = textEdit
    if (!session) return
    if (session.inline) {
      commitInline(session, manager.get(session.id)?.textDraft?.value ?? session.value)
      return
    }
    const outcome = cancelText({ id: session.id, fresh: session.fresh })
    closeTextEdit(outcome.kind === 'remove')
    if (outcome.kind === 'remove') persist()
    changed()
  }

  /** Whether a new drawing may be made as a copy of one of this type. */
  const copies = (type: string): boolean => options.copies?.(type) ?? true

  // ── The gesture context ─────────────────────────────────────────────────────────────────────
  const ctx: GestureContext = {
    chart,
    series,
    container,
    manager,
    presets,
    workflow,
    chartId,
    nextId,
    armed: () => armed,
    presetProps: () => presetProps,
    setArmed,
    locked,
    draft: null as Draft | null,
    drag: null as Drag | null,
    transient,
    textEditOpen: () => textEdit !== null,
    openTextEdit: (drawing, x, y, fresh, how = 'click') => openTextEdit(drawing, x, y, fresh, how),
    openCellEdit: (drawing, cell) => openTextEdit(drawing, cell.rect.x + cell.rect.width / 2, cell.rect.y + cell.rect.height / 2, false, 'click', { row: cell.row, col: cell.col }),
    endTextEdit: () => cancelTextEdit(),
    openSettings,
    setHovered: (id) => {
      if (id === hovered) return
      hovered = id
      events.onHover?.(id)
    },
    persist,
    changed,
    clearTransients,
    cursorCss: () => (options.pointerSuppressed?.() ? 'none' : cursorCssFor(workflow().cursor, options.ink?.() ?? 'currentColor')),
    lockPointer,
    copies,
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
    if (locked() || !copies(source.type)) return false
    const copy = drawingTools.restore({ ...source, id: nextId(), anchors: shiftedAnchors(source.anchors, viewportOf(chart, series)) })
    if (!copy) return false
    stampNewScope(copy, chartId, workflow().syncAcrossPanes)
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

  /** The drawing the selection last stood on, so a selection that moves on knows what it left. */
  let selectedId: string | null = null
  const selectionChanged = (): void => {
    const now = manager.selected()?.id ?? null
    const left = selectedId
    selectedId = now
    if (left && left !== now) leaveSelection(left)
    events.onSelectionChange?.(now)
    changed()
  }

  /** The selection left a drawing: an inline edit open on it keeps what was typed, and a drawing of
   *  a tool that removes an empty drawing goes when it holds no words. That is judged once the
   *  work that moved the selection is done, so a drawing the selection left because it was being
   *  removed is already gone. */
  const leaveSelection = (id: string): void => {
    if (replacing) return
    if (pendingEdit?.drawing.id === id) endPendingEdit()
    if (textEdit?.id === id && textEdit.inline) commitInline(textEdit, manager.get(id)?.textDraft?.value ?? textEdit.value)
    queueMicrotask(() => dropWordless(id))
  }

  const dropWordless = (id: string): void => {
    if (destroyed || replacing) return
    const drawing = manager.get(id)
    if (!drawing || manager.selected()?.id === id || drawing.props.text !== '' || !inlineTextRules(drawing)?.removeEmptyOnDeselect) return
    wordless.delete(id)
    manager.remove(id)
    persist()
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

  // ── The low-level document operations ───────────────────────────────────────────────────────
  /** Validate a document against what this chart actually holds, then paint what survives.
   *
   *  A row this chart does not own (another chart's, inside a shared document) is not a rejection:
   *  it simply is not this chart's to draw, and it stays in the document untouched. A row that
   *  names a source or a pane this chart does not have, or names one it has but is not this
   *  layer's, comes back named: the alternative is to attach it to whatever is nearest, which
   *  silently moves a viewer's drawing onto the wrong series. */
  const applyDocument = (document: DrawingsBody, ref: ResourceRef | null, generation: number): DrawingApplyOutcome => {
    // The generation is read FIRST: an ask that a symbol switch has already overtaken is stale,
    // whatever it happens to hold, and calling it a mismatch would name the wrong problem.
    if (destroyed || generation !== documents.generation()) return { kind: 'refused', reason: 'stale' }
    const context = documents.contextFor(symbol)
    if (!context) return { kind: 'refused', reason: 'combined-mode' }
    if (!sameDrawingContext(document.context, context)) return { kind: 'refused', reason: 'context-mismatch' }
    const sources = new Set(liveSources())
    const panes = new Set(livePanes())
    const groups = new Set(liveDrawingGroups(document).map((group) => group.id))
    // The group each entry STATES, before the document's own reading drops a buried one: an entry
    // whose group is gone is the host's to resolve, so it is named rather than quietly ungrouped.
    const stated = new Map(document.entries.map((entry) => [entry.id, entry.group]))
    const rejected: DrawingRejection[] = []
    const rows: SerializedDrawing[] = []
    for (const entry of liveDrawingEntries(document)) {
      // Another chart's row is that chart's whether or not this build can read it, so whose it is
      // is read from the state's shape, and only this chart's rows are judged.
      const shape = drawingShapeOf(entry)
      if (shape && !ownsDrawing(shape, chartId)) continue
      const row = drawingOf(entry)
      const group = stated.get(entry.id)
      if (group !== undefined && !groups.has(group)) rejected.push({ id: entry.id, reason: 'deleted-group' })
      else if (!sources.has(entry.source)) rejected.push({ id: entry.id, reason: 'missing-source' })
      else if (!panes.has(entry.pane)) rejected.push({ id: entry.id, reason: 'missing-pane' })
      else if (entry.source !== owner.source || entry.pane !== owner.pane) rejected.push({ id: entry.id, reason: 'foreign-pane' })
      else if (!row) rejected.push({ id: entry.id, reason: 'unreadable' })
      else rows.push(row)
    }
    documents.adopt(symbol, document, ref)
    replaceScreen(rows)
    changed()
    return { kind: 'ok', applied: rows.length, rejected }
  }

  /** Each verb captures the layer's request generation before it awaits anything: a symbol switch
   *  bumps it, so an answer meant for the symbol that just left is refused as stale instead of
   *  landing on the one that arrived. */
  const documentApi: DrawingDocumentApi = {
    context: () => documents.contextFor(symbol),
    async get(signal) {
      const generation = documents.generation()
      const found = await documents.read(symbol, signal)
      const answer: DrawingReadOutcome = !found
        ? { kind: 'refused', reason: 'combined-mode' }
        : destroyed || generation !== documents.generation()
          ? { kind: 'refused', reason: 'stale' }
          : { kind: 'ok', ref: found.ref, document: found.document }
      return answer
    },
    apply: (document, ref) => applyDocument(document, ref ?? null, documents.generation()),
    async reload(signal) {
      const generation = documents.generation()
      const found = await documents.read(symbol, signal)
      if (!found) return { kind: 'refused', reason: 'combined-mode' }
      return applyDocument(found.document, found.ref, generation)
    },
  }

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
      const all = manager.all().filter((d) => !transient.has(d.id) && d.id !== ctx.draft?.drawing.id && !wordless.has(d.id))
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
    canPaste: () => clipboard !== null && !locked() && copies(clipboard.type),
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
      hiddenThisSession.add(sel.id)
      manager.deselect()
      persist()
      changed()
    },
    setVisibilityPreset(preset) {
      const sel = selection()
      if (!sel) return
      sel.updateOptions({ visibility: visibilityPreset(preset, parseTimeframeContext(timeframe)) })
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
      if (preset.props) drawing.applyProps(presetPropsFor(drawing, preset.props))
      drawing.applyProps({ dataUrl: image.dataUrl, width: placed.width, opacity: image.opacity ?? 1 })
      stampNewScope(drawing, chartId, workflow().syncAcrossPanes)
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
      openTextEdit(sel, hint?.x ?? first?.x ?? 0, hint?.y ?? first?.y ?? 0, false, 'command')
    },
    commitText: commitTextEdit,
    cancelText: cancelTextEdit,
    presets,
    documents: documentApi,
    setSymbol(next) {
      if (destroyed || next === symbol) return
      cancelDraft()
      cancelTextEdit()
      clearTransients()
      // A text left without words goes with the selection before the symbol's document goes up.
      const left = manager.selected()?.id ?? null
      manager.deselect()
      if (left) dropWordless(left)
      documents.sync(symbol, kept())
      documents.flush() // the old symbol's pending edit goes up before the switch
      clearScreen()
      symbol = next
      documents.bumpEpoch()
      importList(documents.listFor(next))
      documents.hydrate(next)
      changed()
    },
    setTimeframe(tf) {
      timeframe = tf
      manager.setTimeframeContext(parseTimeframeContext(tf))
    },
    setTick: (tick) => manager.setTickSize(tick),
    setCurrency: (code) => manager.setCurrencyCode(code),
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
      stopArtwork?.()
      identityRebinders.delete(handle)
      canCancelByHandle.delete(handle)
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
  canCancelByHandle.set(handle, () => !destroyed && (ctx.draft !== null || armed !== null || textEdit !== null || pendingEdit !== null || transient.size > 0))
  identityRebinders.set(handle, (id) => {
    if (destroyed || id === chartId) return
    closeTextEdit(false)
    documents.sync(symbol, kept())
    documents.flush()
    chartId = id
    documents.rebind()
    clearScreen()
    documents.hydrate(symbol)
  })
  return handle
}

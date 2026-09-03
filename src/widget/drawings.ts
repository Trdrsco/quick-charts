// The drawing plane: the layer, the default drawing UI over it, and the narrowed surface a host
// drives it through.
//
// The plane owns what no single surface should: the eye's state, the standing preferences the
// toolbar edits, the template presets every surface reads, and the mounting of the toolbar, the
// favorites bar, the selected drawing's settings bar, the inline text editor, the glyph and image
// pickers and the settings dialog. Every surface renders from the layer and the preferences and
// acts through the command registry, so a verb the host hides or refuses is refused from the
// glass exactly as it is from a host call.
//
// The public surface is a REAL subset of the layer's handle, not a type-level narrowing: symbol
// and timeframe flow, the tick grid, the price formatter and teardown stay chart-owned, so a host
// cannot desync the layer from the bars under it.
import type { ISeriesApi, IChartApi, SeriesType } from 'lightweight-charts'
import { attachDrawings, type DrawingsEvents, type DrawingsHandle, type DrawingsWorkflow, type PlacedImage, type TextEditSession } from '../drawings'
import {
  DEFAULT_HIDE_STATE,
  blanks,
  rememberRailTool,
  buildRailGroups,
  toggleFavorite,
  type CursorMode,
  type DrawingAssetPort,
  type DrawingPreferences,
  type HideState,
  type MagnetMode,
} from '../drawings/index'
import type { FeedBar } from '../datafeed'
import type { ChartI18n, ChartMessageKey, ChartTranslate } from '../i18n'
import type { ChartSaveLoadAdapter, ResourceRef } from '../resources'
import type { SemanticTheme } from '../theme/schema'
import { el } from '../ui/drawings/dom'
import { mountDrawingToolbar, type ToolbarHandle } from '../ui/drawings/toolbar'
import { mountFavoritesBar, type FavoritesBarHandle } from '../ui/drawings/favoritesBar'
import { mountSettingsBar, type SettingsBarHandle } from '../ui/drawings/settingsBar'
import { mountTextEditor, type TextEditorHandle } from '../ui/drawings/textEditor'
import { openSettingsDialog, type SettingsDialogHandle } from '../ui/drawings/settingsDialog'
import { openImagePicker, firstImageFile } from '../ui/drawings/imagePicker'
import { pushRecentGlyph } from '../ui/drawings/glyphPicker'
import { closeOverlays } from '../ui/drawings/overlays'
import type { AccessPolicy } from './options'
import type { CommandRegistry } from './commands'

/** The drawing surface a host drives: the layer's handle minus what the chart owns (symbol,
 *  timeframe, tick, price format, teardown) and minus the session verbs only the package's own
 *  surfaces use (the live `IDrawing`, the preview and edit session, the inline text session, the
 *  presets). The public surface grows on demand, not by exposure. */
export type ChartDrawingsApi = Omit<
  DrawingsHandle,
  'setSymbol' | 'setTimeframe' | 'setTick' | 'setPriceFormatter' | 'destroy' | 'selectedDrawing' | 'commitEdit' | 'beginPreview' | 'endPreview' | 'textEdit' | 'commitText' | 'cancelText' | 'presets'
>

/** The verbs the `chart.drawings.*` commands run that live above the layer: the standing
 *  preferences, the eye, favorites, templates and the dialogs. */
export interface DrawingVerbs {
  arm(arg: unknown): void
  setCursor(mode: CursorMode): void
  setMagnet(mode: MagnetMode): void
  setStayInMode(on: boolean): void
  setLockAll(on: boolean): void
  hide(): HideState
  setHide(state: HideState): void
  setSync(on: boolean): void
  setRemoveLocked(on: boolean): void
  toggleFavorite(tool: string): void
  setFavoritesBar(on: boolean): void
  openSettings(): void
  /** Apply a named template to the selection, or the tool's default for null. */
  applyTemplate(name: string | null): void
  saveTemplate(name: string): void
  removeTemplate(name: string): void
  tableAddRow(): void
  tableAddColumn(): void
  /** Whether the access policy permits arming a tool. */
  toolPermitted(tool: string): boolean
  /** Whether an inline text edit is open. */
  editing(): boolean
  /** Commit the open edit session as one edit. */
  commitEdit(): void
  /** Whether an image can be placed: an asset port is configured and the image tool permitted. */
  canPlaceImage(): boolean
  placeImage(image: PlacedImage): void
}

export interface DrawingsLayer {
  /** The narrowed public surface, or null when the drawings feature is off. */
  api: ChartDrawingsApi | null
  /** The full handle the chart itself drives. Null with the feature off. */
  handle: DrawingsHandle | null
  /** What the commands above the layer run. Null with the feature off. */
  verbs: DrawingVerbs | null
  /** Follow a symbol switch. */
  setSymbol(symbol: string): void
  setTimeframe(timeframe: string): void
  /** Push the chart's tick grid and price formatter, after a resolve or a language switch. */
  setPricing(tick: number | null, format: (price: number) => string): void
  /** Re-read every label after a language switch. */
  relabel(): void
  /** Re-render the surfaces after something they read moved (a preference, the layout). */
  refresh(): void
  destroy(): void
}

export interface DrawingsDeps {
  chart: IChartApi
  series: ISeriesApi<SeriesType>
  /** The gesture box the layer draws into. */
  container: HTMLElement
  /** The inert chrome subtree the surfaces mount into. */
  chrome: HTMLElement
  /** This chart's identity, which a drawing bound to one chart carries as its scope. */
  chartId: string
  symbol: string
  timeframe: string
  bars(): readonly FeedBar[]
  resources: ChartSaveLoadAdapter | null
  i18n: ChartI18n
  /** Whether the layer exists at all, and which of its surfaces are shown. */
  enabled: boolean
  toolbar: boolean
  favorites: boolean
  access?: AccessPolicy
  commands: CommandRegistry
  /** Where the image and glyph tools get their artwork, and how a picked file becomes a payload. */
  assets?: DrawingAssetPort
  /** The standing preference record, read live, and the one way to write it. */
  preferences(): DrawingPreferences
  setPreferences(next: DrawingPreferences): void
  /** The studies the eye reaches: how many there are, and the blanket over them. */
  indicators: { count(): number; setAllHidden(hidden: boolean): void }
  /** Charts in the layout, for the sync control. */
  chartCount(): number
  /** The resolved theme, read live: the dot cursor's ink and the text editor's family. */
  theme(): SemanticTheme
  /** A refused write the layer made on its own. */
  onSaveConflict(info: { symbol: string; current: ResourceRef | null; message: string }): void
  /** The armed tool or the selection changed. */
  onChange(kind: 'tool' | 'selection', id: string | null): void
}

export function attachDrawingsPlane(deps: DrawingsDeps): DrawingsLayer {
  if (!deps.enabled) {
    return {
      api: null,
      handle: null,
      verbs: null,
      setSymbol: () => undefined,
      setTimeframe: () => undefined,
      setPricing: () => undefined,
      relabel: () => undefined,
      refresh: () => undefined,
      destroy: () => undefined,
    }
  }

  // The translator is read at every call rather than captured, so a language switch reaches every
  // label the surfaces re-render without the surfaces being rebuilt.
  const live = ((...args: unknown[]) => (deps.i18n.t as unknown as (...a: unknown[]) => string)(...args)) as unknown as ChartTranslate
  const t = (): ChartTranslate => live
  const prefs = deps.preferences
  const write = (patch: Partial<DrawingPreferences>): void => {
    deps.setPreferences({ ...prefs(), ...patch })
    refresh()
  }

  /** The eye: one switch with a chosen subject. Session state, never persisted. */
  let hide: HideState = DEFAULT_HIDE_STATE
  /** What the status region says as the eye flips, by subject. */
  const HIDE_STATUS: Record<HideState['mode'], { hidden: ChartMessageKey; shown: ChartMessageKey }> = {
    drawings: { hidden: 'drawing.statusDrawingsHidden', shown: 'drawing.statusDrawingsShown' },
    indicators: { hidden: 'drawing.statusIndicatorsHidden', shown: 'drawing.statusIndicatorsShown' },
    all: { hidden: 'drawing.statusAllHidden', shown: 'drawing.statusAllShown' },
  }
  const groups = buildRailGroups()

  // The surfaces wire to the layer's events through a mutable events object: the layer needs its
  // events at construction and the surfaces need the layer's handle, so filling the object after
  // both exist resolves the cycle without holding state for it.
  const events: DrawingsEvents = {}
  const handle = attachDrawings({
    chart: deps.chart,
    series: deps.series,
    container: deps.container,
    symbol: deps.symbol,
    timeframe: deps.timeframe,
    chartId: deps.chartId,
    resources: deps.resources ? (scope) => deps.resources!.drawings(scope) : undefined,
    ...(deps.resources?.templates ? { templates: deps.resources.templates('drawing') } : {}),
    bars: deps.bars,
    workflow: (): DrawingsWorkflow => {
      const p = prefs()
      return { magnet: p.magnet, stayInDrawingMode: p.stayInDrawingMode, cursor: p.cursor, syncAcrossPanes: p.syncAcrossPanes }
    },
    ...(deps.assets ? { glyphSource: (glyph: string) => deps.assets!.glyphSource(glyph) } : {}),
    // The keyboard verbs go through the registry, so the access policy gates them like every door.
    execute: (command, arg) => deps.commands.execute(command, arg).kind === 'ok',
    ink: () => deps.theme()['text.primary'],
    events,
  })
  const idBase = `${deps.chartId}-drawing`
  // What a screen reader hears when a whole-chart switch flips: the eye and lock all change
  // nothing that reads as text, so the plane announces them itself.
  const status = el('div', { class: 'qc-drawing-status', role: 'status', 'aria-live': 'polite' })
  deps.chrome.appendChild(status)
  const announce = (text: string): void => {
    status.textContent = ''
    status.textContent = text
  }
  events.onSaveConflict = ({ symbol, current }) =>
    deps.onSaveConflict({ symbol, current, message: deps.i18n.t(current ? 'host.saveConflict' : 'host.saveNotFound') })

  /** A tool the access policy refuses is never armed, whichever door asked for it. */
  const permitted = (tool: string | null): boolean => {
    if (tool === null || !deps.access?.drawingTool) return true
    try {
      return deps.access.drawingTool(tool) !== false
    } catch {
      return false
    }
  }

  const run = (command: string, arg?: unknown): boolean => deps.commands.execute(command, arg).kind === 'ok'
  const available = (command: string): boolean => deps.commands.available(command)

  // ── The surfaces ────────────────────────────────────────────────────────────────────────────
  let toolbar: ToolbarHandle | null = null
  let favoritesBar: FavoritesBarHandle | null = null
  let settingsBar: SettingsBarHandle | null = null
  let textEditor: TextEditorHandle | null = null
  let dialog: SettingsDialogHandle | null = null
  let closeImagePicker: (() => void) | null = null

  if (deps.toolbar) {
    toolbar = mountDrawingToolbar({
      chrome: deps.chrome,
      t: t(),
      state: () => {
        const p = prefs()
        return {
          activeTool: handle.activeTool(),
          cursor: p.cursor,
          magnet: p.magnet,
          stayInDrawingMode: p.stayInDrawingMode,
          allLocked: handle.allLocked(),
          hide,
          sync: p.syncAcrossPanes,
          removeLocked: p.removeLocked,
          counts: handle.counts(),
          indicatorCount: deps.indicators.count(),
          railTools: p.railTools,
          favorites: p.favorites,
          recentGlyphs: p.recentGlyphs,
          layoutCharts: deps.chartCount(),
        }
      },
      run,
      available,
      toolAllowed: permitted,
      idBase,
      ...(deps.assets ? { glyphSource: (glyph: string) => deps.assets!.glyphSource(glyph) } : {}),
    })
  }
  if (deps.favorites) {
    favoritesBar = mountFavoritesBar({
      chrome: deps.chrome,
      t: t(),
      favorites: () => prefs().favorites,
      activeTool: () => handle.activeTool(),
      arm: (tool) => run('chart.drawings.arm', tool),
      available: () => available('chart.drawings.arm'),
      toolAllowed: permitted,
      onMove: (position) => write({ favorites: { ...prefs().favorites, position } }),
    })
  }
  settingsBar = mountSettingsBar({
    chrome: deps.chrome,
    t: t(),
    selected: () => handle.selected(),
    selectedProps: () => handle.selectedDrawing()?.props ?? null,
    presets: handle.presets,
    run,
    available,
    stackPosition: () => handle.stackPosition(),
    canPaste: () => handle.canPaste(),
    position: () => prefs().settingsBarPosition,
    onMove: (position) => write({ settingsBarPosition: position }),
  })

  const renderAll = (): void => {
    toolbar?.render()
    favoritesBar?.render()
    settingsBar?.render()
  }
  const refresh = renderAll

  events.onToolChange = (type) => {
    renderAll()
    deps.onChange('tool', type)
  }
  events.onSelectionChange = (id) => {
    renderAll()
    deps.onChange('selection', id)
  }
  events.onChange = renderAll
  events.onTextEdit = (session: TextEditSession | null) => {
    textEditor?.destroy()
    textEditor = null
    if (!session) return
    textEditor = mountTextEditor(session, {
      container: deps.chrome,
      gestures: deps.container,
      t: t(),
      fontFamily: deps.theme()['text.fontFamily'],
      onCommit: (value) => {
        textEditor = null
        handle.commitText(value)
      },
      onCancel: () => {
        textEditor = null
        handle.cancelText()
      },
    })
  }
  const unsubscribePresets = handle.presets.subscribe(renderAll)
  // The surfaces enable a control exactly when the registry would run its command, so they render
  // again whenever the registered set moves: the chart registers its commands after the plane
  // mounts, and a host may add or replace verbs later.
  const unsubscribeCommands = deps.commands.onChange(renderAll)

  // A system-clipboard IMAGE pasted over the chart becomes an image drawing, a quick path around
  // the Image tool's own dialog. Only an actual image file is taken; a copied drawing rides the
  // layer's own keys, and text pastes belong to whatever field is focused.
  const onPaste = (e: ClipboardEvent): void => {
    if (!deps.assets || !available('chart.drawings.placeImage')) return
    const target = e.target as HTMLElement | null
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
    if (!deps.container.matches(':hover')) return
    const file = firstImageFile(e.clipboardData?.files)
    if (!file) return
    e.preventDefault()
    void deps.assets.intakeImage(file).then((result) => {
      if (result.ok) run('chart.drawings.placeImage', result.asset)
    })
  }
  window.addEventListener('paste', onPaste)

  // ── The verbs above the layer ───────────────────────────────────────────────────────────────
  const applyHide = (next: HideState): void => {
    hide = next
    handle.setAllHidden(blanks(next, 'drawings'))
    deps.indicators.setAllHidden(blanks(next, 'indicators'))
    announce(t()(HIDE_STATUS[next.mode][next.on ? 'hidden' : 'shown']))
    renderAll()
  }

  const verbs: DrawingVerbs = {
    arm(arg) {
      const tool = arg === null || typeof arg === 'string' ? arg : arg && typeof arg === 'object' && typeof (arg as { tool?: unknown }).tool === 'string' ? (arg as { tool: string }).tool : undefined
      if (tool === undefined || !permitted(tool)) return
      const props = arg && typeof arg === 'object' && (arg as { props?: unknown }).props ? ((arg as { props: Record<string, unknown> }).props) : undefined
      // The Image tool opens its picker rather than arming: its picture is chosen first and then
      // dropped onto the chart, so there is nothing left to decide with a click.
      if (tool === 'image') {
        if (!deps.assets || closeImagePicker || !available('chart.drawings.placeImage')) return
        closeImagePicker = openImagePicker({
          container: deps.chrome,
          t: t(),
          assets: deps.assets,
          canPlace: () => available('chart.drawings.placeImage'),
          onConfirm: (image) => run('chart.drawings.placeImage', image),
          onClose: () => {
            closeImagePicker = null
          },
        })
        return
      }
      handle.armTool(tool, props)
      if (tool) {
        const patch: Partial<DrawingPreferences> = { railTools: rememberRailTool(groups, prefs().railTools, tool) }
        const glyph = props && typeof props.glyph === 'string' ? props.glyph : null
        if (glyph) patch.recentGlyphs = pushRecentGlyph(prefs().recentGlyphs, glyph)
        write(patch)
      }
    },
    setCursor(mode) {
      write({ cursor: mode })
      handle.armTool(null)
    },
    setMagnet(mode) {
      write({ magnet: mode, ...(mode === 'off' ? {} : { magnetStrength: mode }) })
    },
    setStayInMode: (on) => write({ stayInDrawingMode: on }),
    setLockAll(on) {
      handle.setAllLocked(on)
      announce(t()(on ? 'drawing.statusAllLocked' : 'drawing.statusAllUnlocked'))
      renderAll()
    },
    hide: () => hide,
    setHide: applyHide,
    setSync: (on) => write({ syncAcrossPanes: on }),
    setRemoveLocked: (on) => write({ removeLocked: on }),
    toggleFavorite: (tool) => write({ favorites: toggleFavorite(prefs().favorites, tool) }),
    setFavoritesBar: (on) => write({ favorites: { ...prefs().favorites, visible: on } }),
    openSettings() {
      const drawing = handle.selectedDrawing()
      if (!drawing || dialog) return
      // The dialog previews on the drawing; the document carries the snapshot until Ok commits.
      handle.beginPreview()
      dialog = openSettingsDialog({
        chrome: deps.chrome,
        t: t(),
        drawing,
        presets: handle.presets,
        idBase: `${idBase}-settings`,
        ...(deps.assets ? { assets: deps.assets } : {}),
        run,
        available,
        onClose: () => {
          handle.endPreview()
          dialog = null
          renderAll()
        },
      })
    },
    applyTemplate(name) {
      const drawing = handle.selectedDrawing()
      if (!drawing) return
      const preset = name === null ? handle.presets.defaultFor(drawing.type) : handle.presets.templatesFor(drawing.type).find((template) => template.name === name)
      if (!preset) return
      if (preset.style) handle.updateStyle(preset.style)
      if (preset.props) handle.updateProps(preset.props)
    },
    saveTemplate(name) {
      const drawing = handle.selectedDrawing()
      if (!drawing) return
      void handle.presets.saveTemplate(drawing.type, name, { style: { ...drawing.style }, props: { ...drawing.props } })
    },
    removeTemplate(name) {
      const drawing = handle.selectedDrawing()
      if (drawing) void handle.presets.removeTemplate(drawing.type, name)
    },
    tableAddRow() {
      const cells = (handle.selectedDrawing()?.props as { cells?: string[][] } | undefined)?.cells
      if (cells?.length) handle.updateProps({ cells: [...cells, cells[0]!.map(() => '')] })
    },
    tableAddColumn() {
      const cells = (handle.selectedDrawing()?.props as { cells?: string[][] } | undefined)?.cells
      if (cells?.length) handle.updateProps({ cells: cells.map((row) => [...row, '']) })
    },
    toolPermitted: (tool) => permitted(tool),
    editing: () => handle.textEdit() !== null,
    commitEdit: () => handle.commitEdit(),
    canPlaceImage: () => !!deps.assets && permitted('image'),
    placeImage: (image) => handle.placeImage(image),
  }

  // The public surface is the handle minus the five chart-owned verbs, with arming routed through
  // the access policy. Built by hand so an untyped consumer finds exactly what the type names.
  const {
    setSymbol: _s,
    setTimeframe: _t,
    setTick: _k,
    setPriceFormatter: _p,
    destroy: _d,
    armTool: _a,
    selectedDrawing: _sd,
    commitEdit: _ce,
    beginPreview: _bp,
    endPreview: _ep,
    textEdit: _te,
    commitText: _ct,
    cancelText: _cx,
    presets: _pr,
    ...rest
  } = handle
  return {
    handle,
    verbs,
    api: {
      ...rest,
      armTool: (type, props) => {
        if (permitted(type)) handle.armTool(type, props)
      },
    },
    setSymbol: (symbol) => {
      // A session belongs to the drawing it previews; the drawing leaves with its symbol.
      dialog?.close()
      handle.setSymbol(symbol)
    },
    setTimeframe: (timeframe) => handle.setTimeframe(timeframe),
    setPricing: (tick, format) => {
      handle.setTick(tick)
      handle.setPriceFormatter(format)
    },
    relabel() {
      toolbar?.relabel()
      favoritesBar?.render()
      settingsBar?.render()
    },
    refresh,
    destroy() {
      window.removeEventListener('paste', onPaste)
      unsubscribePresets()
      unsubscribeCommands()
      // Every overlay still open in the chrome (a flyout, a palette, a dialog and whatever it
      // opened) closes here, so no document listener outlives the plane.
      closeOverlays(deps.chrome)
      closeImagePicker?.()
      dialog?.close()
      textEditor?.destroy()
      settingsBar?.destroy()
      favoritesBar?.destroy()
      toolbar?.destroy()
      status.remove()
      handle.destroy()
    },
  }
}

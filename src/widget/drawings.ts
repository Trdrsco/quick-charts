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
import { drawingTools, type ToolPreset } from '../drawings/index'
import { rebindDrawingIdentity } from '../drawings/layer/attach'
import type { ReplayPhase } from './replay'
import {
  DEFAULT_HIDE_STATE,
  blanks,
  isBuiltInHideMode,
  rememberDrawingToolbarTool,
  buildDrawingToolbarGroups,
  toggleFavorite,
  type CursorMode,
  type DrawingAssetPort,
  type ImageIntakeError,
  IMAGE_ERROR_MESSAGES,
  type BuiltInHideMode,
  type DrawingPreferences,
  type HideState,
  type MagnetMode,
} from '../drawings/index'
import type { ChartExtensionHideLayer } from '../extension'
import type { FeedBar } from '../datafeed'
import type { ChartI18n, ChartMessageKey, ChartTranslate } from '../i18n'
import type { ChartSaveLoadAdapter, ResourceRef } from '../resources'
import type { DrawingDocumentPort } from '../drawings/layer/documents'
import type { DrawingDocumentApi } from '../drawings/layer/types'
import type { SemanticTheme } from '../theme/schema'
import { el } from '../ui/drawings/dom'
import { mountDrawingToolbar, type ToolbarHandle } from '../ui/drawings/toolbar'
import { mountFavoritesBar, type FavoritesBarHandle } from '../ui/drawings/favoritesBar'
import { mountSettingsBar, type SettingsBarHandle } from '../ui/drawings/settingsBar'
import { mountTextEditor, type TextEditorHandle } from '../ui/drawings/textEditor'
import { openSettingsDialog, type SettingsDialogHandle } from '../ui/drawings/settingsDialog'
import { openImagePicker, firstImageFile, humanSize } from '../ui/drawings/imagePicker'
import { pushRecentGlyph } from '../ui/drawings/glyphPicker'
import { closeOverlays } from '../ui/controls/overlays'
import type { AccessPolicy } from './options'
import { commandShown, drawingToolPermitted, drawingToolShown } from './access'
import { drawingToolOffered, type OfferedDrawingTools } from './drawingTools'
import type { CommandRegistry } from './commands'
import { drawingCancelAvailable } from '../drawings/layer/attach'
import { RECENT_COLOR_LIMIT } from '../ui/controls/color'
import type { IconResolver } from '../ui/icons/resolver'

/** A tool's default look: the style and props the tool itself opens with. It is NOT the look the
 *  layer remembers, because that is rewritten by every edit: the moment a viewer changes a colour it
 *  IS that colour, and resetting to it would put back exactly what they are trying to leave. The
 *  reset writes through the ordinary edit path, so what is remembered for the next drawing of the
 *  tool becomes this look too. */
const defaultPreset = (type: string): ToolPreset | undefined => {
  const fresh = drawingTools.create(type, 'default', [])
  return fresh ? { style: { ...fresh.style }, props: { ...fresh.props } } : undefined
}

const drawingToolOf = (arg: unknown): string | null | undefined =>
  arg === null || typeof arg === 'string'
    ? arg
    : arg && typeof arg === 'object' && typeof (arg as { tool?: unknown }).tool === 'string'
      ? (arg as { tool: string }).tool
      : undefined

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
  /** Whether the selection may be cloned: there is one, the host offers its tool and the access
   *  policy permits it. */
  canClone(): boolean
  /** Whether Cancel has an armed tool, placement, text edit or completed transient to clear. */
  canCancel(): boolean
  cancel(): void
  /** Commit the open edit session as one edit. */
  commitEdit(): void
  /** Whether an image can be placed: an asset port is configured and the image tool permitted. */
  canPlaceImage(): boolean
  placeImage(image: PlacedImage): void
}

export interface DrawingsLayer {
  mountToolbar(container: HTMLElement | null): void
  /** The narrowed public surface, or null when the drawings feature is off. */
  api: ChartDrawingsApi | null
  /** The low-level document operations, or null with the feature off. */
  documents: DrawingDocumentApi | null
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
  /** The set of contributed layers changed: re-apply what the eye is doing to the layers that
   *  exist now, releasing a subject that is gone, and re-list the eye's menu. */
  syncHideLayers(): void
  /** Private shared drawing toolbar transfer. It changes only the armed tool, never selection or
   *  gestures. */
  applyToolIntent(arg: unknown): void
  rebindIdentity(id: string): void
  destroy(): void
}

export interface DrawingsDeps {
  chart: IChartApi
  series: ISeriesApi<SeriesType>
  /** The gesture box the layer draws into. */
  container: HTMLElement
  /** The inert chrome subtree the surfaces mount into. */
  chrome: HTMLElement
  toolbarContainer?: HTMLElement | null
  /** This chart's identity within the document, for the DOM ids the surfaces mint. */
  chartId: string
  /** This chart's place in the layout: the identity a drawing bound to one chart carries as its
   *  scope, and the one a chart-local document is keyed by. */
  chartIdentity: { current(): string; set(value: string): void }
  /** The separate-drawing document port, or null in combined mode. */
  documents: DrawingDocumentPort | null
  /** Every source and pane on this chart a drawing could belong to, read live: what a restore
   *  validates a stored drawing against. */
  sources(): readonly string[]
  panes(): readonly string[]
  symbol: string
  timeframe: string
  bars(): readonly FeedBar[]
  /** The saved-resource adapter, for the TEMPLATE family alone: a tool's default and its named
   *  templates are the same wherever the drawings themselves are stored, so they never ride the
   *  persistence mode. Where the drawings go is `documents`. */
  resources: ChartSaveLoadAdapter | null
  i18n: ChartI18n
  /** Draws every glyph the drawing surfaces draw: the host's drawing for its icon, or the chart's own. */
  icons: IconResolver
  /** Whether the layer exists at all, and which of its surfaces are shown. */
  enabled: boolean
  toolbar: boolean
  favorites: boolean
  access?: AccessPolicy
  /** The drawing tools the host offers. Absent or null, every tool. */
  offered?: OfferedDrawingTools
  commands: CommandRegistry
  /** Where the image and glyph tools get their artwork, and how a picked file becomes a payload. */
  assets?: DrawingAssetPort
  /** The standing preference record, read live, and the one way to write it. */
  preferences(): DrawingPreferences
  setPreferences(next: DrawingPreferences): void
  /** The indicators the eye reaches: how many there are, and the blanket over them. */
  indicators: { count(): number; setAllHidden(hidden: boolean): void }
  /** The layers extensions offered the eye, read live: they list after the chart's own and
   *  `all` blanks them too. */
  hideLayers(): readonly ChartExtensionHideLayer[]
  /** Charts in the layout, for the sync control. */
  chartCount(): number
  /** The external drawing toolbar selected a tool for the layout rather than for one pane. */
  onSharedToolIntent?(arg: unknown): void
  /** Placement/cancel changed this pane's armed tool. */
  onToolState?(tool: string | null): void
  /** The resolved theme, read live: the dot cursor's ink and the text editor's family. */
  theme(): SemanticTheme
  /** Where replay stands. While it is `arming`, the plot draws no pointer glyph: the guide's rule
   *  and its shears are what say where a click would land. */
  replayPhase(): ReplayPhase
  /** A refused write the layer made on its own. */
  onSaveConflict(info: { symbol: string; current: ResourceRef | null; message: string }): void
  /** The armed tool changed, the selection changed, or a drawing was added, removed, restyled,
   *  locked, hidden or restacked. */
  onChange(kind: 'tool' | 'selection' | 'changed', id: string | null): void
}

export function attachDrawingsPlane(deps: DrawingsDeps): DrawingsLayer {
  if (!deps.enabled) {
    return {
      mountToolbar: () => undefined,
      api: null,
      documents: null,
      handle: null,
      verbs: null,
      syncHideLayers: () => undefined,
      setSymbol: () => undefined,
      setTimeframe: () => undefined,
      setPricing: () => undefined,
      relabel: () => undefined,
      refresh: () => undefined,
      applyToolIntent: () => undefined,
      rebindIdentity: () => undefined,
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
  const HIDE_STATUS: Record<BuiltInHideMode, { hidden: ChartMessageKey; shown: ChartMessageKey }> = {
    drawings: { hidden: 'drawing.statusDrawingsHidden', shown: 'drawing.statusDrawingsShown' },
    indicators: { hidden: 'drawing.statusIndicatorsHidden', shown: 'drawing.statusIndicatorsShown' },
    all: { hidden: 'drawing.statusAllHidden', shown: 'drawing.statusAllShown' },
  }
  const groups = buildDrawingToolbarGroups()

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
    chartId: deps.chartIdentity.current(),
    ...(deps.documents ? { documents: deps.documents } : {}),
    surface: { sources: deps.sources, panes: deps.panes },
    ...(deps.resources?.templates ? { templates: deps.resources.templates('drawing') } : {}),
    bars: deps.bars,
    workflow: (): DrawingsWorkflow => {
      const p = prefs()
      return { magnet: p.magnet, stayInDrawingMode: p.stayInDrawingMode, cursor: p.cursor, syncAcrossPanes: p.syncAcrossPanes }
    },
    ...(deps.assets?.glyphSource ? { glyphSource: (glyph: string) => deps.assets!.glyphSource!(glyph) } : {}),
    // The keyboard verbs go through the registry, so the access policy gates them like every door.
    execute: (command, arg) => deps.commands.execute(command, arg).kind === 'ok',
    ink: () => deps.theme()['text.primary'],
    // While replay is waiting to be told where to begin, the plot's own mark is the answer to where
    // a click lands. This layer owns the plot's cursor, so it is the one that stands it down.
    pointerSuppressed: () => deps.replayPhase() === 'arming',
    // A clone, a paste and a modifier-drag duplicate each make a new drawing, so a tool the host's
    // list leaves out or the access policy refuses is copied by none of them. Asked live, so a
    // policy that changes moves with it.
    copies: (type) => drawingToolOffered(deps.offered ?? null, type) && drawingToolPermitted(deps.access, type),
    events,
  })
  const idBase = `${deps.chartId}-drawing`
  // What a screen reader hears when a whole-chart switch flips: the eye and lock all change
  // nothing that reads as text, so the plane announces them itself.
  const status = el('div', { class: 'qc-drawing-status', role: 'status', 'aria-live': 'polite' })
  deps.chrome.appendChild(status)
  let destroyed = false
  const announce = (text: string): void => {
    if (destroyed) return
    status.textContent = ''
    status.textContent = text
  }
  events.onSaveConflict = ({ symbol, current }) =>
    deps.onSaveConflict({ symbol, current, message: deps.i18n.t(current ? 'host.saveConflict' : 'host.saveNotFound') })

  /** Whether the host's list offers a tool. A tool it leaves out is never armed and never drawn,
   *  and no copy of a drawing of it is made; drawings of it already on the chart stay editable. */
  const offered = (tool: string | null): boolean => drawingToolOffered(deps.offered ?? null, tool)
  /** A tool the list leaves out or the access policy refuses is never armed, whichever door asked
   *  for it. */
  const permitted = (tool: string | null): boolean => offered(tool) && drawingToolPermitted(deps.access, tool)
  // What the drawing toolbar, the favorites bar, the glyph picker and the selection's bar draw:
  // every offered tool, unless the host hides what its policy refuses.
  const toolShown = (tool: string): boolean => offered(tool) && drawingToolShown(deps.access, tool)
  const shown = (command: string): boolean => commandShown(deps.access, command)

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
      container: deps.toolbarContainer,
      t: t(),
      icons: deps.icons,
      state: () => {
        const p = prefs()
        return {
          activeTool: handle.activeTool(),
          cursor: p.cursor,
          magnet: p.magnet,
          stayInDrawingMode: p.stayInDrawingMode,
          allLocked: handle.allLocked(),
          hide,
          hideLayers: deps.hideLayers(),
          sync: p.syncAcrossPanes,
          removeLocked: p.removeLocked,
          counts: handle.counts(),
          indicatorCount: deps.indicators.count(),
          drawingToolbarTools: p.drawingToolbarTools,
          favorites: p.favorites,
          recentGlyphs: p.recentGlyphs,
          layoutCharts: deps.chartCount(),
        }
      },
      run: (command, arg) => {
        const ok = run(command, arg)
        const tool = drawingToolOf(arg)
        // Image opens a picker immediately; it never leaves a pointer tool armed to transfer.
        if (ok && command === 'chart.drawings.arm' && tool !== undefined && tool !== 'image') deps.onSharedToolIntent?.(arg)
        return ok
      },
      available,
      shown,
      toolAllowed: permitted,
      toolShown,
      idBase,
      ...(deps.assets?.glyphSource ? { glyphSource: (glyph: string) => deps.assets!.glyphSource!(glyph) } : {}),
    })
  }
  if (deps.favorites) {
    favoritesBar = mountFavoritesBar({
      chrome: deps.chrome,
      t: t(),
      icons: deps.icons,
      favorites: () => prefs().favorites,
      activeTool: () => handle.activeTool(),
      arm: (tool) => run('chart.drawings.arm', tool),
      available: () => available('chart.drawings.arm'),
      toolAllowed: permitted,
      // Every favorite arms its tool, so a host that hides a refused arm leaves them all out.
      toolShown: (tool) => shown('chart.drawings.arm') && toolShown(tool),
      onMove: (position) => write({ favorites: { ...prefs().favorites, position } }),
    })
  }
  settingsBar = mountSettingsBar({
    chrome: deps.chrome,
    t: t(),
    icons: deps.icons,
    selected: () => handle.selected(),
    selectedProps: () => handle.selectedDrawing()?.props ?? null,
    presets: handle.presets,
    run,
    available,
    shown,
    stackPosition: () => handle.stackPosition(),
    position: () => prefs().settingsBarPosition,
    onMove: (position) => write({ settingsBarPosition: position }),
    recentColors: () => prefs().recentColors,
    // Newest first, and a colour mixed again moves back to the front rather than sitting twice.
    onMixColor: (hex) => write({ recentColors: [hex, ...prefs().recentColors.filter((c) => c !== hex)].slice(0, RECENT_COLOR_LIMIT) }),
  })

  const renderAll = (): void => {
    toolbar?.render()
    favoritesBar?.render()
    settingsBar?.render()
  }
  const refresh = renderAll

  events.onToolChange = (type) => {
    renderAll()
    deps.onToolState?.(type)
    deps.onChange('tool', type)
  }
  events.onSelectionChange = (id) => {
    renderAll()
    deps.onChange('selection', id)
  }
  events.onChange = () => {
    renderAll()
    deps.onChange('changed', null)
  }
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
    // The port owns what an image may be, and it names each refusal. A paste that goes nowhere with
    // nothing said is the worst of the three outcomes, so every refusal is spoken here in the
    // chart's own words, and a port that throws reads as a file that could not be read.
    const refuse = (error: ImageIntakeError, bytes?: number): void => announce(t()(IMAGE_ERROR_MESSAGES[error], { size: bytes === undefined ? '' : humanSize(bytes) }))
    void deps.assets
      .intakeImage(file)
      .then((result) => {
        if (destroyed) return
        if (result.ok) run('chart.drawings.placeImage', result.asset)
        else refuse(result.error, result.bytes)
      })
      .catch(() => refuse('unreadable'))
  }
  window.addEventListener('paste', onPaste)

  // ── The verbs above the layer ───────────────────────────────────────────────────────────────
  /** Every layer the eye reaches now, contributed ones included: a subject the eye cannot find is
   *  not one it can point at. */
  const hideLayerOf = (mode: string): ChartExtensionHideLayer | undefined => deps.hideLayers().find((layer) => layer.id === mode)
  const applyHide = (next: HideState): void => {
    if (!isBuiltInHideMode(next.mode) && !hideLayerOf(next.mode)) return
    hide = next
    handle.setAllHidden(blanks(next, 'drawings'))
    deps.indicators.setAllHidden(blanks(next, 'indicators'))
    for (const layer of deps.hideLayers()) {
      try {
        layer.apply(blanks(next, layer.id))
      } catch {
        /* a contributed layer's own failure is its own; the eye carries on */
      }
    }
    const status = isBuiltInHideMode(next.mode) ? t()(HIDE_STATUS[next.mode][next.on ? 'hidden' : 'shown']) : (hideLayerOf(next.mode)?.label[next.on ? 'hide' : 'show'] ?? '')
    announce(status)
    renderAll()
  }
  /** A layer that arrived takes the eye's current state at once; a subject that left releases the
   *  eye to its resting state, so nothing stays blanked under a subject nobody can see. */
  const syncHideLayers = (): void => {
    if (!isBuiltInHideMode(hide.mode) && !hideLayerOf(hide.mode)) applyHide(DEFAULT_HIDE_STATE)
    else applyHide(hide)
  }

  const verbs: DrawingVerbs = {
    arm(arg) {
      const tool = drawingToolOf(arg)
      if (tool === undefined || !permitted(tool)) return
      const props = arg && typeof arg === 'object' && (arg as { props?: unknown }).props ? ((arg as { props: Record<string, unknown> }).props) : undefined
      // The Image tool opens its picker rather than arming: its picture is chosen first and then
      // dropped onto the chart, so there is nothing left to decide with a click.
      if (tool === 'image') {
        if (!deps.assets || closeImagePicker || !available('chart.drawings.placeImage')) return
        closeImagePicker = openImagePicker({
          container: deps.chrome,
          t: t(),
          icons: deps.icons,
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
        const patch: Partial<DrawingPreferences> = { drawingToolbarTools: rememberDrawingToolbarTool(groups, prefs().drawingToolbarTools, tool) }
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
        icons: deps.icons,
        drawing,
        presets: handle.presets,
        idBase: `${idBase}-settings`,
        ...(deps.assets ? { assets: deps.assets } : {}),
        run,
        available,
        shown,
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
      const preset = name === null ? defaultPreset(drawing.type) : handle.presets.templatesFor(drawing.type).find((template) => template.name === name)
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
    canClone: () => {
      const type = handle.selected()?.type
      return type !== undefined && permitted(type)
    },
    canCancel: () => drawingCancelAvailable(handle),
    cancel: () => handle.armTool(null),
    commitEdit: () => handle.commitEdit(),
    canPlaceImage: () => !!deps.assets && permitted('image'),
    placeImage: (image) => handle.placeImage(image),
  }

  // The public surface is the handle minus the five chart-owned verbs, with arming routed through
  // the host's list and the access policy, and image placement likewise. Built by hand so
  // an untyped consumer finds exactly what the type names.
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
    mountToolbar: (container) => toolbar?.mount(container),
    handle,
    documents: handle.documents,
    verbs,
    api: {
      ...rest,
      armTool: (type, props) => {
        if (permitted(type)) handle.armTool(type, props)
      },
      // A placed picture is a new image drawing, so it asks what arming the image tool asks: a host
      // whose list leaves the tool out, or whose policy refuses it, places none.
      placeImage: (image) => {
        if (permitted('image')) handle.placeImage(image)
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
    syncHideLayers,
    applyToolIntent: (arg) => verbs.arm(arg),
    rebindIdentity(id) {
      deps.chartIdentity.set(id)
      rebindDrawingIdentity(handle, id)
    },
    destroy() {
      destroyed = true
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

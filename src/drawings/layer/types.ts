// The drawing layer's contracts: what a host hands `attachDrawings`, what it gets back, and the
// events the layer reports. Everything here is a type; the behavior lives in the sibling modules.
import type { IChartApi, ISeriesApi, SeriesType } from 'lightweight-charts'
import type { DrawingStyle, GlyphSourcePort, IDrawing, LineStyle, SerializedDrawing, VisibilityPreset } from '@trdrs/chart-drawings'
import type { ResourceRef, ResourceStore, TemplateBody, TemplateMeta } from '../../resources'
import type { DrawingResourceContext, DrawingsBody } from '../document'
import type { DrawingDocumentPort, DrawingOwner } from './documents'
import type { FeedBar } from '../../datafeed'
import type { CursorMode } from '../cursorModel'
import type { MagnetMode } from '../magnetModel'
import type { DrawingCounts } from '../lockModel'
import type { ToolPreset, ToolTemplate } from '../templates'

/** The standing workflow choices this layer CONSULTS. It owns none of them: a host holds them in
 *  its `DrawingPreferences` record and the models on `quickcharts/drawings` decide what each
 *  control does to them, so a toolbar and this layer cannot disagree about what "weak magnet" or
 *  "stay in drawing mode" means. The layer reads them at the moment each one matters, which is
 *  why this is a getter rather than a set of setters: there is no second copy to keep in step. */
export interface DrawingsWorkflow {
  /** How hard an anchor pulls to a bar's OHLC values while it is placed or dragged. */
  magnet: MagnetMode
  /** A host-imposed lock: editing is suspended across the layer, new drawings included, without
   *  touching any drawing's own flag. The layer's own lock-all switch (`setAllLocked`) is the
   *  toolbar's door to the same mode; either one refuses. */
  allLocked?: boolean
  /** A placed tool stays armed for the next drawing. */
  stayInDrawingMode: boolean
  /** The pointer glyph over the chart. */
  cursor: CursorMode
  /** A NEW drawing is shared by every chart of the same symbol (the default). Off, it is bound to
   *  this chart alone through the scope's `chartId`; a drawing that exists never changes hands. */
  syncAcrossPanes?: boolean
}

/** The selected drawing as a settings surface reads it: the style channels a bar edits, the
 *  lifecycle flags, and what kind of content the drawing carries. A snapshot, taken again on
 *  every change, so a surface never holds the live object. */
export interface SelectedDrawing {
  id: string
  type: string
  lineColor: string
  lineWidth: number
  lineStyle: LineStyle
  fillColor: string
  fillOpacity: number
  textColor: string
  fontSize: number
  bold: boolean
  italic: boolean
  locked: boolean
  /** The drawing carries a `text` prop, so the text controls apply. */
  hasText: boolean
  /** The drawing is a table (a `cells` grid), so the row and column controls apply. */
  hasCells: boolean
}

/** An open inline text edit, in pane-local pixels. The editor renders the text in the drawing's own
 *  style at the drawing's own place, so committing swaps pixels with the painted text. */
export interface TextEditSession {
  id: string
  x: number
  y: number
  value: string
  /** The edit opened as part of placing this drawing: cancelling (or committing empty) removes it. */
  fresh: boolean
  color: string
  fontSize: number
  bold: boolean
  italic: boolean
  /** Radians; a two-point drawing's text rides the segment's slope. */
  angle: number
  /** Set when the edit targets one table cell instead of the drawing's `text` prop. */
  cell?: { row: number; col: number }
}

/** A picture ready to place: what the image picker or a paste hands the layer. */
export interface PlacedImage {
  dataUrl: string
  width: number
  height: number
  /** 0..1; omitted is opaque. */
  opacity?: number
}

/** Tool defaults and named templates, read synchronously. The layer reads a tool's default on the
 *  placement path, between a press and the drawing appearing, and a template menu reads inside a
 *  render; neither can await. So the store is read once into this cache, every reader answers from
 *  it at once, and every write updates the cache and then goes up. */
export interface DrawingPresets {
  /** The preset applied to NEW drawings of a type (empty when none is remembered). */
  defaultFor(type: string): ToolPreset
  /** The named templates saved for a type, in the store's order. */
  templatesFor(type: string): readonly ToolTemplate[]
  /** Save (or replace) a named template. */
  saveTemplate(type: string, name: string, preset: ToolPreset): Promise<void>
  removeTemplate(type: string, name: string): Promise<void>
  /** Forget a tool's remembered default, so new drawings start from the factory style again. */
  clearDefault(type: string): Promise<void>
  /** Hear every change: a hydration landing, a save, a remove. Returns the unsubscribe. */
  subscribe(listener: () => void): () => void
}

/** Why a low-level document operation refused. Machine-readable on purpose: these answer a host's
 *  code, not a trader, so nothing here is a sentence to render. */
export type DrawingDocumentRefusal =
  /** The widget runs in combined mode: its drawings ride whatever saves the chart, and there is no
   *  separate document to get, apply or reload. */
  | 'combined-mode'
  /** The document names another context than the one this chart reads. It is not merged in: a
   *  document for another layout, chart or symbol has no business on this chart. */
  | 'context-mismatch'
  /** A newer ask for this chart started while this one was in flight, so this answer is for a
   *  layout, chart or symbol that has moved on. Nothing was changed. */
  | 'stale'

/** Why one drawing in a document was not applied. The rest of the document still applies: one
 *  unusable row is not a reason to leave the trader with an empty chart. */
export type DrawingRejectionReason =
  /** Its owning source is not on this chart (an indicator that is gone, a series never added). */
  | 'missing-source'
  /** Its pane is not on this chart. */
  | 'missing-pane'
  /** Its source and pane are both on this chart, but they are not the ones this layer draws on.
   *  The drawing stays where it belongs rather than being moved into this pane. */
  | 'foreign-pane'
  /** Its group was deleted. The row is not applied under a group that no longer exists. */
  | 'deleted-group'
  /** Its state is not a drawing this build can read. */
  | 'unreadable'

export interface DrawingRejection {
  id: string
  reason: DrawingRejectionReason
}

export type DrawingReadOutcome =
  | { kind: 'ok'; ref: ResourceRef | null; document: DrawingsBody }
  | { kind: 'refused'; reason: DrawingDocumentRefusal }

export type DrawingApplyOutcome =
  | { kind: 'ok'; applied: number; rejected: readonly DrawingRejection[] }
  | { kind: 'refused'; reason: DrawingDocumentRefusal }

/** The low-level separate-drawing operations. Three verbs over one document, each carrying its own
 *  request generation so a late answer for an old layout, chart or symbol can never mutate the
 *  chart that is on screen now, and each taking an `AbortSignal` so an abandoned ask stops. */
export interface DrawingDocumentApi {
  /** The context this chart's document is keyed by, or null in combined mode. */
  context(): DrawingResourceContext | null
  /** Read the stored document and the ref it stands at, without touching the chart. */
  get(signal?: AbortSignal): Promise<DrawingReadOutcome>
  /** Put a document on the chart. Every entry is validated against the live sources and panes
   *  first; the ones that pass replace what is on screen, and the ones that do not come back named
   *  with their reason. Synchronous, because applying a document the caller already holds reaches
   *  no store.
   *
   *  Pass the `ref` the document was read at and the layer's next write is an update at that
   *  revision. Without one it holds no ref, so its next write creates, is refused by the document
   *  that is already stored, and learns the ref from that conflict: correct, but a round trip a
   *  caller that just read the document need not pay. A document a host composed itself stands at
   *  no revision, which is why the ref is optional. */
  apply(document: DrawingsBody, ref?: ResourceRef | null): DrawingApplyOutcome
  /** Read the stored document and apply it: the reload path after a reconnect or a save elsewhere. */
  reload(signal?: AbortSignal): Promise<DrawingApplyOutcome>
}

export interface DrawingsEvents {
  /** The armed tool changed (null = cursor). Fired by armTool and by auto-disarm after placement. */
  onToolChange?: (type: string | null) => void
  /** The selection changed (null = nothing selected). */
  onSelectionChange?: (id: string | null) => void
  /** A write of a symbol's document was refused: the stored document moved on (`current` is the
   *  ref that stands now) or vanished (null). The layer merges the stored document over its own
   *  work and writes again at the adopted ref; the host decides what to tell the trader. */
  onSaveConflict?: (info: { symbol: string; current: ResourceRef | null }) => void
  /** Anything a toolbar or a settings surface renders from changed: a drawing was added, removed,
   *  restyled, locked, hidden or restacked, or the layer's own switches moved. */
  onChange?: () => void
  /** An inline text edit opened (a session) or closed (null). */
  onTextEdit?: (session: TextEditSession | null) => void
  /** The drawing under the resting pointer changed (null = none). */
  onHover?: (id: string | null) => void
}

export interface AttachDrawingsOptions {
  chart: IChartApi
  series: ISeriesApi<SeriesType>
  /** The chart's mount element: pointer events bind here, and it receives focus on interaction so
   *  the keyboard verbs stay scoped to this widget instead of the whole page. */
  container: HTMLElement
  symbol: string
  /** Timeframe token ('5m', '1d', ...), which drives per-interval drawing visibility. */
  timeframe?: string
  /** SEPARATE-drawing persistence: which drawing-resource context a symbol's document is keyed by,
   *  and the store for that context. Absent is the COMBINED mode: the layer keeps its documents in
   *  memory for the page and whatever saves the chart carries them. There is no third mode and no
   *  reader between the two. */
  documents?: DrawingDocumentPort
  /** The chart surface this layer draws on, and what else the chart holds a drawing could belong
   *  to. A restore validates every entry against these. Absent, the layer draws on the main series
   *  in the main pane and the chart holds nothing else. */
  surface?: {
    /** What this layer draws on. Default: the main series in the main pane. */
    owner?: DrawingOwner
    /** Every source a drawing may legitimately name on this chart, read live. */
    sources?: () => readonly string[]
    /** Every pane a drawing may legitimately name on this chart, read live. */
    panes?: () => readonly string[]
  }
  /** The adapter's drawing-template family, which tool defaults and named templates ride. Absent,
   *  both last the page. */
  templates?: ResourceStore<TemplateMeta, TemplateBody>
  /** This chart's identity for drawings bound to one chart (sync off). Absent, every drawing is
   *  shared and the sync switch has nothing to bind to. */
  chartId?: string
  /** Bar reader for data-driven drawings (a restored anchored VWAP still computes). */
  bars?: () => readonly FeedBar[]
  /** Where glyph artwork comes from, from the host's drawing asset port. Per layer, so two charts
   *  in one document may be handed different asset sets. */
  glyphSource?: GlyphSourcePort
  /** The standing workflow choices, read live. Absent, the layer runs on the defaults: no magnet,
   *  nothing locked, a placed tool released, a crosshair, drawings shared. */
  workflow?: () => DrawingsWorkflow
  /** The door every keyboard verb goes through. A widget hands the command registry's `execute`
   *  here so Delete, Escape, copy and paste answer to the access policy like every other verb;
   *  absent, the layer runs the verb itself. Answers whether the command ran. */
  execute?: (command: string, arg?: unknown) => boolean
  /** The ink the dot cursor's ring is drawn in, read when the cursor is set: the chart passes its
   *  text role, so the ring follows the theme. */
  ink?: () => string
  events?: DrawingsEvents
}

/** The running drawing layer a host holds. */
export interface DrawingsHandle {
  /** Arm a registry tool, one of the transient tools (`measure`, `zoom`, `eraser`), or null for
   *  the cursor. `props` seed the next placement (a picked glyph). Throws for an unknown tool. */
  armTool(type: string | null, props?: Record<string, unknown>): void
  activeTool(): string | null
  select(id: string): void
  deselect(): void
  hasSelection(): boolean
  /** The selected drawing's snapshot, or null. */
  selected(): SelectedDrawing | null
  /** The live selected drawing, for a settings dialog that edits it directly and then calls
   *  `commitEdit`. Null when nothing is selected. */
  selectedDrawing(): IDrawing | null
  /** The drawing under the resting pointer, or null. */
  hovered(): string | null
  deleteSelected(): void
  /** Remove every drawing for the CURRENT symbol. Locked drawings survive unless asked. */
  clearAll(includeLocked?: boolean): void
  /** Live drawings on the current symbol. */
  count(): number
  /** Every drawing and how many of them are locked, for the remove menu. */
  counts(): DrawingCounts
  /** Restyle the selection; the edit becomes the tool's remembered default. */
  updateStyle(patch: Partial<DrawingStyle>): void
  /** Patch the selection's props; the edit becomes the tool's remembered default. */
  updateProps(patch: Record<string, unknown>): void
  setLocked(locked: boolean): void
  /** Commit a dialog session that edited the live drawing directly: persist, remember the default,
   *  and report one change. */
  commitEdit(): void
  /** Open a preview session on the selection: until `endPreview` or `commitEdit`, every write of
   *  the document carries the snapshot taken here, not the live preview, so a persist that
   *  arrives from outside (a symbol switch, a restore) cannot store what may still be cancelled. */
  beginPreview(): void
  endPreview(): void
  /** Duplicate the selection a few pixels to the right and select the copy. */
  clone(): void
  /** Copy the selection to the drawing clipboard, which lasts the page. */
  copy(): void
  /** Paste the clipboard beside its source. Answers whether anything landed. */
  paste(): boolean
  canPaste(): boolean
  bringToFront(): void
  sendToBack(): void
  bringForward(): void
  sendBackward(): void
  /** Where the selection sits in the paint order, so a menu disables the moves that cannot apply. */
  stackPosition(): { atFront: boolean; atBack: boolean }
  /** Hide the selection (its own `visible` switch) and deselect it. */
  hideSelected(): void
  /** Apply one of the quick per-interval visibility rules to the selection, against the current
   *  timeframe. */
  setVisibilityPreset(preset: VisibilityPreset): void
  /** Drop a ready picture onto the chart, centred in view, selected. */
  placeImage(image: PlacedImage): void
  /** Blank every drawing (the eye), without touching any drawing's own switch. */
  setAllHidden(hidden: boolean): void
  allHidden(): boolean
  /** Suspend editing across the layer, new drawings included (the toolbar's lock-all). */
  setAllLocked(locked: boolean): void
  allLocked(): boolean
  /** The open inline text edit, or null. */
  textEdit(): TextEditSession | null
  /** Open the inline editor on the selection's text, when it carries any. */
  editSelectedText(): void
  commitText(value: string): void
  cancelText(): void
  /** Tool defaults and named templates. */
  presets: DrawingPresets
  /** The low-level separate-drawing document operations. */
  documents: DrawingDocumentApi
  setSymbol(symbol: string): void
  setTimeframe(tf: string): void
  /** The symbol's smallest price move (tick-denominated readouts on measure-style drawings); null
   *  while the symbol is unresolved. */
  setTick(tick: number | null): void
  /** The symbol's price formatter: every drawing label, pill and readout writes prices through it.
   *  Null returns the layer to the drawings package's declared stand-in. */
  setPriceFormatter(format: ((price: number) => string) | null): void
  /** Serialize the current symbol's drawings (the persistence wire format). */
  export(): SerializedDrawing[]
  /** Replace the current symbol's drawings from serialized form. */
  restore(list: readonly SerializedDrawing[]): void
  destroy(): void
}

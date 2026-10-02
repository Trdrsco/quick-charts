// Undo and redo over one chart's own content.
//
// A step is a SNAPSHOT, never a stack of inverse operations. The chart already states everything it
// is showing in one value and takes one back whole, so nothing here has to know how to reverse a
// particular verb, and a field added to that value is covered the moment it joins it. Two stacks
// hold those readings, each with the word for what changed, which is what lets a control say what
// it would take back rather than only that it would take something back.
//
// Recording is a DIFF on a trigger. The plane reads the content, compares it with the last reading,
// and files the last reading when the two differ; a trigger that fires on nothing files nothing, so
// the trigger only has to be a SUPERSET of the ways content moves rather than an exact list of
// them. Readings are coalesced into one pass per tick, so one gesture that moves three fields
// leaves one step behind rather than three, and a pointer gesture is read after the surface it
// moved has settled.
//
// Putting a reading back re-enters every lane the trigger listens to. The plane therefore holds an
// APPLYING window while the chart settles under its own apply and files nothing inside it. The
// window closes when the reading matches what was applied, or after a small number of passes,
// because an apply's own policy may legitimately settle somewhere else (restoring a percentage
// comparison moves the price scale) and a window that waited for an exact match would never close.
import type { SerializedDrawing } from '../internal/drawings/index'
import type { ChartMessageKey } from '../i18n'
import type { ChartContent } from './saveLoad'

/** How many steps back one chart keeps. The oldest falls off the far end, so a long session costs
 *  a bounded amount of memory rather than growing for as long as the chart is open. */
export const HISTORY_LIMIT = 100

/** How many coalesced passes an apply is given to settle before the window closes on its own. An
 *  apply lands synchronously, but the work it starts does not: a symbol change loads, and a
 *  restored comparison may move the scale after the scale was already set. */
export const HISTORY_SETTLE_PASSES = 4

/** What one step says changed, in the order a diff asks. */
export type HistoryChange =
  | 'symbol'
  | 'timeframe'
  | 'style'
  | 'priceScale'
  | 'appearance'
  | 'compareAdd'
  | 'compareRemove'
  | 'compareChange'
  | 'indicatorAdd'
  | 'indicatorRemove'
  | 'indicatorChange'
  | 'drawingAdd'
  | 'drawingRemove'
  | 'drawingChange'

/** The catalog key each change wears, so a control names the step in the viewer's language. */
export const HISTORY_CHANGE_LABELS: Readonly<Record<HistoryChange, ChartMessageKey>> = {
  symbol: 'history.changeSymbol',
  timeframe: 'history.changeTimeframe',
  style: 'history.changeChartStyle',
  priceScale: 'history.changePriceScale',
  appearance: 'history.changeAppearance',
  compareAdd: 'history.changeAddCompare',
  compareRemove: 'history.changeRemoveCompare',
  compareChange: 'history.changeCompare',
  indicatorAdd: 'history.changeAddIndicator',
  indicatorRemove: 'history.changeRemoveIndicator',
  indicatorChange: 'history.changeIndicator',
  drawingAdd: 'history.changeAddDrawing',
  drawingRemove: 'history.changeRemoveDrawing',
  drawingChange: 'history.changeDrawing',
}

/** One reading of a chart: its content, plus the drawings the content does not carry. In combined
 *  storage the content holds the drawings and this is null; in separate storage they are the
 *  layer's own and ride here, so a step back puts them back either way. */
export interface HistoryState {
  content: ChartContent
  drawings: readonly SerializedDrawing[] | null
}

/** One step: the reading to go back to, and the word for what moved after it. */
export interface HistoryStep {
  state: HistoryState
  label: HistoryChange
}

/** The undo surface a control and a command read. */
export interface ChartHistoryApi {
  canUndo(): boolean
  canRedo(): boolean
  /** What the next undo would take back, or null when there is nothing to take back. */
  undoChange(): HistoryChange | null
  /** What the next redo would put back, or null when there is nothing to put back. */
  redoChange(): HistoryChange | null
  undo(): void
  redo(): void
}

/** The drawings a reading holds when the content does not carry them. */
export interface HistoryDrawingsPort {
  snapshot(): readonly SerializedDrawing[] | null
  restore(drawings: readonly SerializedDrawing[]): void
}

export interface HistoryDeps {
  /** Whether the feature is on at all. Off records nothing and neither verb does anything. */
  enabled: boolean
  /** This chart's content, as the save format states it. */
  content(): ChartContent
  /** The symbol on screen, read on its own so a settling pass does not pay for a whole content
   *  read to learn whether a symbol change has landed yet. */
  symbol(): string
  /** Put one reading back. */
  apply(content: ChartContent): void
  /** Separate-mode drawings, which the content does not carry. Null when the content carries them. */
  drawings: HistoryDrawingsPort | null
  disposed(): boolean
  /** Where the pointer sweep binds. Null runs the plane without one, which is what a model test
   *  and a host with no document do. */
  pointerRoot: HTMLElement | null
  /** Either stack moved, or the word on top of one did. */
  onChange(): void
}

export interface HistoryPlane {
  api: ChartHistoryApi
  /** Something that can move content happened. Reading is coalesced into one pass per tick. */
  changed(): void
  /** Set the reading a first change is measured against, once the opening state has landed. */
  seed(): void
  destroy(): void
}

/** Deep value equality over the JSON-shaped leaves content is made of. Key ORDER carries no
 *  meaning, because the same state written by two paths can carry its keys in two orders and a
 *  reading that called that a change would file a step nobody made. A key whose value is undefined
 *  reads as absent, which is what writing the value down would do with it. */
export function sameValue(left: unknown, right: unknown): boolean {
  if (left === right) return true
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') return false
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false
    return left.every((entry, index) => sameValue(entry, right[index]))
  }
  const a = left as Record<string, unknown>
  const b = right as Record<string, unknown>
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const key of keys) {
    if (a[key] === undefined && b[key] === undefined) continue
    if (!sameValue(a[key], b[key])) return false
  }
  return true
}

/** The drawings a reading holds, wherever it holds them. */
const drawingsOf = (state: HistoryState): readonly unknown[] => state.drawings ?? state.content.drawings ?? []

/** A list-shaped field as a list. The compare field is opaque to the save format, so anything else
 *  reads as nothing rather than as a difference nobody can name. */
const listOf = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : [])

/** The word for what moved between two readings, or null when nothing this plane watches did.
 *
 *  The order is the order a viewer would name the change in: what the chart is showing first, then
 *  how it is framed, then how it looks, then what is layered on it. A gesture that moves two fields
 *  at once is named by the first rung it reaches, so a symbol change that also reframes the axis
 *  reads as a symbol change. Extension state is not a rung: nothing announces it, nothing bounds how
 *  often an extension rewrites it, and a reading does not carry it. */
export function diffLabel(previous: HistoryState, next: HistoryState): HistoryChange | null {
  const a = previous.content
  const b = next.content
  if (a.symbol !== b.symbol) return 'symbol'
  if (a.timeframe !== b.timeframe) return 'timeframe'
  if (a.style !== b.style) return 'style'
  if (a.scale !== b.scale || a.priceAxis !== b.priceAxis) return 'priceScale'
  if (!sameValue(a.appearance, b.appearance)) return 'appearance'
  const compares = { before: listOf(a.compares), after: listOf(b.compares) }
  if (compares.after.length > compares.before.length) return 'compareAdd'
  if (compares.after.length < compares.before.length) return 'compareRemove'
  if (!sameValue(compares.before, compares.after)) return 'compareChange'
  if (b.indicators.length > a.indicators.length) return 'indicatorAdd'
  if (b.indicators.length < a.indicators.length) return 'indicatorRemove'
  if (!sameValue(a.indicators, b.indicators)) return 'indicatorChange'
  const drawings = { before: drawingsOf(previous), after: drawingsOf(next) }
  if (drawings.after.length > drawings.before.length) return 'drawingAdd'
  if (drawings.after.length < drawings.before.length) return 'drawingRemove'
  if (!sameValue(drawings.before, drawings.after)) return 'drawingChange'
  return null
}

/** Whether two readings say the same thing. Stated through the diff, so the equality a settling
 *  window waits on and the difference a step is filed for can never disagree. */
const sameState = (left: HistoryState, right: HistoryState): boolean => diffLabel(left, right) === null

export function attachHistoryPlane(deps: HistoryDeps): HistoryPlane {
  const past: HistoryStep[] = []
  const future: HistoryStep[] = []
  /** The last reading, which the next one is measured against. Null until the chart is seeded. */
  let previous: HistoryState | null = null
  /** The apply that is still settling: what was asked for, how many passes it has left, and
   *  whether its separate-mode drawings have gone back yet. */
  let applying: { target: HistoryState; passes: number; drawingsApplied: boolean } | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let destroyed = false

  const live = (): boolean => deps.enabled && !destroyed && !deps.disposed()
  const read = (): HistoryState => ({ content: deps.content(), drawings: deps.drawings?.snapshot() ?? null })

  /** Separate-mode drawings go back once the symbol they were drawn on is the symbol on screen. A
   *  symbol change loads that symbol's own drawings, and a reading put back before that landing
   *  would be replaced by it. */
  const restoreDrawings = (window: { target: HistoryState; drawingsApplied: boolean }, symbol: string): void => {
    const drawings = window.target.drawings
    if (window.drawingsApplied || !drawings) return
    if (symbol !== window.target.content.symbol) return
    window.drawingsApplied = true
    deps.drawings?.restore(drawings)
  }

  function pass(): void {
    if (!live()) return
    const current = read()
    if (applying) {
      restoreDrawings(applying, current.content.symbol)
      applying.passes -= 1
      if (applying.passes <= 0 || sameState(current, applying.target)) applying = null
      // The reading stays in step even inside the window, so nothing is left to compare against
      // once the window closes and the settling itself is never filed as a change.
      previous = current
      return
    }
    if (previous) {
      const label = diffLabel(previous, current)
      if (label) {
        past.push({ state: previous, label })
        if (past.length > HISTORY_LIMIT) past.shift()
        // A new change is a new branch: what was undone is no longer ahead of anything.
        future.length = 0
        deps.onChange()
      }
    }
    previous = current
  }

  const schedule = (): void => {
    if (!live() || timer !== null) return
    timer = setTimeout(() => {
      timer = null
      pass()
    }, 0)
  }

  function applyState(state: HistoryState): void {
    applying = { target: state, passes: HISTORY_SETTLE_PASSES, drawingsApplied: state.drawings === null }
    previous = state
    deps.apply(state.content)
    restoreDrawings(applying, deps.symbol())
    deps.onChange()
  }

  // A price-axis drag and a double-click on the axis move content with no state write and no event
  // of their own: the renderer holds that setting and reports nothing when a gesture changes it. The
  // sweep is the reading that catches them, and it also catches anything else a gesture reached.
  // CAPTURE phase, because surfaces inside the chart stop pointer presses from bubbling, and one
  // tick later, so the gesture's own work has landed before the reading is taken.
  const sweep = (): void => schedule()
  const pointerRoot = deps.pointerRoot
  if (deps.enabled && pointerRoot) {
    pointerRoot.addEventListener('pointerup', sweep, { capture: true, passive: true })
    pointerRoot.addEventListener('dblclick', sweep, { capture: true, passive: true })
  }

  const api: ChartHistoryApi = {
    canUndo: () => live() && past.length > 0,
    canRedo: () => live() && future.length > 0,
    undoChange: () => (live() ? (past.at(-1)?.label ?? null) : null),
    redoChange: () => (live() ? (future.at(-1)?.label ?? null) : null),
    undo() {
      if (!live() || past.length === 0) return
      const step = past.pop()!
      // The step's own word travels with it: the change it takes back is the change a redo puts
      // back, so both controls name the same thing.
      future.push({ state: read(), label: step.label })
      if (future.length > HISTORY_LIMIT) future.shift()
      applyState(step.state)
    },
    redo() {
      if (!live() || future.length === 0) return
      const step = future.pop()!
      past.push({ state: read(), label: step.label })
      if (past.length > HISTORY_LIMIT) past.shift()
      applyState(step.state)
    },
  }

  return {
    api,
    changed: schedule,
    seed() {
      if (!live()) return
      previous = read()
    },
    destroy() {
      destroyed = true
      if (timer !== null) clearTimeout(timer)
      timer = null
      if (pointerRoot) {
        pointerRoot.removeEventListener('pointerup', sweep, true)
        pointerRoot.removeEventListener('dblclick', sweep, true)
      }
      past.length = 0
      future.length = 0
      previous = null
      applying = null
    },
  }
}

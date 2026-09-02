// The typed event maps and the small emitter behind them.
//
// A host subscribes with `on(name, callback)` and receives an unsubscribe. There are two maps
// because there are two scopes: what the widget as a whole does, and what one chart does. A layout
// of four charts has four chart event streams and one widget stream, so a host can follow the
// active chart without guessing which pane spoke.
//
// Every subscription is inert after dispose. The widget clears its emitters when it goes down, and
// an unsubscribe returned before that stays safe to call afterwards.
import type { SemanticTheme, ThemeMode } from '../theme/schema'
import type { ResourceRef } from '../resources'
import type { ScaleMode } from '../scaleMode'
import type { ActiveSubsession } from '../sessionModel'
import type { CompareEntry } from '../compare'
import type { ChartStyleId } from './styles'
import type { LogicalRange, TimeRange } from './ranges'
import type { ChartHandle } from './chart'

/** A refused write the widget made on its own. The widget never overwrites newer work: it keeps
 *  what is on screen, adopts the ref that stands, and reports the case here with the catalog's
 *  copy for it. */
export interface SaveConflictInfo {
  family: 'drawings' | 'chart' | 'layout'
  symbol?: string
  current: ResourceRef | null
  message: string
}

/** What changed about the chart's indicators. */
export interface IndicatorEvent {
  kind: 'added' | 'removed' | 'changed' | 'hidden' | 'shown'
  id: string
}

/** What changed about the chart's drawings. */
export interface DrawingEvent {
  kind: 'tool' | 'selection' | 'changed'
  /** The armed tool for `tool`, the selected drawing for `selection`, null for neither. */
  id: string | null
}

/** The replay cursor as a subscriber reads it. */
export interface ReplayEventState {
  on: boolean
  playing: boolean
  cursor: number
  total: number
}

/** Widget-scoped events. */
export interface WidgetEvents {
  /** The widget has mounted and its first chart has painted its first data. Fires once. */
  ready(): void
  /** The active chart changed: a different pane was activated, or a re-tile moved it. */
  activeChart(chart: ChartHandle): void
  /** The theme resolved to a new value, from a mode switch or a custom palette. */
  theme(theme: SemanticTheme, mode: ThemeMode): void
  /** The interface language changed. */
  locale(code: string): void
  /** Viewer state changed and a host saving named charts would want to save. Debounced. */
  saveNeeded(): void
  saveConflict(info: SaveConflictInfo): void
  /** Chart-root fullscreen was entered or left, including by the browser's own escape. */
  fullscreen(active: boolean): void
  /** The widget was disposed. Fires once, before the emitters clear. */
  dispose(): void
}

/** Chart-scoped events. */
export interface ChartEvents {
  symbol(symbol: string): void
  timeframe(timeframe: string): void
  style(style: ChartStyleId): void
  /** The visible time range moved: a pan, a zoom, a scroll back. */
  visibleRange(range: TimeRange): void
  /** The visible logical (bar index) range moved. */
  logicalRange(range: LogicalRange): void
  /** A load, a page back or a live snapshot reshaped the bar series. */
  dataLoaded(info: { bars: number }): void
  feedStatus(status: string): void
  scaleMode(mode: ScaleMode): void
  /** The display timezone CHOICE moved: an IANA id, or `exchange`. */
  timezone(choice: string): void
  /** The active subsession moved, so a host control can follow it. */
  subsession(active: ActiveSubsession): void
  indicator(event: IndicatorEvent): void
  drawing(event: DrawingEvent): void
  replay(state: ReplayEventState): void
  compare(entries: readonly CompareEntry[]): void
}

/** The arguments one lane's callback takes. */
type LaneArgs<F> = F extends (...args: infer A) => void ? A : never

/** The subscription surface one map exposes, plus the emit and clear the widget keeps to itself.
 *  The map is an ordinary interface rather than an index-signature type, so a lane that does not
 *  exist is a compile error at both the subscribe and the emit. */
export interface Emitter<M> {
  on<K extends keyof M>(name: K, callback: M[K]): () => void
  emit<K extends keyof M>(name: K, ...args: LaneArgs<M[K]>): void
  /** Drop every subscriber and refuse new ones. What `on` returns afterwards is a no-op. */
  clear(): void
}

export function createEmitter<M>(): Emitter<M> {
  const lanes = new Map<keyof M, Set<(...args: unknown[]) => void>>()
  let live = true
  return {
    on(name, callback) {
      if (!live) return () => undefined
      let lane = lanes.get(name)
      if (!lane) {
        lane = new Set()
        lanes.set(name, lane)
      }
      lane.add(callback as (...args: unknown[]) => void)
      return () => {
        lane?.delete(callback as (...args: unknown[]) => void)
      }
    },
    emit(name, ...args) {
      if (!live) return
      const lane = lanes.get(name)
      if (!lane) return
      // A copy, so a subscriber that unsubscribes itself inside its own callback does not skip the
      // next one; a subscriber that throws is its own problem and never sinks the chart.
      for (const callback of [...lane]) {
        try {
          callback(...(args as unknown[]))
        } catch {
          /* a host callback that throws does not take the chart down with it */
        }
      }
    },
    clear() {
      live = false
      lanes.clear()
    },
  }
}

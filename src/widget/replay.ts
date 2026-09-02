// Bar replay: a cursor over the chart's OWN loaded bars.
//
// While replay is on, the chart's `bars` is the painted CURSOR SLICE and this module holds the
// master set. Live updates land in the master off-screen, so nothing is dropped and no history
// repaints; Go live and exit catch the paint up. Every consumer of the painted bars (indicators,
// legend values, session bands, the drawings' bar source) rides the replayed view for free.
//
// Sub-bar FORMING: with an update interval finer than the chart's timeframe, the current bar forms
// progressively from REAL finer bars fetched over the parent's window through the SAME datafeed
// seam as every other read, never from synthesized ticks. 'Auto' picks the largest sub-interval
// giving at least four updates per bar; a fetch the feed cannot answer falls back to a whole-bar
// advance, gracefully.
//
// Replay is a VIEW state and nothing more. An extension reads it through its context, and what it
// does about a historical view is its own rule.
import type { IChartApi } from 'lightweight-charts'
import type { ChartDatafeed, FeedBar } from '../datafeed'
import type { ChartI18n } from '../i18n'
import { autoIntervalFor, composeFormingBar, REPLAY_SPEEDS, subIntervalsFor, tfSeconds, type ReplaySpeed } from '../replay'
import { mountReplayBar, type ReplayBarHandle } from '../replayBar'

/** The bar-replay surface a host drives. */
export interface ChartReplayApi {
  /** Enter replay with the cursor at the bar at or after `atSec` (default: three quarters through
   *  the loaded window). No-op with fewer than 3 loaded bars. */
  start(atSec?: number): void
  exit(): void
  play(): void
  pause(): void
  stepForward(): void
  stepBack(): void
  setSpeed(speed: ReplaySpeed): void
  /** Jump the cursor to the live edge. Playback pauses; replay stays on. */
  goLive(): void
  state(): { on: boolean; playing: boolean; cursor: number; total: number; speed: ReplaySpeed }
}

export interface ReplayPlane {
  api: ChartReplayApi
  /** True while replay is on. */
  active(): boolean
  /** The master set while replaying, or null. */
  master(): FeedBar[] | null
  /** Fold a live snapshot or bar into the master set, off-screen. Answers whether it was taken,
   *  which is how the chart knows not to paint it. */
  absorb(event: { kind: 'snapshot'; bars: FeedBar[] } | { kind: 'bar'; bar: FeedBar }): boolean
  /** Tear replay state down WITHOUT repainting. A load blanks and repaints on its own. */
  abandon(): void
  /** The cursor as the extension plane and the event map read it. */
  snapshot(): { on: boolean; playing: boolean; cursor: number; total: number }
  /** The persisted preference values, for the chart to write through its storage. */
  speed(): ReplaySpeed
  interval(): string
  destroy(): void
}

export interface ReplayDeps {
  chart: IChartApi
  datafeed: ChartDatafeed
  i18n: ChartI18n
  /** The chrome subtree the transport bar mounts into. */
  chrome: HTMLElement
  symbol(): string
  timeframe(): string
  /** The chart's painted bars, and the one way to replace them. */
  bars(): FeedBar[]
  paint(bars: FeedBar[]): void
  /** Whether the feature is on at all. */
  enabled: boolean
  disposed(): boolean
  /** The header word while replay is on, and the plain timeframe when it is off. */
  setHeader(replaying: boolean): void
  /** Persist a preference the viewer just changed. */
  persist(key: 'speed' | 'interval', value: string): void
  /** The cursor moved, entered or left. */
  onChange(): void
  /** Initial preference values. */
  initialSpeed: ReplaySpeed
  initialInterval: string
}

/** Coerce a stored replay speed to one the transport offers. */
export function coerceReplaySpeed(raw: unknown): ReplaySpeed {
  const n = Number(raw)
  return (REPLAY_SPEEDS as readonly number[]).includes(n) ? (n as ReplaySpeed) : 10
}

export function attachReplayPlane(deps: ReplayDeps): ReplayPlane {
  let master: FeedBar[] | null = null
  let cursor = 0
  let playing = false
  let timer: ReturnType<typeof setInterval> | null = null
  let bar: ReplayBarHandle | null = null
  let speed: ReplaySpeed = deps.initialSpeed
  let autoInterval = deps.initialInterval === 'auto'
  let manualInterval: string | null = autoInterval ? null : deps.initialInterval
  let subs: FeedBar[] | null = null
  let formK = 0
  let stepping = false

  const effectiveInterval = (): { tf: string; sec: number } | null => {
    if (autoInterval) return autoIntervalFor(deps.timeframe())
    return subIntervalsFor(deps.timeframe()).find((s) => s.tf === manualInterval) ?? null
  }

  const sync = (): void => {
    bar?.sync({
      playing,
      cursor,
      total: master?.length ?? 0,
      speed,
      interval: autoInterval ? 'auto' : (manualInterval ?? 'auto'),
    })
    deps.onChange()
  }
  const paintCursor = (): void => {
    if (!master) return
    deps.paint(master.slice(0, cursor))
    deps.chart.timeScale().scrollToRealTime() // keep the forming edge in view as the cursor advances
  }
  /** Repaint with the cursor's LAST bar partially formed from its played sub-bars. */
  const paintForming = (): void => {
    if (!master || !subs) return
    const parent = master[cursor - 1]!
    deps.paint([...master.slice(0, cursor - 1), composeFormingBar(parent, subs, formK)])
    deps.chart.timeScale().scrollToRealTime()
  }
  const stopTimer = (): void => {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }
  const pause = (): void => {
    playing = false
    stopTimer()
    sync()
  }

  /** The forming parent's sub-bars over its window, or null when the feed cannot provide at least
   *  two (one sub-bar has no forming value) — the caller then advances whole-bar. */
  const fetchSubs = async (parentIdx: number): Promise<FeedBar[] | null> => {
    const interval = effectiveInterval()
    if (!master || !interval) return null
    const parent = master[parentIdx]
    if (!parent) return null
    const from = parent.t
    const to = parent.t + tfSeconds(deps.timeframe()) - 1
    try {
      const page = await deps.datafeed.history(deps.symbol(), interval.tf, { from, to })
      const found = page.bars.filter((b) => b.t >= from && b.t <= to)
      return found.length >= 2 ? found : null
    } catch {
      return null
    }
  }

  /** One replay UPDATE: the next sub-step of a forming bar, or the next whole bar (starting its
   *  forming when the interval and the feed allow). Async because forming fetches; re-entrancy
   *  guarded so a fast timer never double-advances over one fetch. */
  const stepForward = (): void => {
    void (async () => {
      if (!master || stepping) return
      stepping = true
      try {
        if (subs && formK < subs.length) {
          formK += 1
          paintForming()
          if (formK >= subs.length) {
            subs = null // the parent sealed exactly (composeFormingBar returned it verbatim)
            formK = 0
          }
          sync()
          return
        }
        if (cursor >= master.length) {
          pause() // the live edge: playback stops, replay stays on
          return
        }
        cursor += 1
        const found = await fetchSubs(cursor - 1)
        if (found && master) {
          subs = found
          formK = 1
          paintForming()
        } else {
          paintCursor()
        }
        sync()
      } finally {
        stepping = false
      }
    })()
  }

  function abandon(): void {
    if (!master) return
    stopTimer()
    playing = false
    master = null
    subs = null
    formK = 0
    bar?.destroy()
    bar = null
    deps.onChange()
  }

  const api: ChartReplayApi = {
    start(atSec) {
      const bars = deps.bars()
      if (deps.disposed() || !deps.enabled || master !== null || bars.length < 3) return
      master = bars
      const at = atSec ?? master[Math.floor(master.length * 0.75)]!.t
      const idx = master.findIndex((b) => b.t >= at)
      cursor = Math.max(2, (idx === -1 ? master.length - 1 : idx) + 1)
      bar = mountReplayBar(
        deps.chrome,
        {
          play: () => api.play(),
          pause: () => api.pause(),
          stepForward: () => api.stepForward(),
          stepBack: () => api.stepBack(),
          setSpeed: (s) => api.setSpeed(s),
          setInterval: (token) => {
            if (token === 'auto') {
              autoInterval = true
            } else {
              autoInterval = false
              manualInterval = token
            }
            deps.persist('interval', autoInterval ? 'auto' : (manualInterval ?? 'auto'))
            subs = null // the next update re-fetches at the new grain
            formK = 0
            sync()
          },
          goLive: () => api.goLive(),
          exit: () => api.exit(),
        },
        subIntervalsFor(deps.timeframe()).map((s) => s.tf),
        deps.i18n,
      )
      deps.setHeader(true)
      paintCursor()
      sync()
    },
    exit() {
      if (!master) return
      const all = master
      abandon()
      deps.paint(all) // the live edge, with everything that accumulated off-screen
      deps.setHeader(false)
    },
    play() {
      if (!master || playing) return
      playing = true
      timer = setInterval(stepForward, 1000 / speed)
      sync()
    },
    pause: () => pause(),
    stepForward: () => stepForward(),
    stepBack() {
      if (!master || cursor <= 2) return
      pause() // retreating while playing is a scrub, not playback
      if (subs) {
        // A forming bar rewinds to its sealed boundary first: the partial disappears and the view
        // ends on the last fully-sealed bar.
        subs = null
        formK = 0
      }
      cursor -= 1
      paintCursor()
      sync()
    },
    setSpeed(next) {
      if (!(REPLAY_SPEEDS as readonly number[]).includes(next)) return
      speed = next
      deps.persist('speed', String(next))
      if (playing) {
        stopTimer()
        timer = setInterval(stepForward, 1000 / speed)
      }
      sync()
    },
    goLive() {
      if (!master) return
      pause()
      subs = null
      formK = 0
      cursor = master.length
      paintCursor()
      sync()
    },
    state: () => ({ on: master !== null, playing, cursor, total: master?.length ?? deps.bars().length, speed }),
  }

  return {
    api,
    active: () => master !== null,
    master: () => master,
    absorb(event) {
      if (master === null) return false
      if (event.kind === 'snapshot') {
        const first = event.bars[0]?.t
        master = first === undefined ? [...event.bars] : [...master.filter((b) => b.t < first), ...event.bars]
      } else {
        const last = master[master.length - 1]
        if (!last || event.bar.t > last.t) master = [...master, event.bar]
        else if (event.bar.t === last.t) master = [...master.slice(0, -1), event.bar]
      }
      sync()
      return true
    },
    abandon,
    snapshot: () => ({ on: master !== null, playing, cursor: master === null ? deps.bars().length : cursor, total: master?.length ?? deps.bars().length }),
    speed: () => speed,
    interval: () => (autoInterval ? 'auto' : (manualInterval ?? 'auto')),
    destroy() {
      abandon()
    },
  }
}

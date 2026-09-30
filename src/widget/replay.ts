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
import { composeFormingBar, REPLAY_SPEEDS, subIntervalsFor, tfSeconds, type ReplaySpeed } from '../replay'

/** The bar-replay surface a host drives. */
export interface ChartReplayApi {
  /** Without a moment, ARM: replay opens on the whole loaded window and waits to be told where to
   *  begin. With one, run from the bar at or after `atSec` — from off, from armed, or from a
   *  session already running, which moves the cursor rather than restarting. No-op with fewer than
   *  3 loaded bars. */
  start(atSec?: number): void
  exit(): void
  play(): void
  pause(): void
  stepForward(): void
  stepBack(): void
  setSpeed(speed: ReplaySpeed): void
  /** Jump the cursor to the live edge. Playback pauses; replay stays on. */
  goLive(): void
  /** The update grain: `auto`, or one of the finer timeframe tokens `subIntervals()` lists. */
  interval(): string
  /** Set the grain. A token the chart timeframe cannot form from is refused. */
  setInterval(token: string): void
  /** The grain updates actually use, with `auto` resolved to the token it chose. Empty when the
   *  chart's timeframe has nothing finer to form from, so updates advance whole bars. */
  resolvedInterval(): string
  /** The finer timeframe tokens the chart timeframe can form bars from; empty means whole-bar
   *  updates only. */
  subIntervals(): readonly string[]
  state(): { on: boolean; playing: boolean; cursor: number; total: number; speed: ReplaySpeed }
  /** Where replay stands as a viewer reads it, rather than as a pair of booleans.
   *
   *  `arming` is replay WAITING to be told where to start: the transport is up, the plot is taking
   *  a click, and no past has been chosen yet. It is a state of the session rather than of the
   *  toolbar, which is why it lives here — the legend's mark and the plot's own guide answer to it
   *  as much as the button that armed it does. */
  phase(): ReplayPhase
  /** Take, or stop taking, a click on the plot as the bar to start from. */
  arm(): void
  disarm(): void
}

/** Off, waiting to be told where to start, or running. */
export type ReplayPhase = 'off' | 'arming' | 'on'

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
  symbol(): string
  timeframe(): string
  /** The chart's PAINTED bars: the model the active subsession leaves visible. The replay master is
   *  built from these, so `cursor` and `total` count bars a viewer can actually see and a step never
   *  advances onto a bar that paints nothing. */
  bars(): FeedBar[]
  /** Paint one cursor slice. The chart keeps its own loaded model untouched, so what it holds is
   *  never narrowed by what replay happens to be showing. */
  paint(bars: FeedBar[]): void
  /** Stop painting a slice and show the loaded model again. */
  clearSlice(): void
  /** Whether a bar is visible under the active subsession. A live tick that fails it is dropped
   *  rather than folded into the master, which would put a hidden bar back in the count. */
  visible(epochSecs: number): boolean
  /** Whether the feature is on at all. */
  enabled: boolean
  disposed(): boolean
  /** The header word while replay is on, and the plain timeframe when it is off. */
  setHeader(replaying: boolean): void
  /** Show or hide the renderer's crosshair. It stands down while the picker is ARMED: the guide's
   *  rule already says where a click would land, and a crosshair beside it would be a second claim
   *  about the same point. */
  setCrosshair(visible: boolean): void
  /** The grains the feed actually serves, or null when it declares none. A grain the feed cannot
   *  answer is not offered and is never fetched: every update would spend a request to be told no
   *  and then advance whole-bar anyway. */
  resolutions(): readonly string[] | null
  /** Persist a preference the viewer just changed. */
  persist(key: 'speed' | 'interval', value: string): void
  /** The cursor moved, entered or left. The chart's chrome mounts and unmounts the transport bar
   *  from this, so the plane owns no DOM. */
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
  /** The picker is live: a click on the plot names the bar replay starts from. */
  let arming = false
  let timer: ReturnType<typeof setInterval> | null = null
  let speed: ReplaySpeed = deps.initialSpeed
  let autoInterval = deps.initialInterval === 'auto'
  let manualInterval: string | null = autoInterval ? null : deps.initialInterval
  let subs: FeedBar[] | null = null
  let formK = 0
  let stepping: { targetCursor: number; parent: FeedBar | undefined } | null = null
  let generation = 0
  let destroyed = false
  const invalidateStep = (): void => {
    generation += 1
    stepping = null
  }

  /** The grains this chart can actually form from: finer than its timeframe, dividing it evenly, and
   *  SERVED by the feed. A feed that declares nothing restricts nothing. */
  const grains = (): { tf: string; sec: number }[] => {
    const served = deps.resolutions()
    const ladder = subIntervalsFor(deps.timeframe())
    return served && served.length > 0 ? ladder.filter((s) => served.includes(s.tf)) : ladder
  }

  const effectiveInterval = (): { tf: string; sec: number } | null => {
    const available = grains()
    // Auto is the COARSEST grain on offer, which is the chart's own interval whenever that is a
    // rung: replay advances a whole bar per update until a viewer asks for something finer.
    if (autoInterval) return available.length ? available[available.length - 1]! : null
    return available.find((s) => s.tf === manualInterval) ?? null
  }

  const sync = (): void => {
    deps.onChange()
  }
  const currentInterval = (): string => (autoInterval ? 'auto' : (manualInterval ?? 'auto'))
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

  /** Put the picking QUESTION: the transport comes up and the chart stays WHOLE while a click on
   *  the plot names the bar to begin at. Entry arms rather than choosing a start on the viewer's
   *  behalf, so the window they are picking from is the one already in front of them. */
  const armPicker = (): void => {
    if (arming || destroyed || deps.disposed() || !deps.enabled) return
    if (master === null && deps.bars().length < 3) return
    setArming(true)
    sync()
  }

  /** The picker and the crosshair move TOGETHER. While the question is open the guide's rule is the
   *  answer to where a click would land, so the renderer's own crosshair stands down beside it and
   *  comes back the moment the question is answered or withdrawn. */
  const setArming = (next: boolean): void => {
    if (arming === next) return
    arming = next
    deps.setCrosshair(!next)
  }

  /** The forming parent's sub-bars over its window, or null when the feed cannot provide at least
   *  two (one sub-bar has no forming value) — the caller then advances whole-bar. */
  const fetchSubs = async (parentIdx: number): Promise<FeedBar[] | null> => {
    const interval = effectiveInterval()
    if (!master || !interval) return null
    // The chart's OWN interval is a legitimate choice, and it means whole-bar updates. There is
    // nothing finer to ask the feed for, so no request is spent finding that out.
    if (interval.sec >= tfSeconds(deps.timeframe())) return null
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
      if (!master || stepping || destroyed || deps.disposed()) return
      const flight = { targetCursor: cursor + 1, parent: master[cursor] }
      stepping = flight
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
        // Reserve the next parent without reporting an unpainted cursor. An invalidated request
        // must leave that parent available to the next step rather than silently skipping it.
        const { targetCursor, parent } = flight
        const epoch = generation
        const symbol = deps.symbol()
        const timeframe = deps.timeframe()
        const grain = currentInterval()
        // A WHOLE-BAR update does not cross an async boundary: its public step and cursor stay
        // synchronous. That is the default path now that auto is the chart's own interval, so an
        // await here would put a microtask under every ordinary press of step forward. Only an
        // actual finer-history request needs deferred admission.
        const chosen = effectiveInterval()
        const wholeBar = !chosen || chosen.sec >= tfSeconds(deps.timeframe())
        const found = wholeBar ? null : await fetchSubs(targetCursor - 1)
        // A non-null master is not proof this response belongs to the current replay. The old
        // request may finish after a seek, grain change, teardown or restart. Identity also fences
        // a replaced parent in a fresh snapshot, even when its array index is unchanged.
        if (destroyed || deps.disposed() || stepping !== flight || generation !== epoch ||
          deps.symbol() !== symbol || deps.timeframe() !== timeframe || currentInterval() !== grain ||
          !master || cursor !== targetCursor - 1 || master[targetCursor - 1] !== parent) return
        cursor = targetCursor
        if (found) {
          subs = found
          formK = 1
          paintForming()
        } else {
          paintCursor()
        }
        sync()
      } finally {
        if (stepping === flight) stepping = null
      }
    })()
  }

  function abandon(): void {
    invalidateStep()
    if (!master) return
    stopTimer()
    playing = false
    master = null
    subs = null
    formK = 0
    deps.onChange()
  }

  const api: ChartReplayApi = {
    start(atSec) {
      if (destroyed || deps.disposed() || !deps.enabled) return
      // Entry ASKS where to begin. Choosing a bar for the viewer would hide part of the very window
      // they are choosing from, so a start with no moment is the question and one with a moment is
      // its answer.
      if (atSec === undefined) {
        armPicker()
        return
      }
      // Answering again while a session is already running MOVES the cursor. Leaving and re-entering
      // to land on another bar would tear the transport down and build it back inside the very click
      // that asked for it, and the master set would be re-snapshotted from a slice.
      const bars = master ?? deps.bars()
      if (bars.length < 3) return
      invalidateStep()
      stopTimer()
      playing = false
      // A start ANSWERS the arming question, so the picker stands down with it.
      setArming(false)
      subs = null
      formK = 0
      master = bars
      const idx = master.findIndex((b) => b.t >= atSec)
      cursor = Math.max(2, (idx === -1 ? master.length - 1 : idx) + 1)
      deps.setHeader(true)
      paintCursor()
      sync()
    },
    exit() {
      if (!master) {
        // Leaving while still ASKING where to begin: there is no slice to hand back and no header to
        // restore, but the phase moved and every reader of it has to hear that.
        if (!arming) return
        setArming(false)
        sync()
        return
      }
      setArming(false)
      abandon()
      // The chart's own model kept accumulating while replay was on, so handing the slice back is
      // all that is needed: the live edge is already there, with everything that arrived off-screen.
      deps.clearSlice()
      deps.setHeader(false)
    },
    play() {
      if (destroyed || deps.disposed() || !master || playing) return
      playing = true
      timer = setInterval(stepForward, 1000 / speed)
      sync()
    },
    pause: () => pause(),
    stepForward: () => stepForward(),
    stepBack() {
      if (!master || cursor <= 2) return
      invalidateStep()
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
      invalidateStep()
      pause()
      subs = null
      formK = 0
      cursor = master.length
      paintCursor()
      sync()
    },
    interval: currentInterval,
    // What `auto` actually RESOLVED to, so a surface can say the grain rather than the mode. Empty
    // when the chart's timeframe has nothing finer to form from and updates advance whole bars.
    resolvedInterval: () => effectiveInterval()?.tf ?? '',
    setInterval(token) {
      if (token === currentInterval()) return
      if (token === 'auto') {
        autoInterval = true
      } else {
        // A grain the chart timeframe cannot form from is refused rather than stored: the next
        // update would fall back to whole bars and the menu would claim a grain it never used.
        if (!grains().some((s) => s.tf === token)) return
        autoInterval = false
        manualInterval = token
      }
      invalidateStep()
      deps.persist('interval', currentInterval())
      subs = null // the next update re-fetches at the new grain
      formK = 0
      sync()
    },
    subIntervals: () => grains().map((s) => s.tf),
    state: () => ({ on: master !== null, playing, cursor, total: master?.length ?? deps.bars().length, speed }),
    // An OPEN QUESTION outranks a running session. Re-arming mid-replay to choose a different start
    // puts the plot back to taking a click, and every surface that answers to the picker — the
    // guide's rule and shears, the pointer, Select bar's held state — has to say so whether or not
    // a past is already loaded. Whether a session is RUNNING is a separate fact, and `state().on`
    // is where that is read, so the transport's own verbs stay live throughout.
    phase: () => (arming ? 'arming' : master !== null ? 'on' : 'off'),
    arm: () => armPicker(),
    disarm() {
      if (!arming) return
      setArming(false)
      sync()
    },
  }

  return {
    api,
    active: () => master !== null,
    master: () => master,
    absorb(event) {
      if (master === null) return false
      if (event.kind === 'snapshot') {
        const fresh = event.bars.filter((b) => deps.visible(b.t))
        const first = fresh[0]?.t
        master = first === undefined ? fresh : [...master.filter((b) => b.t < first), ...fresh]
      } else if (deps.visible(event.bar.t)) {
        const last = master[master.length - 1]
        if (!last || event.bar.t > last.t) master = [...master, event.bar]
        else if (event.bar.t === last.t) master = [...master.slice(0, -1), event.bar]
      }
      // A snapshot (or current-bar replacement) can retire the reserved parent while its history
      // request is still pending. Release that known-obsolete flight now; a stalled provider must
      // not prevent the replacement parent from being requested. Unrelated appends retain it.
      if (stepping && master[stepping.targetCursor - 1] !== stepping.parent) invalidateStep()
      sync()
      return true
    },
    abandon,
    snapshot: () => ({ on: master !== null, playing, cursor: master === null ? deps.bars().length : cursor, total: master?.length ?? deps.bars().length }),
    speed: () => speed,
    interval: currentInterval,
    destroy() {
      destroyed = true
      abandon()
    },
  }
}

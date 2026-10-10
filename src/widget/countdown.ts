// The symbol's last-value label when it holds more than the price: the percentage change since the
// previous session's close under the price, and the countdown to the bar's close under both. It
// replaces the renderer's native last-value label only while it has a second line to write, and
// gives that label back otherwise. The countdown stands only while it can state a truthful close
// boundary, and gives way for every unsupported or stale state. Bar timestamps are the authority
// for alignment. The chart never guesses an exchange bucket from the wall clock.
//
// The label is drawn as the renderer draws its own: from one pixel inside the scale, square on the
// plot side and rounded on the other, its text a tick and a padding in, each line one line pitch
// below the one before, so it reads as the native label grown taller.
import type {
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesApi,
  ISeriesPrimitive,
  SeriesType,
  Time,
} from 'lightweight-charts'
import type { FeedBar } from '../datafeed'
import { nextSessionChange, sessionStateAt, type ActiveSubsession, type SessionModel } from '../sessionModel'
import type { PriceFormatter } from '../priceFormatter'
import { colorWithAlpha } from '../settings/defaults'
import type { DataStatus } from '../symbology'
import { CHART_FACTORY_COLORS } from '../theme/palettes'
import type { SemanticTheme } from '../theme/schema'
import { parseTimeframe } from '../timeframe'

export interface CountdownState {
  readonly closeAt: number
  readonly remaining: number
  readonly bar: FeedBar
}

/** Add whole UTC calendar months without turning a month into a fixed number of seconds. Bar
 * opens are expected at the feed's own bucket boundary; an impossible target day is clamped to
 * that target month's final day rather than spilling into the following month. */
function addUtcMonths(epochSecs: number, count: number): number {
  const source = new Date(epochSecs * 1000)
  const targetStart = new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth() + count, 1))
  const lastDay = new Date(Date.UTC(targetStart.getUTCFullYear(), targetStart.getUTCMonth() + 1, 0)).getUTCDate()
  return Date.UTC(
    targetStart.getUTCFullYear(),
    targetStart.getUTCMonth(),
    Math.min(source.getUTCDate(), lastDay),
    source.getUTCHours(),
    source.getUTCMinutes(),
    source.getUTCSeconds(),
  ) / 1000
}

/** The declared bar's next boundary. Fixed-duration units advance from the actual bar open;
 * calendar months advance on the UTC calendar. Tick and malformed tokens have no time boundary. */
export function barCloseBoundary(barOpen: number, token: string): number | null {
  const tf = parseTimeframe(token)
  if (!tf || tf.unit === 't' || !Number.isFinite(barOpen)) return null
  if (tf.unit === 'mo') return addUtcMonths(barOpen, tf.count)
  const seconds = tf.unit === 's' ? 1 : tf.unit === 'm' ? 60 : tf.unit === 'h' ? 3600 : tf.unit === 'd' ? 86_400 : 604_800
  return barOpen + tf.count * seconds
}

/** The closing edge of the active displayed session. A regular-only chart closes when the market
 * leaves regular state. An extended chart crosses pre/open/after boundaries without sealing its
 * bar and closes only when the declared extended day closes. */
export function activeSessionClose(
  model: SessionModel,
  active: ActiveSubsession,
  nowSecs: number,
): number | null {
  const state = sessionStateAt(model, nowSecs)
  if ((active === 'regular' && state !== 'open') || (active === 'extended' && state === 'closed')) return null
  let cursor = nowSecs
  for (let i = 0; i < 4; i++) {
    const transition = nextSessionChange(model, cursor)
    if (!transition) return null
    if (active === 'regular' ? transition.state !== 'open' : transition.state === 'closed') return transition.atSecs
    cursor = transition.atSecs
  }
  return null
}

function activeSessionOpen(model: SessionModel, active: ActiveSubsession, nowSecs: number): boolean {
  if (model.continuous) return true
  const state = sessionStateAt(model, nowSecs)
  return active === 'regular' ? state === 'open' : state !== 'closed'
}

/** A declared active-session close may seal an intraday bar early. Intermediate pre/open/after
 * transitions do not. Unknown session facts leave the boundary derived from the actual bar open. */
export function countdownState(
  bars: readonly FeedBar[],
  token: string,
  nowSecs: number,
  session: SessionModel | null,
  activeSubsession: ActiveSubsession,
): CountdownState | null {
  const bar = bars[bars.length - 1]
  if (!bar || !Number.isFinite(nowSecs)) return null
  const tf = parseTimeframe(token)
  const barBoundary = barCloseBoundary(bar.t, token)
  if (!tf || barBoundary === null || nowSecs < bar.t) return null
  if (session && !activeSessionOpen(session, activeSubsession, nowSecs)) return null
  let closeAt = barBoundary
  const sessionBounded = tf.unit === 's' || tf.unit === 'm' || tf.unit === 'h' || (tf.unit === 'd' && tf.count === 1)
  if (session && !session.continuous && sessionBounded) {
    const sessionClose = activeSessionClose(session, activeSubsession, nowSecs)
    if (sessionClose === null) return null
    if (sessionClose < closeAt) closeAt = sessionClose
  }
  if (nowSecs >= closeAt) return null
  return { closeAt, remaining: closeAt - nowSecs, bar }
}

export function countdownText(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds))
  const days = Math.floor(whole / 86_400)
  const hours = Math.floor((whole % 86_400) / 3600)
  const minutes = Math.floor((whole % 3600) / 60)
  const remainder = whole % 60
  const pad = (value: number): string => String(value).padStart(2, '0')
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(remainder)}`
  return `${pad(minutes)}:${pad(remainder)}`
}

/** The drawn label's geometry at a text size, for a label of `lines` lines, laid out as the renderer
 *  lays out its own: one pixel inside the scale, the 5px tick and a padding before the text, a
 *  padding and the border after it, 2.5px above and below the first line at 12px, a 2px rounding,
 *  and 14px between lines, the paddings and the pitch scaled to the text size. A 12px label is 17px
 *  tall with one line, 31px with two and 45px with three. Exported for tests. */
export function labelBox(fontSize: number, lines: number): {
  left: number
  inset: number
  outer: number
  radius: number
  lineHeight: number
  pitch: number
  height: number
} {
  const k = fontSize / 12
  const lineHeight = fontSize + 5 * k
  const pitch = 14 * k
  return { left: 1, inset: 5 + 5 * k, outer: 5 * k + 1, radius: 2, lineHeight, pitch, height: lineHeight + pitch * Math.max(0, lines - 1) }
}

export interface CountdownDeps {
  series(): ISeriesApi<SeriesType>
  bars(): readonly FeedBar[]
  /** The value the series draws for a bar, which the label states and stands at: the close when
   *  absent. */
  value?(bar: FeedBar): number
  timeframe(): string
  /** Whether the countdown is asked for. */
  enabled(): boolean
  /** Whether the series' own last-value label shows while no countdown stands in for it. */
  nativeLabel(): boolean
  /** The percentage line under the price, already written, or null for none: the change of the
   *  last value since the previous session's close, while the label is asked to state it. */
  percent?(): string | null
  /** The label's colors, up and down by the bar's own open, and its text size. */
  look(): { up: string; down: string; fontSize: number }
  replaying(): boolean
  dataStatus(): DataStatus | null
  session(): SessionModel | null
  activeSubsession(): ActiveSubsession
  formatter(): PriceFormatter
  theme(): SemanticTheme
  now(): number
  setInterval(callback: () => void, delay: number): unknown
  clearInterval(handle: unknown): void
}

export interface CountdownLayer {
  refresh(): void
  /** The series' options were written again, its last-value label among them: the layer states the
   *  label once more rather than trusting what it wrote before. */
  restyled(): void
  seriesChanged(previous: ISeriesApi<SeriesType>): void
  destroy(): void
}

export interface CountdownClock {
  now(): number
  /** Reset to the client clock and probe this symbol/timeframe lifetime. */
  reset(): void
  destroy(): void
}

/** One skew probe per chart load. Missing, rejected, non-finite and late answers retain the client
 * clock; generation and disposal fences keep an earlier symbol's answer out of the current one. */
export function createCountdownClock(clientNow: () => number, serverTime?: () => Promise<number>): CountdownClock {
  let generation = 0
  let disposed = false
  let offset = 0
  return {
    now: () => clientNow() + offset,
    reset() {
      const mine = ++generation
      offset = 0
      if (!serverTime) return
      void Promise.resolve()
        .then(serverTime)
        .then((server) => {
          if (disposed || mine !== generation || !Number.isFinite(server)) return
          offset = server - clientNow()
        })
        .catch(() => {
          /* optional correction; the client clock remains the documented fallback */
        })
    },
    destroy() {
      disposed = true
      generation++
      offset = 0
    },
  }
}

export function attachCountdown(deps: CountdownDeps): CountdownLayer {
  let disposed = false
  /** The last-value visibility this layer last wrote to the current series, or null when unknown. */
  let nativeShown: boolean | null = null
  let requestUpdate: (() => void) | null = null

  const current = (): CountdownState | null => {
    if (disposed || !deps.enabled() || deps.replaying() || deps.dataStatus() !== 'streaming') return null
    return countdownState(deps.bars(), deps.timeframe(), deps.now(), deps.session(), deps.activeSubsession())
  }

  /** What the drawn label holds now, or null while the native label says everything: the newest
   *  bar, then the percentage and the countdown, either of which may be absent but not both. */
  const label = (): { bar: FeedBar; percent: string | null; countdown: CountdownState | null } | null => {
    if (disposed || !deps.nativeLabel()) return null
    const countdown = current()
    const percent = deps.percent?.() ?? null
    if (!countdown && percent === null) return null
    const bar = countdown?.bar ?? deps.bars()[deps.bars().length - 1]
    return bar ? { bar, percent, countdown } : null
  }

  /** Show the series' own label, or hide it while the countdown draws the label in its place. */
  const setNativeHidden = (hidden: boolean, target = deps.series()): void => {
    const shown = !hidden && deps.nativeLabel()
    if (target === deps.series() && shown === nativeShown) return
    if (target === deps.series()) nativeShown = shown
    try {
      target.applyOptions({ lastValueVisible: shown })
    } catch {
      /* a style switch or chart teardown may already have removed the series */
    }
  }

  const updateViews = (): void => {
    setNativeHidden(label() !== null)
  }

  const refresh = (): void => {
    updateViews()
    requestUpdate?.()
  }

  const renderer: IPrimitivePaneRenderer = {
    draw(target) {
      target.useMediaCoordinateSpace(({ context, mediaSize }) => {
        const state = label()
        if (!state) return
        const series = deps.series()
        const value = deps.value?.(state.bar) ?? state.bar.c
        const y = series.priceToCoordinate(value)
        if (y === null) return
        const theme = deps.theme()
        const look = deps.look()
        const text = CHART_FACTORY_COLORS.scaleLabelText
        const lines: { text: string; color: string }[] = [{ text: deps.formatter().format(value), color: text }]
        if (state.percent !== null) lines.push({ text: state.percent, color: text })
        if (state.countdown) lines.push({ text: countdownText(state.countdown.remaining), color: colorWithAlpha(text, 0.75) })
        const box = labelBox(look.fontSize, lines.length)
        context.font = `${look.fontSize}px ${theme['text.fontFamily']}`
        const textWidth = Math.ceil(Math.max(...lines.map((line) => context.measureText?.(line.text).width ?? 0)))
        const width = Math.min(mediaSize.width - box.left, box.inset + textWidth + box.outer)
        const top = Math.max(0, Math.min(y - box.lineHeight / 2, mediaSize.height - box.height))
        context.fillStyle = state.bar.c < state.bar.o ? look.down : look.up
        context.beginPath()
        context.roundRect(box.left, top, width, box.height, [0, box.radius, box.radius, 0])
        context.fill()
        context.textAlign = 'left'
        context.textBaseline = 'middle'
        lines.forEach((line, i) => {
          context.fillStyle = line.color
          context.fillText(line.text, box.left + box.inset, top + box.lineHeight / 2 + i * box.pitch)
        })
      })
    },
  }

  const view: IPrimitivePaneView = { zOrder: () => 'normal', renderer: () => renderer }
  const primitive: ISeriesPrimitive<Time> = {
    attached(param) {
      requestUpdate = param.requestUpdate
      refresh()
    },
    detached() {
      requestUpdate = null
    },
    // The renderer calls this while satisfying an update. Scheduling another update from inside
    // that cycle would self-invalidate forever; timers and chart state changes own invalidation.
    updateAllViews: updateViews,
    priceAxisPaneViews: () => [view],
  }

  deps.series().attachPrimitive(primitive)
  const timer = deps.setInterval(refresh, 1000)
  refresh()

  return {
    refresh,
    restyled() {
      nativeShown = null
      refresh()
    },
    seriesChanged(previous) {
      setNativeHidden(false, previous)
      try {
        previous.detachPrimitive(primitive)
      } catch {
        /* the renderer already released the prior style series */
      }
      nativeShown = null
      deps.series().attachPrimitive(primitive)
      refresh()
    },
    destroy() {
      if (disposed) return
      setNativeHidden(false)
      disposed = true
      deps.clearInterval(timer)
      try {
        deps.series().detachPrimitive(primitive)
      } catch {
        /* the renderer already released the visible series */
      }
      requestUpdate = null
    },
  }
}

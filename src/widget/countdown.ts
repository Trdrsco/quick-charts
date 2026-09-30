// The price-axis bar countdown. It replaces the renderer's native last-value label only while it
// can state a truthful close boundary, and gives that label back for every unsupported or stale
// state. Bar timestamps are the authority for alignment. The chart never guesses an exchange
// bucket from the wall clock.
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
import type { DataStatus } from '../symbology'
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

export interface CountdownDeps {
  series(): ISeriesApi<SeriesType>
  bars(): readonly FeedBar[]
  timeframe(): string
  enabled(): boolean
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
  let nativeHidden = false
  let requestUpdate: (() => void) | null = null

  const current = (): CountdownState | null => {
    if (disposed || !deps.enabled() || deps.replaying() || deps.dataStatus() !== 'streaming') return null
    return countdownState(deps.bars(), deps.timeframe(), deps.now(), deps.session(), deps.activeSubsession())
  }

  const setNativeHidden = (hidden: boolean, target = deps.series()): void => {
    if (target === deps.series() && hidden === nativeHidden) return
    if (target === deps.series()) nativeHidden = hidden
    try {
      target.applyOptions({ lastValueVisible: !hidden })
    } catch {
      /* a style switch or chart teardown may already have removed the series */
    }
  }

  const updateViews = (): void => {
    setNativeHidden(current() !== null)
  }

  const refresh = (): void => {
    updateViews()
    requestUpdate?.()
  }

  const renderer: IPrimitivePaneRenderer = {
    draw(target) {
      target.useMediaCoordinateSpace(({ context, mediaSize }) => {
        const state = current()
        if (!state) return
        const series = deps.series()
        const y = series.priceToCoordinate(state.bar.c)
        if (y === null) return
        const theme = deps.theme()
        const size = Number.parseFloat(theme['text.fontSizeAxis']) || 12
        const priceHeight = size + 8
        const countdownHeight = size + 5
        const height = priceHeight + countdownHeight
        const top = Math.max(0, Math.min(y - priceHeight / 2, mediaSize.height - height))
        context.fillStyle = state.bar.c < state.bar.o ? theme['series.down'] : theme['series.up']
        context.beginPath()
        context.roundRect(0, top, mediaSize.width, height, 2)
        context.fill()
        context.fillStyle = theme['text.inverse']
        context.font = `${size}px ${theme['text.fontFamily']}`
        context.textAlign = 'center'
        context.textBaseline = 'middle'
        context.fillText(deps.formatter().format(state.bar.c), mediaSize.width / 2, top + priceHeight / 2)
        context.fillText(countdownText(state.remaining), mediaSize.width / 2, top + priceHeight + countdownHeight / 2)
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
    seriesChanged(previous) {
      setNativeHidden(false, previous)
      try {
        previous.detachPrimitive(primitive)
      } catch {
        /* the renderer already released the prior style series */
      }
      nativeHidden = false
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

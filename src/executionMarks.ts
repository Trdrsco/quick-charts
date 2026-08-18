// Execution marks — the reference platform's model, package-owned end to end: canvas arrows on
// the bars where orders filled (a buy points up under the bar's low, a sell points down above its
// high), fills on the SAME bar and side grouped into ONE arrow (the reference groups
// automatically), and a click card — side stripe, a count chip, Buy/Sell title, an "N @ avg
// price" subtitle once grouped, and a TRADES table of the individual fills.
//
// Two ISOLATED scopes carry two histories: 'live' (real/demo account fills) and 'replay' (a
// replay session's simulated fills). Only the active scope draws — replay fills never appear on a
// live chart and live fills never appear inside a replay, because a mark on the wrong timeline is
// a lie about where money moved. The host flips the scope when replay starts/exits.
//
// Grouping is by CONTAINING BAR, read from the price series itself — never by timeframe
// arithmetic. A fill belongs to the loaded bar with the greatest time ≤ its own; a fill before
// the loaded window, past the window's forming edge, or inside history that has not been paged in
// draws nothing (an arrow on the wrong bar is worse than no arrow). This makes marks correct on
// every interval — tick, seconds, daily, weekly — and bounds them to a replay slice for free.
//
// Same chrome discipline as the legend/drawings rail: theme-tinted DOM + canvas the package owns,
// no framework. Arrows are canvas (they must track pan/zoom per paint, like the reference); the
// card is DOM in the host's chrome overlay.
import type { IChartApi, ISeriesApi, MouseEventParams, SeriesType, Time } from 'lightweight-charts'

/** One execution (a fill), in the host's vocabulary. `timeSecs` is the FILL time — the attachment
 *  finds its containing bar itself, so hosts pass raw fill times. */
export interface ChartExecution {
  /** Stable identity (the broker's execution/fill id) — keys the TRADES rows. */
  readonly id: string
  readonly side: 'buy' | 'sell'
  readonly qty: number
  readonly price: number
  readonly timeSecs: number
}

export type ExecutionScope = 'live' | 'replay'

/** One drawn arrow: every fill of one side whose time lands in one bar. Exported for tests. */
export interface ExecutionGroup {
  /** The containing bar's time (seconds). */
  readonly barTime: number
  readonly side: 'buy' | 'sell'
  /** The grouped fills, oldest first. */
  readonly fills: readonly ChartExecution[]
  readonly qty: number
  readonly avgPrice: number
}

/** Greatest barTimes[i] ≤ t, by binary search (barTimes ascending), or -1 when t precedes all. */
function containingBarIndex(barTimes: readonly number[], t: number): number {
  let lo = 0
  let hi = barTimes.length - 1
  let ans = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (barTimes[mid]! <= t) {
      ans = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return ans
}

/** Group executions per (containing bar, side) — the reference's automatic grouping. Fills
 *  before the first loaded bar are dropped (their bar is not on the chart), and fills past the
 *  window's forming edge (beyond the last bar plus the last bar-to-bar span) are dropped rather
 *  than clamped to the wrong bar. Exported for tests. */
export function groupExecutionsByBar(executions: readonly ChartExecution[], barTimes: readonly number[]): ExecutionGroup[] {
  if (barTimes.length === 0) return []
  const lastBar = barTimes[barTimes.length - 1]!
  const span = barTimes.length >= 2 ? lastBar - barTimes[barTimes.length - 2]! : Number.POSITIVE_INFINITY
  const horizon = lastBar + span
  const byKey = new Map<string, ChartExecution[]>()
  for (const x of executions) {
    if (!Number.isFinite(x.timeSecs) || !Number.isFinite(x.price) || !Number.isFinite(x.qty) || x.qty <= 0) continue
    if (x.timeSecs >= horizon) continue
    const idx = containingBarIndex(barTimes, x.timeSecs)
    if (idx < 0) continue
    const key = `${barTimes[idx]}|${x.side}`
    const list = byKey.get(key)
    if (list) list.push(x)
    else byKey.set(key, [x])
  }
  const groups: ExecutionGroup[] = []
  for (const [key, fills] of byKey) {
    const sorted = [...fills].sort((a, b) => a.timeSecs - b.timeSecs)
    const qty = sorted.reduce((s, f) => s + f.qty, 0)
    groups.push({
      barTime: Number(key.slice(0, key.indexOf('|'))),
      side: sorted[0]!.side,
      fills: sorted,
      qty,
      avgPrice: sorted.reduce((s, f) => s + f.price * f.qty, 0) / qty,
    })
  }
  return groups.sort((a, b) => a.barTime - b.barTime)
}

/** A drawn arrow's hit box in chart CSS pixels, rebuilt on every paint. Exported for tests. */
export interface ArrowHit {
  readonly group: ExecutionGroup
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

/** The hit under (x, y), later-drawn winning on overlap (matches paint order). Exported for tests. */
export function executionHitAt(hits: readonly ArrowHit[], x: number, y: number): ArrowHit | null {
  for (let i = hits.length - 1; i >= 0; i--) {
    const h = hits[i]!
    if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) return h
  }
  return null
}

/** Card price decimals when the host declares no precision: enough to show the value faithfully.
 *  Exported for tests. */
export function executionPriceDecimals(price: number): number {
  const a = Math.abs(price)
  if (a >= 1) return 2
  if (a >= 0.01) return 4
  return 6
}

export interface ExecutionMarksOptions {
  /** Side colors, read per paint so a theme change needs no re-attach. */
  buyColor(): string
  sellColor(): string
  /** Card price decimals (the resolved symbol's tick decimals). Null falls back to a magnitude
   *  heuristic — the card is informational; the price scale formats the axis. */
  precision?(): number | null
  /** Card chrome overrides; defaults follow the built-in dark theme. */
  textColor?(): string
  cardBackground?(): string
}

export interface ExecutionMarksHandle {
  /** Replace one scope's executions. Painting is by the ACTIVE scope only; replacing the active
   *  scope closes any open card (its group may no longer exist). */
  set(scope: ExecutionScope, executions: readonly ChartExecution[]): void
  /** Flip which history draws — the host calls this on replay start/exit. Closes any open card. */
  setScope(scope: ExecutionScope): void
  scope(): ExecutionScope
  destroy(): void
}

const ARROW_HALF_W = 5 // CSS px, half the triangle base
const ARROW_H = 8 // CSS px, tip to base
const ARROW_GAP = 4 // CSS px between the bar extreme and the arrow tip
const HIT_PAD = 4 // extra clickable margin around the drawn triangle

const fmtQty = (n: number): string => String(Number(n.toFixed(9)))
const fmtWhen = (secs: number): string =>
  new Date(secs * 1000).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

/** Attach execution marks to a chart's main series. `chrome` hosts the click card — the host's
 *  overlay subtree (pointer-events opt-in), NOT the chart's own gesture box, where a capturing
 *  pointer handler would swallow the card's clicks. */
export function attachExecutionMarks(
  chart: IChartApi,
  series: ISeriesApi<SeriesType>,
  chrome: HTMLElement,
  opts: ExecutionMarksOptions,
): ExecutionMarksHandle {
  const sets: Record<ExecutionScope, readonly ChartExecution[]> = { live: [], replay: [] }
  let activeScope: ExecutionScope = 'live'
  let hits: ArrowHit[] = []
  let requestUpdate: (() => void) | null = null
  let card: HTMLElement | null = null
  let destroyed = false

  const closeCard = () => {
    if (!card) return
    card.remove()
    card = null
    document.removeEventListener('pointerdown', onDocPointerDown, true)
  }
  /** Close on any press outside the card — the chart, another widget, anywhere. */
  const onDocPointerDown = (e: PointerEvent) => {
    if (card && e.target instanceof Node && !card.contains(e.target)) closeCard()
  }

  const renderer = {
    draw(target: unknown) {
      hits = []
      const executions = sets[activeScope]
      if (executions.length === 0) return
      // REAL bars only, numeric times only — whitespace points must not become containing bars.
      const bars = (series.data() as { time: Time; open?: number; high?: number; low?: number; close?: number; value?: number }[]).filter(
        (b) => typeof b.time === 'number' && (typeof b.close === 'number' || typeof b.value === 'number'),
      )
      if (bars.length === 0) return
      const groups = groupExecutionsByBar(
        executions,
        bars.map((b) => b.time as number),
      )
      if (groups.length === 0) return
      const byTime = new Map<number, (typeof bars)[number]>()
      for (const b of bars) byTime.set(b.time as number, b)
      const ts = chart.timeScale()
      const t = target as {
        useBitmapCoordinateSpace: (
          fn: (scope: { context: CanvasRenderingContext2D; horizontalPixelRatio: number; verticalPixelRatio: number }) => void,
        ) => void
      }
      t.useBitmapCoordinateSpace((scope) => {
        const hr = scope.horizontalPixelRatio
        const vr = scope.verticalPixelRatio
        const ctx = scope.context
        for (const g of groups) {
          const bar = byTime.get(g.barTime)
          if (!bar) continue
          const x = ts.timeToCoordinate(g.barTime as Time)
          if (x == null) continue // off-screen
          const high = bar.high ?? bar.close ?? bar.value
          const low = bar.low ?? bar.close ?? bar.value
          if (high == null || low == null) continue
          const anchor = g.side === 'buy' ? series.priceToCoordinate(low) : series.priceToCoordinate(high)
          if (anchor == null) continue
          const up = g.side === 'buy' // a buy arrow sits BELOW the bar pointing up at it
          const tipY = up ? anchor + ARROW_GAP : anchor - ARROW_GAP
          const baseY = up ? tipY + ARROW_H : tipY - ARROW_H
          ctx.fillStyle = up ? opts.buyColor() : opts.sellColor()
          ctx.beginPath()
          ctx.moveTo(x * hr, tipY * vr)
          ctx.lineTo((x - ARROW_HALF_W) * hr, baseY * vr)
          ctx.lineTo((x + ARROW_HALF_W) * hr, baseY * vr)
          ctx.closePath()
          ctx.fill()
          hits.push({
            group: g,
            x: x - ARROW_HALF_W - HIT_PAD,
            y: Math.min(tipY, baseY) - HIT_PAD,
            w: (ARROW_HALF_W + HIT_PAD) * 2,
            h: ARROW_H + HIT_PAD * 2,
          })
        }
      })
    },
  }

  const decimalsFor = (price: number): number => opts.precision?.() ?? executionPriceDecimals(price)

  const openCard = (hit: ArrowHit) => {
    closeCard()
    const g = hit.group
    const sideColor = g.side === 'buy' ? opts.buyColor() : opts.sellColor()
    const text = opts.textColor?.() ?? 'rgba(255,255,255,0.9)'
    const muted = 'rgba(128,128,128,0.9)'
    const el = document.createElement('div')
    el.setAttribute('data-role', 'execution-card')
    el.style.cssText = [
      'position:absolute',
      'z-index:12',
      'min-width:200px',
      'max-width:280px',
      `background:${opts.cardBackground?.() ?? '#1e1e1e'}`,
      'border:1px solid rgba(128,128,128,0.25)',
      `border-left:3px solid ${sideColor}`,
      'border-radius:6px',
      'box-shadow:0 8px 24px rgba(0,0,0,0.45)',
      'padding:10px 12px',
      'font-size:12px',
      `color:${text}`,
      'pointer-events:auto',
      'cursor:default',
      'user-select:none',
    ].join(';')
    const title = document.createElement('div')
    title.style.cssText = 'display:flex;align-items:center;gap:7px'
    const chip = document.createElement('span')
    chip.setAttribute('data-role', 'execution-count')
    chip.textContent = String(g.fills.length)
    chip.style.cssText = `display:inline-flex;align-items:center;justify-content:center;min-width:17px;height:17px;border-radius:9px;background:${sideColor};color:#fff;font-size:10px;padding:0 4px`
    const label = document.createElement('span')
    label.textContent = g.side === 'buy' ? 'Buy' : 'Sell'
    title.append(chip, label)
    el.append(title)
    if (g.fills.length > 1) {
      const sub = document.createElement('div')
      sub.setAttribute('data-role', 'execution-subtitle')
      sub.textContent = `${fmtQty(g.qty)} @ ${g.avgPrice.toFixed(decimalsFor(g.avgPrice))} avg price`
      sub.style.cssText = `margin-top:4px;color:${muted}`
      el.append(sub)
      const head = document.createElement('div')
      head.textContent = 'TRADES'
      head.style.cssText = `margin-top:9px;font-size:9px;letter-spacing:0.09em;color:${muted}`
      el.append(head)
    }
    const table = document.createElement('div')
    table.style.cssText = 'margin-top:5px;display:flex;flex-direction:column;gap:3px'
    for (const f of g.fills) {
      const row = document.createElement('div')
      row.setAttribute('data-role', 'execution-trade')
      row.style.cssText = 'display:flex;gap:6px;align-items:baseline;white-space:nowrap'
      const qty = document.createElement('span')
      qty.textContent = fmtQty(f.qty)
      const at = document.createElement('span')
      at.textContent = '@'
      at.style.color = muted
      const price = document.createElement('span')
      price.textContent = f.price.toFixed(decimalsFor(f.price))
      const when = document.createElement('span')
      when.textContent = fmtWhen(f.timeSecs)
      when.style.cssText = `margin-left:auto;padding-left:14px;color:${muted};font-size:11px`
      row.append(qty, at, price, when)
      table.append(row)
    }
    el.append(table)
    chrome.append(el)
    // Beside the arrow, clamped inside the chrome overlay (which matches the chart box).
    const cw = chrome.clientWidth
    const ch = chrome.clientHeight
    el.style.left = `${Math.max(4, Math.min(hit.x + hit.w + 6, cw - el.offsetWidth - 4))}px`
    el.style.top = `${Math.max(4, Math.min(hit.y + hit.h / 2 - el.offsetHeight / 2, ch - el.offsetHeight - 4))}px`
    card = el
    document.addEventListener('pointerdown', onDocPointerDown, true)
  }

  const onClick = (param: MouseEventParams) => {
    if (destroyed || !param.point) return
    const hit = executionHitAt(hits, param.point.x, param.point.y)
    if (hit) openCard(hit)
    // A miss is handled by the document listener (pointerdown precedes click) — no double-close.
  }
  const onMove = (param: MouseEventParams) => {
    if (destroyed) return
    const over = param.point ? executionHitAt(hits, param.point.x, param.point.y) !== null : false
    chrome.style.cursor = over ? 'pointer' : ''
  }
  chart.subscribeClick(onClick)
  chart.subscribeCrosshairMove(onMove)

  // The v5 pane-view law (see sessions.ts): zOrder is a METHOD, and nothing invalidates the pane
  // when our data changes — set()/setScope() poke requestUpdate themselves.
  const primitive = {
    paneViews() {
      return [{ zOrder: () => 'top' as const, renderer: () => renderer }]
    },
    attached(param: { requestUpdate?: () => void }) {
      requestUpdate = param?.requestUpdate ?? null
    },
    detached() {
      requestUpdate = null
    },
  }
  series.attachPrimitive(primitive as never)

  return {
    set(scope, executions) {
      if (destroyed) return
      sets[scope] = executions
      if (scope === activeScope) {
        closeCard()
        requestUpdate?.()
      }
    },
    setScope(scope) {
      if (destroyed || scope === activeScope) return
      activeScope = scope
      closeCard()
      requestUpdate?.()
    },
    scope: () => activeScope,
    destroy() {
      if (destroyed) return
      destroyed = true
      closeCard()
      chrome.style.cursor = ''
      chart.unsubscribeClick(onClick)
      chart.unsubscribeCrosshairMove(onMove)
      series.detachPrimitive(primitive as never)
    },
  }
}

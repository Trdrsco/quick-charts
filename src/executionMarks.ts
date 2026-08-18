// Execution marks — the reference platform's model, measured from its live chart and DOM and
// reproduced 1:1. A (bar, side) group renders as the reference's COMPOSITE mark: one chevron head
// PER EXECUTION anchored at the fill price (a buy hangs below its price pointing up at it, a sell
// sits above pointing down), overlapping heads stacked at a 4px pitch sharing ONE shaft after the
// farthest head, and a "qty @ price" label beyond the shaft (total qty @ volume-weighted average
// for a stack). Clicking a mark opens the card that aggregates the group: count chip, Buy/Sell
// title, an "N @ avg price" subtitle once grouped, and a TRADES table of the individual fills.
//
// The glyph is the reference's exact raster (1× dpr): a trapezoid head — 4px flat tip widening
// 6→8→10 over 5 rows — and a 2px shaft for 8 rows after the last head. Two same-price fills
// reproduce its measured 17-row union exactly (head rows 0–4 and 4–8, one shaft). The card is the
// measured anatomy: #131722 surface, 6px radius, 4px side-color stripe, 0 2px 4px shadow, 20px
// circle chip (12px/700), 18px/600 title, 13px body cells, 11px 'TRADES' header at 0.4px
// tracking, muted dates.
//
// Two ISOLATED scopes carry two histories: 'live' (the armed account's fills) and 'replay' (a
// replay session's simulated fills). Only the active scope draws — replay fills never appear on a
// live chart and live fills never appear inside a replay, because a mark on the wrong timeline is
// a lie about where money moved. The host flips the scope when replay starts/exits, and clears
// the live scope when the ARMED ACCOUNT changes — fills are scoped to the account that made them.
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

/** One click-card group: every fill of one side whose time lands in one bar. Exported for tests. */
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

/** Group executions per (containing bar, side) — the aggregation the click card shows. Fills
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

/** The reference glyph, reproduced LITERALLY from its measured 1× raster: a 10×13 up-arrow — a
 *  2px shaft the full height, and a barb pair whose per-row cells are the head rows below. Drawn
 *  as row rects so the raster is exact by construction and scales integrally with dpr. */
const ARROW_W = 10
const ARROW_LEN = 13 // tip row through shaft end
/** The head's per-row cells (col spans within the 10-wide glyph), tip row first — the measured
 *  runs: [3,6] / [2,7] / [1,8] / [0,1]+[8,9] / [0]+[9], with the 2px shaft at cols [4,5]. */
const ARROW_HEAD_ROWS: readonly (readonly [number, number])[][] = [
  [[3, 6]],
  [[2, 7]],
  [[1, 8]],
  [[0, 1], [8, 9]],
  [[0, 0], [9, 9]],
]
const ARROW_SHAFT_COLS: readonly [number, number] = [4, 5]
/** Tip-to-price gap: the arrow points essentially AT the level. */
const ARROW_GAP = 1
/** A mark never overlaps its bar: the tip clamps at least this far beyond the bar's extreme
 *  (below the low for buys, above the high for sells). */
const BAR_CLEAR = 3
/** Stacked barb-pair pitch (tip to tip) — the measured union of two same-price fills. */
const ARROW_STACK_PITCH = 4
/** Label offset past the shaft end, and its type scale (the reference's body text). */
const LABEL_GAP = 4
const LABEL_FONT_PX = 13
const LABEL_FONT_FAMILY = "'Inter Variable', -apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif"
const HIT_PAD = 3

/** One composite mark: chevron tips (one per fill, 4px pitch when stacked), the group's shaft
 *  after the last head, and the run's label content. */
export interface ArrowRun {
  readonly tips: readonly number[]
  readonly qty: number
  readonly avgPrice: number
}

/** Plan a (bar, side) group's composite marks: each fill anchors at its own price coordinate;
 *  a fill whose natural anchor would land inside the run being built stacks its barb pair 4px
 *  past the previous one (away from the price) on the shared shaft, while a fill anchored clear
 *  of the run starts a NEW run with its own shaft and label. Anchors arrive as tip-y values
 *  (price coordinate + gap); buys extend downward, sells upward. Exported for tests. */
export function planExecutionRuns(anchors: readonly { tipY: number; qty: number; price: number }[], side: 'buy' | 'sell'): ArrowRun[] {
  if (anchors.length === 0) return []
  const dir = side === 'buy' ? 1 : -1
  // Nearest-to-price first along the extension direction, so stacks grow away from the level.
  const sorted = [...anchors].sort((a, b) => (a.tipY - b.tipY) * dir)
  const runs: { tips: number[]; fills: { qty: number; price: number }[] }[] = []
  for (const a of sorted) {
    const run = runs[runs.length - 1]
    const lastTip = run?.tips[run.tips.length - 1]
    // Inside the previous mark's extent (tip through shaft end) ⇒ stack onto it.
    if (run && lastTip !== undefined && (a.tipY - lastTip) * dir < ARROW_LEN) {
      run.tips.push(lastTip + ARROW_STACK_PITCH * dir)
      run.fills.push({ qty: a.qty, price: a.price })
    } else {
      runs.push({ tips: [a.tipY], fills: [{ qty: a.qty, price: a.price }] })
    }
  }
  return runs.map((r) => {
    const qty = r.fills.reduce((s, f) => s + f.qty, 0)
    return { tips: r.tips, qty, avgPrice: r.fills.reduce((s, f) => s + f.price * f.qty, 0) / qty }
  })
}

/** A drawn group's hit box in chart CSS pixels (the union of its marks and labels), rebuilt on
 *  every paint. Exported for tests. */
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

/** Card/label price decimals when the host declares no precision: enough to show the value
 *  faithfully. Exported for tests. */
export function executionPriceDecimals(price: number): number {
  const a = Math.abs(price)
  if (a >= 1) return 2
  if (a >= 0.01) return 4
  return 6
}

/** The click card's palette — a host passes its own design system's tokens; the defaults are a
 *  neutral dark. The stripe and count chip always take the SIDE color. */
export interface ExecutionCardPalette {
  background: string
  /** The 1px outline (elevation-by-outline hosts pass their ring token; shadow may be 'none'). */
  ring: string
  shadow: string
  /** Title ink / row ink / de-emphasized ink (section header, dates). */
  text: string
  secondaryText: string
  mutedText: string
}

export interface ExecutionMarksOptions {
  /** Side colors, read per paint so a theme change needs no re-attach. */
  buyColor(): string
  sellColor(): string
  /** The "qty @ price" label color (the chart's text color). Defaults to the reference's
   *  dark-theme text. */
  textColor?(): string
  /** Draw the "qty @ price" labels beside the arrows. Read per paint; absent = OFF (arrows
   *  alone — the product default). */
  labels?(): boolean
  /** Card/label price decimals (the resolved symbol's tick decimals). Null falls back to a
   *  magnitude heuristic — the price scale formats the axis. */
  precision?(): number | null
  /** Card palette override (read when a card opens). */
  card?(): ExecutionCardPalette
}

export interface ExecutionMarksHandle {
  /** Replace one scope's executions. Painting is by the ACTIVE scope only; replacing the active
   *  scope closes any open card (its group may no longer exist). */
  set(scope: ExecutionScope, executions: readonly ChartExecution[]): void
  /** Flip which history draws — the host calls this on replay start/exit. Closes any open card. */
  setScope(scope: ExecutionScope): void
  scope(): ExecutionScope
  /** Repaint now — the option getters (colors, labels, precision) are read per paint and NOTHING
   *  in the chart invalidates the pane when one changes; the host pokes this on a settings flip
   *  (the session-bands contract). */
  refresh(): void
  destroy(): void
}

const fmtQty = (n: number): string => String(Number(n.toFixed(9)))
/** The reference's row date: "Tue, Aug 18, 15:41". */
const fmtWhen = (secs: number): string =>
  new Date(secs * 1000).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })

/** The default card palette (a neutral dark); hosts pass their own via `card()`. */
const DEFAULT_CARD: ExecutionCardPalette = {
  background: '#131722',
  ring: 'rgba(148,163,184,0.14)',
  shadow: '0 2px 4px rgba(0,0,0,0.4)',
  text: '#fafafa',
  secondaryText: 'rgb(209,212,220)',
  mutedText: 'rgb(134,137,147)',
}
const CARD_TEXT = 'rgb(209,212,220)'

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

  const decimalsFor = (price: number): number => opts.precision?.() ?? executionPriceDecimals(price)

  const renderer = {
    draw(target: unknown) {
      hits = []
      const executions = sets[activeScope]
      if (executions.length === 0) return
      // REAL bars only, numeric times only — whitespace points must not become containing bars.
      const bars: { time: number; high?: number; low?: number; close?: number; value?: number }[] = []
      for (const b of series.data() as { time: Time; high?: number; low?: number; close?: number; value?: number }[]) {
        if (typeof b.time === 'number' && (typeof b.close === 'number' || typeof b.value === 'number'))
          bars.push({ time: b.time, high: b.high, low: b.low, close: b.close, value: b.value })
      }
      if (bars.length === 0) return
      const barTimes = bars.map((b) => b.time)
      const byTime = new Map<number, (typeof bars)[number]>()
      for (const b of bars) byTime.set(b.time, b)
      const groups = groupExecutionsByBar(executions, barTimes)
      if (groups.length === 0) return
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
          const x = ts.timeToCoordinate(g.barTime as Time)
          if (x == null) continue // off-screen
          const up = g.side === 'buy' // a buy hangs BELOW its price pointing up at it
          const dir = up ? 1 : -1
          // A mark never overlaps its candle: the tip anchors at the fill price but clamps to at
          // least BAR_CLEAR beyond the bar's extreme (below the low / above the high).
          const bar = byTime.get(g.barTime)
          const extreme = bar ? (up ? (bar.low ?? bar.value ?? bar.close) : (bar.high ?? bar.value ?? bar.close)) : undefined
          const extremeY = extreme != null ? series.priceToCoordinate(extreme) : null
          const anchors: { tipY: number; qty: number; price: number }[] = []
          for (const f of g.fills) {
            const py = series.priceToCoordinate(f.price)
            if (py == null) continue // price outside the visible scale — that fill's mark clips
            const natural = py + ARROW_GAP * dir
            const cleared = extremeY == null ? natural : up ? Math.max(natural, extremeY + BAR_CLEAR) : Math.min(natural, extremeY - BAR_CLEAR)
            anchors.push({ tipY: cleared, qty: f.qty, price: f.price })
          }
          const runs = planExecutionRuns(anchors, g.side)
          if (runs.length === 0) continue
          const labelsOn = opts.labels?.() === true
          let yMin = Number.POSITIVE_INFINITY
          let yMax = Number.NEGATIVE_INFINITY
          let widest = ARROW_W
          // Integral device-pixel placement: the glyph's left edge sits at the snapped bar center
          // minus half its width, and every cell is a whole-pixel rect — the raster is the
          // measured reference mask exactly, never an antialiased approximation.
          const xDev = Math.round(x * hr)
          const leftDev = xDev - Math.round((ARROW_W / 2) * hr)
          const cell = (tipDev: number, row: number, c0: number, c1: number) => {
            const yTop = dir === 1 ? tipDev + row * vr : tipDev - (row + 1) * vr
            ctx.fillRect(leftDev + c0 * hr, yTop, (c1 - c0 + 1) * hr, vr)
          }
          for (const run of runs) {
            const tip0 = run.tips[0]!
            const lastTip = run.tips[run.tips.length - 1]!
            const shaftEndY = lastTip + ARROW_LEN * dir
            ctx.fillStyle = up ? opts.buyColor() : opts.sellColor()
            // One shaft from the nearest tip through 13 rows past the farthest (the reference's
            // stack shares a single shaft)…
            const tip0Dev = Math.round(tip0 * vr)
            const shaftRows = Math.round(Math.abs(shaftEndY - tip0))
            const shaftTop = dir === 1 ? tip0Dev : tip0Dev - shaftRows * vr
            ctx.fillRect(leftDev + ARROW_SHAFT_COLS[0] * hr, shaftTop, (ARROW_SHAFT_COLS[1] - ARROW_SHAFT_COLS[0] + 1) * hr, shaftRows * vr)
            // …and a barb pair at every tip (4px pitch when stacked).
            for (const tipY of run.tips) {
              const tipDev = Math.round(tipY * vr)
              for (let r = 0; r < ARROW_HEAD_ROWS.length; r++) {
                for (const [c0, c1] of ARROW_HEAD_ROWS[r]!) cell(tipDev, r, c0, c1)
              }
            }
            yMin = Math.min(yMin, tip0, shaftEndY)
            yMax = Math.max(yMax, tip0, shaftEndY)
            if (labelsOn) {
              // The run's label: "qty @ price" beyond the shaft (total @ volume-weighted average
              // for a stack), in the chart's text color — the reference's default-on labels.
              const label = `${fmtQty(run.qty)} @ ${run.avgPrice.toFixed(decimalsFor(run.avgPrice))}`
              ctx.fillStyle = opts.textColor?.() ?? CARD_TEXT
              ctx.font = `${LABEL_FONT_PX * vr}px ${LABEL_FONT_FAMILY}`
              ctx.textAlign = 'center'
              ctx.textBaseline = up ? 'top' : 'bottom'
              ctx.fillText(label, xDev, (shaftEndY + LABEL_GAP * dir) * vr)
              widest = Math.max(widest, ctx.measureText(label).width / hr)
              const labelEdge = shaftEndY + (LABEL_GAP + LABEL_FONT_PX + 2) * dir
              yMin = Math.min(yMin, labelEdge)
              yMax = Math.max(yMax, labelEdge)
            }
          }
          // One hit box per GROUP — marks plus labels; a click anywhere on it opens the
          // aggregated card, like the reference.
          hits.push({
            group: g,
            x: x - widest / 2 - HIT_PAD,
            y: yMin - HIT_PAD,
            w: widest + HIT_PAD * 2,
            h: yMax - yMin + HIT_PAD * 2,
          })
        }
      })
    },
  }

  const openCard = (hit: ArrowHit) => {
    closeCard()
    const g = hit.group
    const sideColor = g.side === 'buy' ? opts.buyColor() : opts.sellColor()
    const pal = opts.card?.() ?? DEFAULT_CARD
    const el = document.createElement('div')
    el.setAttribute('data-role', 'execution-card')
    // The reference's anatomy (side stripe, chip+title, subtitle, TRADES rows) in the HOST's card
    // tokens: its sheet surface, ring outline, type scale — so the card sits beside the host's
    // other popovers as one family.
    el.style.cssText = [
      'position:absolute',
      'z-index:12',
      'min-width:200px',
      'max-width:320px',
      `background:${pal.background}`,
      `border:1px solid ${pal.ring}`,
      `border-left:4px solid ${sideColor}`,
      'border-radius:6px',
      `box-shadow:${pal.shadow}`,
      'padding:10px 12px 14px 14px',
      'font-size:13px',
      `color:${pal.secondaryText}`,
      'pointer-events:auto',
      'cursor:default',
      'user-select:none',
    ].join(';')
    const title = document.createElement('div')
    title.style.cssText = 'display:inline-flex;align-items:center;margin:2px 0 10px'
    const chip = document.createElement('span')
    chip.setAttribute('data-role', 'execution-count')
    chip.textContent = String(g.fills.length)
    chip.style.cssText = `display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;border-radius:50px;background:${sideColor};color:#fff;font-size:10px;font-weight:500;padding:0 2px;margin-right:8px`
    const label = document.createElement('span')
    label.textContent = g.side === 'buy' ? 'Buy' : 'Sell'
    label.style.cssText = `font-size:15px;font-weight:500;color:${pal.text}`
    title.append(chip, label)
    el.append(title)
    if (g.fills.length > 1) {
      const sub = document.createElement('div')
      sub.setAttribute('data-role', 'execution-subtitle')
      sub.textContent = `${fmtQty(g.qty)} @ ${g.avgPrice.toFixed(decimalsFor(g.avgPrice))} avg price`
      sub.style.cssText = `font-size:13px;color:${pal.secondaryText};margin-bottom:10px`
      el.append(sub)
      const head = document.createElement('div')
      head.textContent = 'TRADES'
      head.style.cssText = `font-size:10px;letter-spacing:0.4px;color:${pal.mutedText};margin-bottom:6px`
      el.append(head)
    }
    const table = document.createElement('div')
    table.style.cssText = 'display:flex;flex-direction:column;gap:2px'
    for (const f of g.fills) {
      const row = document.createElement('div')
      row.setAttribute('data-role', 'execution-trade')
      row.style.cssText = 'display:flex;align-items:baseline;white-space:nowrap;height:18px;font-variant-numeric:tabular-nums'
      const qty = document.createElement('span')
      qty.textContent = fmtQty(f.qty)
      qty.style.cssText = 'padding-right:8px;text-align:right'
      const at = document.createElement('span')
      at.textContent = '@'
      at.style.cssText = 'padding-right:2px'
      const price = document.createElement('span')
      price.textContent = f.price.toFixed(decimalsFor(f.price))
      const when = document.createElement('span')
      when.textContent = fmtWhen(f.timeSecs)
      when.style.cssText = `margin-left:auto;padding-left:16px;color:${pal.mutedText};font-size:13px`
      row.append(qty, at, price, when)
      table.append(row)
    }
    el.append(table)
    chrome.append(el)
    // Beside the mark, clamped inside the chrome overlay (which matches the chart box).
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
    refresh() {
      if (!destroyed) requestUpdate?.()
    },
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

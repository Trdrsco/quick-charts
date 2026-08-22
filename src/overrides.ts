// The chart's full override tree — every host-tunable visual in ONE typed structure, package-owned
// and engine-free (the same law as ChartDatafeed). The app persists ONE value of this shape; a B2B
// host passes a partial and mergeOverrides() deep-fills the defaults. `appearance.*` is the candle
// canvas; `trading.*` drives every trade-line color/width/visibility the broker layer renders.
export interface ChartOverrides {
  appearance: {
    background: string
    upColor: string
    downColor: string
    /** Candle anatomy, TradingView-style: the border ring and the wick are their OWN colors per
     *  direction — they do NOT follow upColor/downColor; each is set independently. */
    borderUpColor: string
    borderDownColor: string
    wickUpColor: string
    wickDownColor: string
    grid: boolean
    /** Shade pre-market / after-hours / overnight stretches. */
    sessions: boolean
    /** Bar-close countdown pill on the price scale. */
    countdown: boolean
  }
  trading: {
    /** Buy-side line/marker color (position long, buy orders, buy execution marks). */
    buyColor: string
    /** Sell-side line/marker color. */
    sellColor: string
    /** A resting TAKE PROFIT's line + pill. Coloured by the LEG, not the side: a target is green on a
     *  long and on a short alike, because the pair reads as "my target" and "my risk". */
    tpColor: string
    /** A resting STOP LOSS's line + pill — amber for the same reason, and deliberately NOT the
     *  sell-side red, which would collide with a short's own entry lines. */
    slColor: string
    /** Draw the position average line (with P&L + ⇄/✕ affordances when armed). */
    showPositions: boolean
    /** Draw working-order lines (draggable to reprice when armed). */
    showOrders: boolean
    /** One width for EVERY trade line. A position and its exits are the same class of object, and a
     *  separate width per class only ever produced an accidental hierarchy. */
    lineWidth: 1 | 2 | 3
    /** Buy/sell execution arrows from the fill ledger. */
    executionMarks: boolean
    /** The "qty @ price" labels beside execution arrows (off by default — arrows alone). */
    executionLabels: boolean
    /** Position-line P&L unit: broker money, tick distance, or percent from entry. */
    pnlMode: 'money' | 'ticks' | 'percent'
  }
}

/** The brand palette, single-sourced: `resolveTheme()` and the TRADE-LINE defaults reference these —
 *  a rebrand edits two strings and every surface that speaks for trdrs follows. It no longer reaches
 *  the candle bodies; see the note on DEFAULT_OVERRIDES for why that split is deliberate. */
export const BRAND_UP = '#4c98fb'
export const BRAND_DOWN = '#f23645'

// The shipped default IS the owner's own chart, copied leaf for leaf off his account (owner call
// 2026-08-20): a warm paper canvas with teal/orange candles ringed and wicked in solid black.
//
// So the CANVAS stops tracking BRAND_UP/BRAND_DOWN while the TRADE LINES keep them, and that split
// is the point rather than a miss: candles are the market, trade lines are your money sitting on it,
// and the brand pair now marks only the second. `buyColor` staying BRAND_UP is that rule, not a
// leftover.
//
// `background` is LIGHT, and it is the one leaf here that changes what the rest of the chart must
// cope with. Everything downstream already does — ChartPanel sets `data-chart-ink` off
// isLightBackground(), which inverts the on-canvas DOM (legend, countdown, trade pills) — so verify
// that attribute still resolves if this value ever moves back across the light/dark line.
export const DEFAULT_OVERRIDES: ChartOverrides = {
  appearance: {
    background: '#ece7c0',
    upColor: '#26a69a',
    downColor: '#ffa726',
    // Candle anatomy: solid black ring and wick, the SAME ink both directions — not a shade of the
    // body color the way the old brand-pair defaults were. On a paper canvas the black is what
    // separates a candle from the background, and that job does not change with direction.
    borderUpColor: '#000000',
    borderDownColor: '#000000',
    wickUpColor: '#000000',
    wickDownColor: '#000000',
    grid: true,
    sessions: true,
    countdown: true,
  },
  trading: {
    buyColor: BRAND_UP,
    // Amber rather than BRAND_DOWN: the canvas already spends orange-red on down candles, so a sell
    // line in the brand red would read as one more candle instead of as an order of yours.
    sellColor: '#f5a623',
    tpColor: '#089981',
    slColor: '#ff9800',
    showPositions: true,
    showOrders: true,
    lineWidth: 1,
    executionMarks: true,
    executionLabels: false,
    pnlMode: 'money',
  },
}

/** A recursive partial of the tree — what a host supplies. */
export type PartialOverrides = {
  [S in keyof ChartOverrides]?: Partial<ChartOverrides[S]>
}

/** Deep-fill a partial over the defaults. One level of nesting by design — the tree is two levels
 *  (section → leaf) and stays that way; new leaves are additive. */
export function mergeOverrides(partial?: PartialOverrides | null): ChartOverrides {
  return layerOverrides(DEFAULT_OVERRIDES, partial)
}

/** The precedence composer: deep-fill any number of partials over an explicit BASE, later layers
 *  winning leaf by leaf. The widget's look resolves through this — its theme-derived floor, then
 *  the host's constructor partial, then runtime applyOverrides calls — which is TradingView's own
 *  override ladder (runtime beats constructor beats theme) expressed as one pure function. */
export function layerOverrides(base: ChartOverrides, ...partials: (PartialOverrides | null | undefined)[]): ChartOverrides {
  const out: ChartOverrides = { appearance: { ...base.appearance }, trading: { ...base.trading } }
  for (const p of partials) {
    if (!p) continue
    Object.assign(out.appearance, p.appearance ?? {})
    Object.assign(out.trading, p.trading ?? {})
  }
  return out
}

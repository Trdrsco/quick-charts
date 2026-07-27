// The chart's full override tree — every host-tunable visual in ONE typed structure, package-owned
// and engine-free (the same law as ChartDatafeed). The app persists ONE value of this shape; a B2B
// host passes a partial and mergeOverrides() deep-fills the defaults. `appearance.*` is the candle
// canvas; `trading.*` drives every trade-line color/width/visibility the broker layer renders.
export interface ChartOverrides {
  appearance: {
    background: string
    upColor: string
    downColor: string
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
    /** Position-line P&L unit: broker money, tick distance, or percent from entry. */
    pnlMode: 'money' | 'ticks' | 'percent'
  }
}

/** The brand palette, single-sourced: theme defaults and override defaults reference these — a
 *  rebrand edits two strings, and every surface (candles, trade lines, marks) follows. */
export const BRAND_UP = '#4c98fb'
export const BRAND_DOWN = '#f23645'

export const DEFAULT_OVERRIDES: ChartOverrides = {
  appearance: {
    background: '#141414',
    upColor: BRAND_UP,
    downColor: BRAND_DOWN,
    grid: true,
    sessions: true,
    countdown: true,
  },
  trading: {
    buyColor: BRAND_UP,
    sellColor: BRAND_DOWN,
    tpColor: '#089981',
    slColor: '#ff9800',
    showPositions: true,
    showOrders: true,
    lineWidth: 1,
    executionMarks: true,
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
  return {
    appearance: { ...DEFAULT_OVERRIDES.appearance, ...(partial?.appearance ?? {}) },
    trading: { ...DEFAULT_OVERRIDES.trading, ...(partial?.trading ?? {}) },
  }
}

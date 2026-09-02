// The chart's override tree — every host-tunable visual of the chart itself in ONE typed structure,
// package-owned and engine-free (the same law as ChartDatafeed). A host passes a partial and
// mergeOverrides() deep-fills the defaults. `appearance.*` is the candle canvas: what a chart
// draws for the market. Anything drawn for an account is an extension's own look, held beside
// this tree by the host that composes both, never inside it.
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
}

/** The brand palette, single-sourced: any surface that speaks for trdrs reads these (the trading
 *  extension's buy line among them), and a rebrand edits two strings. The pair does not reach the
 *  candle bodies; see the note on DEFAULT_OVERRIDES for why. */
export const BRAND_UP = '#4c98fb'
export const BRAND_DOWN = '#f23645'

// The shipped default IS the owner's own chart, copied leaf for leaf off his account (// 2026-08-20): a warm paper canvas with teal/orange candles ringed and wicked in solid black.
//
// The CANVAS does not track BRAND_UP/BRAND_DOWN, and that is the point rather than a miss: candles
// are the market, and the brand pair marks what speaks for trdrs on top of it.
//
// `background` is LIGHT, and it is the one leaf here that changes what the rest of the chart must
// cope with. Everything downstream already does — ChartPanel sets `data-chart-ink` off
// isLightBackground(), which inverts the on-canvas DOM (legend, countdown) — so verify that
// attribute still resolves if this value ever moves back across the light/dark line.
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
  const out: ChartOverrides = { appearance: { ...base.appearance } }
  for (const p of partials) {
    if (!p) continue
    Object.assign(out.appearance, p.appearance ?? {})
  }
  return out
}

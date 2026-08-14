# @trdrs/chart

## 0.2.0 — 2026-08-14

- **`knownMarketKind(catalogType, served?)`** added — the honest sibling of `marketKindOf`: returns
  `null` (new exported alias `MaybeMarketKind`) when the session model is not actually known,
  including the case a served `'futures'` rides an unrecognized display type (indistinguishable
  from the wire mapping's catch-all default). `marketKindOf` is unchanged.
- **`createSessionBands`** — the `kind` getter is widened to `MarketKind | null`
  (source-compatible: a narrower getter still satisfies it); a null draws nothing. The primitive
  now returns **`SessionBandsPrimitive`**, adding `refresh()` — hosts must call it when the model
  changes outside a chart repaint, or the new bands appear only on the next incidental paint.
- Session math (`sessionOf`, `sessionTimeline`, `exchangeZoneOf`, `nextSessionChange`) now
  tolerates a kind from outside the union (decoded storage, a newer wire): classifies `closed`
  instead of throwing mid-paint.

## 0.1.0 — 2026-08-06

Initial release. The datafeed-driven trading chart widget: candles + volume, the indicator
pipeline (manifest + injected compute; panes, histograms, areas, markers, levels, band fills),
drawings with per-symbol persistence and a built-in rail, bar replay with sub-bar forming,
session bands, scale modes, the legend chrome (scale chips, per-chip settings gear, pane
collapse/maximize/restore, eyes), and the presence-driven trading plane (`TradingAdapter` /
`ChartBroker` seams: trade lines, order ticket with per-intent idempotency and the confirm gate,
account panel). ESM-only; `createUdfDatafeed` on-ramp included.

# @trdrs/chart

## 0.1.0 — 2026-08-06

Initial release. The datafeed-driven trading chart widget: candles + volume, the indicator
pipeline (manifest + injected compute; panes, histograms, areas, markers, levels, band fills),
drawings with per-symbol persistence and a built-in rail, bar replay with sub-bar forming,
session bands, scale modes, the legend chrome (scale chips, per-chip settings gear, pane
collapse/maximize/restore, eyes), and the presence-driven trading plane (`TradingAdapter` /
`ChartBroker` seams: trade lines, order ticket with per-intent idempotency and the confirm gate,
account panel). ESM-only; `createUdfDatafeed` on-ramp included.

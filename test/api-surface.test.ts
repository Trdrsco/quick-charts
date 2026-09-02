// The API-surface pin — a lightweight stand-in for an api-extractor report: the package's public
// RUNTIME surface as { name: typeof }. A diff here is a SemVer event to decide consciously (a
// removal/rename is breaking → major; an addition → minor, then extend the pin) — never noise to
// appease. Type-only exports are erased at runtime so they cannot be pinned here; the clean-room
// consumer (clean-room/ts-consumer, skipLibCheck: false) compiles against the shipped .d.ts and is
// their gate.
import { describe, expect, it } from 'vitest'
import * as api from '../src/index'

const SURFACE: Record<string, string> = {
  // Unchanged by the extension seam, on purpose: `ChartExtension` and its context, handle, series
  // capabilities, menu rows and command specs are TYPES only. A host writes an object against them
  // and hands it to `ChartWidgetOptions.extensions`; every runtime piece stays inside the chart,
  // which is exactly what lets the chart take back whatever an extension drew. The clean-room
  // consumer compiles those declarations.
  // The free chart's runtime surface holds chart behavior only: nothing here draws, plans or
  // places anything for an account. Chart-native trading is @trdrs/chart-trading's own surface,
  // mounted through the extension seam.
  // Additive (minor): the multi-chart layout plane — arrangement catalog + layout host, 2026-08-22.
  ARRANGEMENTS: 'object',
  LAYOUT_MENU_ROWS: 'object',
  arrangementOf: 'function',
  createChartLayout: 'function',
  // Additive (minor): COMPARE — other symbols beside the charted one, 2026-08-28.
  attachCompare: 'function',
  clipToWindow: 'function',
  COMPARE_COLORS: 'object',
  pickCompareColor: 'function',
  seriesTargetOf: 'function',
  // Additive (minor): the interface language — the widget's own catalog over its own localization runtime, 2026-08-25.
  BUILT_IN_LOCALES: 'object',
  createChartI18n: 'function',
  chartDictionaries: 'object',
  toolName: 'function',
  arrangementName: 'function',
  BRAND_DOWN: 'string',
  BRAND_UP: 'string',
  COLLAPSED_H: 'number',
  DEFAULT_OVERRIDES: 'object',
  FeedUnavailableError: 'function',
  FillBetweenPrimitive: 'function',
  MAIN_MIN_H: 'number',
  PRICE_SCALE_MODE: 'object',
  REPLAY_SPEEDS: 'object',
  SCALE_MODES: 'object',
  SCALE_MODE_OPTIONS: 'object',
  SESSION_DOT: 'object',
  SESSION_LABEL: 'object',
  ShadePrimitive: 'function',
  applyBar: 'function',
  applyPlotOverrides: 'function',
  attachDrawings: 'function',
  attachIndicators: 'function',
  autoIntervalFor: 'function',
  buildManifestPlots: 'function',
  chartContextMenu: 'function',
  coerceScaleMode: 'function',
  composeFormingBar: 'function',
  createChart: 'function',
  createSessionBands: 'function',
  createUdfDatafeed: 'function',
  exchangeZoneOf: 'function',
  effectivePlotColor: 'function',
  indicatorHidden: 'function',
  isCollapsed: 'function',
  isIntradayTf: 'function',
  latestPlotValue: 'function',
  layerOverrides: 'function',
  manifestInputDefaults: 'function',
  knownMarketKind: 'function',
  setHolidayCalendar: 'function',
  marketKindOf: 'function',
  memoryChartStorage: 'function',
  mergeOverrides: 'function',
  mountContextMenu: 'function',
  openInputsEditor: 'function',
  nextSessionChange: 'function',
  olderPageVerdict: 'function',
  overriddenManifest: 'function',
  placeableByWidget: 'function',
  planPaneOp: 'function',
  resolveInitialTf: 'function',
  resolveTheme: 'function',
  sessionOf: 'function',
  sessionTimeline: 'function',
  subIntervalsFor: 'function',
  tfSeconds: 'function',
  tfToUdfResolution: 'function',
  udfResolutionToTf: 'function',
  // ── W1-B ────────────────────────────────────────────────────────────────────────────────────
  // Additive (minor): symbology and its one price formatter, the UDF symbology mapping, and the
  // revisioned saved-resource contract with its in-memory reference store.
  ResourceAbortError: 'function',
  createPriceFormatter: 'function',
  memorySaveLoadAdapter: 'function',
  parseTickBands: 'function',
  tickBandFor: 'function',
  udfPriceFormat: 'function',
  udfSymbolInfo: 'function',
  // ── end W1-B ────────────────────────────────────────────────────────────────────────────────
  // ── W2-C ────────────────────────────────────────────────────────────────────────────────────
  // Additive (minor): the executable theme contract. `THEME_ROLES` is the public semantic role
  // inventory; `createThemeController` is the one runtime surface for mode selection, custom
  // palettes and change subscriptions. Everything else the theme system exposes is type-only, so
  // the clean-room consumer compiling the shipped declarations is its gate.
  THEME_ROLES: 'object',
  createThemeController: 'function',
  // ── end W2-C ────────────────────────────────────────────────────────────────────────────────
  // ── W2-B ────────────────────────────────────────────────────────────────────────────────────
  // Additive (minor): the 23 built-in indicator definitions, bundled from the chart-indicators
  // seam, as one ordered registry. `BuiltInIndicator` and `IndicatorCategory` are types.
  BUILT_IN_INDICATORS: 'object',
  // ── end W2-B ────────────────────────────────────────────────────────────────────────────────
}

describe('quickcharts API surface pin', () => {
  it('exports exactly the pinned names', () => {
    expect(Object.keys(api).sort()).toEqual(Object.keys(SURFACE).sort())
  })

  it('every export keeps its pinned runtime type', () => {
    for (const [name, kind] of Object.entries(SURFACE)) {
      expect(typeof (api as Record<string, unknown>)[name], name).toBe(kind)
    }
  })
})

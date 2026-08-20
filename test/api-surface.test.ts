// The API-surface pin — a lightweight stand-in for an api-extractor report: the package's public
// RUNTIME surface as { name: typeof }. A diff here is a SemVer event to decide consciously (a
// removal/rename is breaking → major; an addition → minor, then extend the pin) — never noise to
// appease. Type-only exports are erased at runtime so they cannot be pinned here; the clean-room
// consumer (clean-room/ts-consumer, skipLibCheck: false) compiles against the shipped .d.ts and is
// their gate.
import { describe, expect, it } from 'vitest'
import * as api from '../src/index'

const SURFACE: Record<string, string> = {
  BRAND_DOWN: 'string',
  BRAND_UP: 'string',
  COLLAPSED_H: 'number',
  DEFAULT_OVERRIDES: 'object',
  EXIT_ZONE_ALPHA: 'number',
  FeedUnavailableError: 'function',
  FillBetweenPrimitive: 'function',
  MAIN_MIN_H: 'number',
  PART_H: 'number',
  PRICE_SCALE_MODE: 'object',
  REPLAY_SPEEDS: 'object',
  SCALE_MODES: 'object',
  SCALE_MODE_OPTIONS: 'object',
  SESSION_DOT: 'object',
  SESSION_LABEL: 'object',
  ShadePrimitive: 'function',
  TRADE_FONT: 'string',
  TRADE_THEME: 'object',
  applyBar: 'function',
  applyPlotOverrides: 'function',
  attachDrawings: 'function',
  attachExecutionMarks: 'function',
  attachIndicators: 'function',
  attachTradeLines: 'function',
  autoIntervalFor: 'function',
  buildManifestPlots: 'function',
  boundBracketPrice: 'function',
  boundStopPrice: 'function',
  buildOrderParts: 'function',
  buildPositionParts: 'function',
  coerceScaleMode: 'function',
  composeFormingBar: 'function',
  createChart: 'function',
  createOrderTicket: 'function',
  createSessionBands: 'function',
  createUdfDatafeed: 'function',
  decimalsOfTick: 'function',
  dispatchPreviewDrop: 'function',
  drawParts: 'function',
  exchangeZoneOf: 'function',
  effectivePlotColor: 'function',
  findPart: 'function',
  fmtPrice: 'function',
  formatPnlMoney: 'function',
  formatPnlPercent: 'function',
  formatPnlTicks: 'function',
  groupExecutionsByBar: 'function',
  hitTestParts: 'function',
  indicatorHidden: 'function',
  isCollapsed: 'function',
  isIntradayTf: 'function',
  isMeaningfulMove: 'function',
  latestPlotValue: 'function',
  layoutParts: 'function',
  localStorageChartStorage: 'object',
  manifestInputDefaults: 'function',
  knownMarketKind: 'function',
  setHolidayCalendar: 'function',
  marketKindOf: 'function',
  memoryChartStorage: 'function',
  mergeOverrides: 'function',
  mountAccountPanel: 'function',
  openInputsEditor: 'function',
  nextSessionChange: 'function',
  normalizeRoot: 'function',
  olderPageVerdict: 'function',
  overriddenManifest: 'function',
  pickHit: 'function',
  placeableByWidget: 'function',
  planBrokerDrop: 'function',
  planPaneOp: 'function',
  planPreviewDrop: 'function',
  resolveInitialTf: 'function',
  resolveTheme: 'function',
  sessionOf: 'function',
  sessionTimeline: 'function',
  snapPrice: 'function',
  subIntervalsFor: 'function',
  tfSeconds: 'function',
  tfToUdfResolution: 'function',
  udfResolutionToTf: 'function',
  unionRect: 'function',
  withAlpha: 'function',
}

describe('@trdrs/chart API surface pin', () => {
  it('exports exactly the pinned names', () => {
    expect(Object.keys(api).sort()).toEqual(Object.keys(SURFACE).sort())
  })

  it('every export keeps its pinned runtime type', () => {
    for (const [name, kind] of Object.entries(SURFACE)) {
      expect(typeof (api as Record<string, unknown>)[name], name).toBe(kind)
    }
  })
})

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
  DEFAULT_OVERRIDES: 'object',
  EXIT_ZONE_ALPHA: 'number',
  FeedUnavailableError: 'function',
  PART_H: 'number',
  TRADE_FONT: 'string',
  TRADE_THEME: 'object',
  applyBar: 'function',
  attachTradeLines: 'function',
  boundBracketPrice: 'function',
  boundStopPrice: 'function',
  buildOrderParts: 'function',
  buildPositionParts: 'function',
  createChart: 'function',
  createUdfDatafeed: 'function',
  decimalsOfTick: 'function',
  dispatchPreviewDrop: 'function',
  drawParts: 'function',
  findPart: 'function',
  fmtPrice: 'function',
  formatPnlMoney: 'function',
  formatPnlPercent: 'function',
  formatPnlTicks: 'function',
  hitTestParts: 'function',
  isMeaningfulMove: 'function',
  layoutParts: 'function',
  localStorageChartStorage: 'object',
  memoryChartStorage: 'function',
  mergeOverrides: 'function',
  normalizeRoot: 'function',
  olderPageVerdict: 'function',
  pickHit: 'function',
  planBrokerDrop: 'function',
  planPreviewDrop: 'function',
  resolveInitialTf: 'function',
  resolveTheme: 'function',
  snapPrice: 'function',
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

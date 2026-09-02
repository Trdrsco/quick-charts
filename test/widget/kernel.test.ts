// The widget kernel's own rules: the bar-series algebra, the capability-declaring feed's opening
// timeframe, the one price formatter every surface writes through, and the title a mounted
// indicator wears.
//
// Where a rule is a pure function it is exercised directly. Where it is a wiring decision no
// runtime assertion in this package can reach — which surface reads which formatter, whether the
// renderer's own logo is on — it is pinned against the source of the module that owns it, the way
// this package pins its other invisible rules.
import { describe, expect, it } from 'vitest'
import { applyBar, resolveInitialTf } from '../../src/widget/chart'
import { indicatorTitleOf } from '../../src/widget/indicators'
import { BUILT_IN_INDICATORS } from '../../src/builtInIndicators'
import { createChartI18n } from '../../src/i18n'
import { chartContextMenu } from '../../src/contextMenu'
import { createPriceFormatter } from '../../src/priceFormatter'
import type { FeedBar } from '../../src/datafeed'
import chartSrc from '../../src/widget/chart.ts?raw'
import indicatorsSrc from '../../src/widget/indicators.ts?raw'
import chartCommandsSrc from '../../src/widget/chartCommands.ts?raw'
import menuSrc from '../../src/widget/menu.ts?raw'
import extensionsSrc from '../../src/widget/extensions.ts?raw'

const bar = (t: number, c = 1): FeedBar => ({ t, o: 1, h: 2, l: 0.5, c, v: 10 })

describe('applyBar', () => {
  it('appends a newer bar', () => {
    const next = applyBar([bar(100)], bar(160))
    expect(next!.map((b) => b.t)).toEqual([100, 160])
  })

  it('mutates the last bar on the same bucket time', () => {
    const next = applyBar([bar(100, 1), bar(160, 2)], bar(160, 3))
    expect(next!.length).toBe(2)
    expect(next![1]!.c).toBe(3)
  })

  it('drops a stale update older than the last bar (never splices history)', () => {
    expect(applyBar([bar(100), bar(160)], bar(100, 9))).toBeNull()
  })

  it('seeds an empty series', () => {
    expect(applyBar([], bar(100))!.map((b) => b.t)).toEqual([100])
  })
})

describe('resolveInitialTf — the capability-declaring feed’s initial-timeframe rule', () => {
  it('keeps the sticky timeframe when the feed declares nothing', () => {
    expect(resolveInitialTf('1m', undefined)).toBe('1m')
    expect(resolveInitialTf('1m', [])).toBe('1m')
  })

  it('keeps the sticky timeframe when the feed declares it', () => {
    expect(resolveInitialTf('4h', ['1m', '4h', '1d'])).toBe('4h')
  })

  it('falls to the feed’s FIRST declared resolution when the sticky timeframe is unservable', () => {
    expect(resolveInitialTf('3m', ['1m', '4h', '1d'])).toBe('1m')
  })

  it('the chart never adjusts the stored preference, only the opening ask', () => {
    // The initial load resolves the timeframe via this rule WITHOUT writing storage or emitting
    // the timeframe event: capability is the feed's property and preference is the viewer's, so a
    // later feed that serves the preferred timeframe gets it back. Pinned in source because losing
    // it (a well-meaning storage.set next to the resolution) is invisible at runtime.
    expect(chartSrc).toContain('tf = resolveInitialTf(tf, cfg.resolutions)')
    expect(chartSrc).not.toMatch(/resolveInitialTf[\s\S]{0,120}storage\.set/)
  })
})

describe('attribution', () => {
  it('the chart disables the renderer’s on-chart logo', () => {
    // The Apache-2.0 attribution for lightweight-charts lives on the product's licenses page, not
    // the chart canvas — an owner decision this pins, because turning the logo back on (or losing
    // the page) is invisible at runtime.
    expect(chartSrc).toContain('attributionLogo: false')
  })
})

describe('one formatter everywhere', () => {
  // A symbol with the Treasury format writes 110'16 on every surface: the main series' price format
  // (the axis, the crosshair and the last-price label), the level menu, and a drawing label all
  // read the ONE symbol formatter. The DOM-free proof is the formatter itself plus the source pins
  // that every surface writes through it; the drawings package proves its own port.
  const treasury = createPriceFormatter({ pricescale: 32, minmov: 1, fractional: true })

  it("the formatter writes 110'16 and the menu quotes exactly that text", () => {
    expect(treasury.format(110.5)).toBe("110'16")
    const labels = chartContextMenu({ priceText: treasury.format(110.5), symbol: 'ZB', indicatorCount: 0, drawingCount: 0 }).map((r) =>
      r.kind === 'item' ? r.label : '',
    )
    expect(labels).toContain("Copy price 110'16")
  })

  it('the series, the level menu, copy-price, the legend rows and the extension seam all write through it', () => {
    expect(chartSrc).toContain("const priceFormat = { type: 'custom' as const, formatter: (price: number) => symbolFormatter.format(price), minMove: minMoveOf(format) }")
    expect(menuSrc).toContain('const priceText = deps.formatter().format(price)')
    expect(chartCommandsSrc).toContain('writeText(deps.formatter().format(level))')
    expect(indicatorsSrc).toContain('formatter.format(value)')
    expect(chartSrc).toContain('drawings.setPricing(format ? minMoveOf(format) : null, (price) => symbolFormatter.format(price))')
    expect(chartSrc).toContain('formatter: () => ({ format: (price) => symbolFormatter.format(price)')
  })

  it('no surface keeps a precision of its own', () => {
    for (const src of [chartSrc, indicatorsSrc, menuSrc, chartCommandsSrc, extensionsSrc]) {
      expect(src).not.toMatch(/toFixed\(2\)(?!\}%)/) // the percent row is the one two-decimal value, and it is not a price
      expect(src).not.toContain('toLocaleString(')
      expect(src).not.toContain('maximumFractionDigits')
    }
  })

  it('drawings snap to the symbol grid: the smallest move the format declares', () => {
    expect(chartSrc).toContain('drawings.setPricing(format ? minMoveOf(format) : null')
    expect(chartSrc).toContain('export const minMoveOf = (format: PriceFormat): number => format.minmov / format.pricescale')
  })
})

describe('the title a mounted indicator wears', () => {
  const sma = BUILT_IN_INDICATORS.find((d) => d.id === 'sma')!
  const t = createChartI18n().t

  it("reads the chart catalog through a built-in's nameKey when the host names nothing", () => {
    expect(sma.manifest.name).toBeUndefined()
    expect(indicatorTitleOf({ id: 'ind-1', definition: sma }, t)).toBe(t(sma.nameKey))
    expect(indicatorTitleOf({ id: 'ind-1', definition: sma }, t)).not.toBe('ind-1')
  })

  it("prefers the host's title, then a manifest name, and falls to the id only for a nameless definition", () => {
    expect(indicatorTitleOf({ id: 'ind-1', definition: sma, title: 'Fast' }, t)).toBe('Fast')
    const named = { ...sma, manifest: { ...sma.manifest, name: 'Named' } }
    expect(indicatorTitleOf({ id: 'ind-1', definition: named }, t)).toBe('Named')
    const bare = { manifest: { ...sma.manifest }, compute: sma.compute }
    expect(indicatorTitleOf({ id: 'ind-1', definition: bare }, t)).toBe('ind-1')
  })
})

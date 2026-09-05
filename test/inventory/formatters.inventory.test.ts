// The formatter inventory cannot rot silently: every file it names exists, every symbol it names
// is still in that file, and every value kind is one of the four. The sources arrive through
// Vite's own glob (this package is browser-typed; no node:fs), root-relative.
import { describe, expect, it } from 'vitest'
import { FORMATTER_SITES, type ValueKind } from './formatters.inventory'

const PACKAGE_SOURCES = import.meta.glob('/packages/{chart,chart-trading,chart-drawings,chart-engine,broker,watchlist,order-ticket,account-manager}/src/**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
})
const APP_SOURCES = import.meta.glob('/apps/web/src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true })
const SOURCES: Record<string, string> = { ...PACKAGE_SOURCES, ...APP_SOURCES }

const KINDS: readonly ValueKind[] = ['symbology', 'execution', 'ledger', 'quote']

describe('the formatter inventory', () => {
  it('has sources to read', () => {
    expect(Object.keys(SOURCES).length).toBeGreaterThan(100)
  })

  it('names files that exist', () => {
    const missing = FORMATTER_SITES.map((s) => s.file).filter((f) => !(`/${f}` in SOURCES))
    expect(missing).toEqual([])
  })

  it('names symbols that are still in their files', () => {
    const gone: string[] = []
    for (const site of FORMATTER_SITES) {
      const text = SOURCES[`/${site.file}`] ?? ''
      for (const symbol of site.symbols) if (!text.includes(symbol)) gone.push(`${site.file}: ${symbol}`)
    }
    expect(gone).toEqual([])
  })

  it('tags every site with one of the four value kinds and a surface', () => {
    for (const site of FORMATTER_SITES) {
      expect(KINDS).toContain(site.kind)
      expect(site.surface.length, site.file).toBeGreaterThan(0)
      expect(site.symbols.length, site.file).toBeGreaterThan(0)
    }
  })

  it('covers every price-bearing surface', () => {
    const files = new Set(FORMATTER_SITES.map((s) => s.file))
    for (const file of [
      'packages/chart/src/datafeed.ts',
      'apps/web/src/integrations/quickcharts/priceFormat.ts',
      'packages/chart-drawings/src/render/canvas.ts',
      'packages/broker/src/index.ts',
      'packages/watchlist/src/widget.ts',
      'apps/web/src/widgets/WatchlistWidget.tsx',
      'packages/order-ticket/src/Panel.tsx',
      'packages/account-manager/src/formatters.ts',
    ])
      expect(files.has(file), file).toBe(true)
    for (const kind of KINDS) expect(FORMATTER_SITES.some((s) => s.kind === kind), kind).toBe(true)
  })
})

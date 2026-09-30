// @vitest-environment happy-dom
// Download chart data: the bars the chart is painting, written as a CSV file the trader can open.
//
// What is pinned here is that the file says what the screen says. The columns and their order are
// the ones a saved file has always had, a timestamp is UTC so it can be read back anywhere, the
// object URL the download rides on is revoked afterwards, and an empty chart writes nothing at all.
// The command itself is registered against the ACTIVE chart's painted bars, which is what makes the
// replay boundary hold: while replay is on, the painted model IS the revealed slice.
import { describe, expect, it, vi, afterEach } from 'vitest'
import { barsToCsv, csvField, dataFileName, downloadBarsCsv } from '../../src/widget/dataExport'
import { createCommandRegistry } from '../../src/widget/commands'
import { registerChartCommands } from '../../src/widget/chartCommands'
import { resolveFeatures, resolveUi } from '../../src/widget/planes'
import { createChartI18n } from '../../src/i18n'
import { fakeChart } from '../chrome/harness'
import type { FeedBar } from '../../src/datafeed'
import type { Capabilities } from '../../src/widget/options'

const BARS: FeedBar[] = [
  { t: 1_700_000_000, o: 1.5, h: 2, l: 1, c: 1.75, v: 120 },
  { t: 1_700_000_060, o: 1.75, h: 2.25, l: 1.5, c: 2, v: 0 },
]

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('the loaded bars as CSV', () => {
  it('writes the header and one row per bar, timestamped in UTC', () => {
    expect(barsToCsv(BARS)).toBe(
      ['time,open,high,low,close,volume', '2023-11-14T22:13:20.000Z,1.5,2,1,1.75,120', '2023-11-14T22:14:20.000Z,1.75,2.25,1.5,2,0'].join('\n'),
    )
  })

  it('writes the header alone for no bars, so an empty file is never mistaken for data', () => {
    expect(barsToCsv([])).toBe('time,open,high,low,close,volume')
  })

  it('leaves a cell empty rather than writing a number the feed did not give', () => {
    const row = barsToCsv([{ t: 1_700_000_000, o: 1, h: 2, l: 1, c: 2, v: undefined as unknown as number }]).split('\n')[1]!
    expect(row.endsWith(',')).toBe(true)
  })

  it('quotes a cell whose own text would otherwise split the row', () => {
    expect(csvField('ES')).toBe('ES')
    expect(csvField('BRK,B')).toBe('"BRK,B"')
    expect(csvField('a "quoted" name')).toBe('"a ""quoted"" name"')
  })
})

describe('the download filename', () => {
  it('names the symbol and the timeframe', () => {
    expect(dataFileName('ES', '5m')).toBe('ES_5m.csv')
  })

  it('replaces what a file system would argue about, a comma or a quote included', () => {
    expect(dataFileName('BRK,B', '1D')).toBe('BRK_B_1D.csv')
    expect(dataFileName('a"b/c', '1m')).toBe('a_b_c_1m.csv')
    expect(dataFileName('', '1m')).toBe('chart_1m.csv')
  })
})

describe('the download itself', () => {
  const spyUrls = () => {
    const created = vi.fn(() => 'blob:chart-data')
    const revoked = vi.fn()
    vi.stubGlobal('URL', Object.assign(Object.create(URL), { createObjectURL: created, revokeObjectURL: revoked }))
    return { created, revoked }
  }

  it('writes a blob through an object URL and revokes it once the click has started', () => {
    vi.useFakeTimers()
    const { created, revoked } = spyUrls()
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    expect(downloadBarsCsv({ bars: BARS, symbol: 'ES', timeframe: '5m' })).toBe(true)
    expect(created).toHaveBeenCalledTimes(1)
    expect(click).toHaveBeenCalledTimes(1)
    // Not yet: revoking before the click's own download starts would cancel it.
    expect(revoked).not.toHaveBeenCalled()
    vi.runAllTimers()
    expect(revoked).toHaveBeenCalledWith('blob:chart-data')
    vi.unstubAllGlobals()
  })

  it('writes nothing at all for an empty chart', () => {
    const { created, revoked } = spyUrls()
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    expect(downloadBarsCsv({ bars: [], symbol: 'ES', timeframe: '5m' })).toBe(false)
    expect(created).not.toHaveBeenCalled()
    expect(revoked).not.toHaveBeenCalled()
    expect(click).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})

describe('the chart.data.download command', () => {
  const mount = (options: { bars: FeedBar[]; access?: (id: string) => boolean }) => {
    const chart = fakeChart({ symbol: 'ES', timeframe: '5m' })
    const handleBars = { current: options.bars }
    const registry = createCommandRegistry(options.access ? { access: { command: options.access } } : undefined)
    const i18n = createChartI18n()
    const unregister = registerChartCommands({
      commands: registry.registry,
      handle: chart.handle,
      features: resolveFeatures(),
    ui: resolveUi(undefined, resolveFeatures()),
      capabilities: () => ({ saveLoad: {}, extensions: [] }) as unknown as Capabilities,
      t: () => i18n.t,
      bars: () => handleBars.current,
      earliestBar: () => null,
      replayFromFirst: async () => undefined,
      resetAppearance: () => undefined,
      frame: () => undefined,
      zoom: () => undefined,
      scroll: () => undefined,
      level: () => null,
      formatter: () => chart.handle.formatter(),
      compareOpen: () => undefined,
      indicatorsOpen: () => undefined,
    symbolSearchOpen: () => undefined,
      drawingVerbs: () => null,
    })
    return { registry: registry.registry, handleBars, dispose: () => (unregister(), registry.dispose()) }
  }

  it('downloads the painted bars under the symbol and timeframe', () => {
    const created = vi.fn(() => 'blob:x')
    vi.stubGlobal('URL', Object.assign(Object.create(URL), { createObjectURL: created, revokeObjectURL: vi.fn() }))
    let name = ''
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      name = this.download
    })
    const chart = mount({ bars: BARS })
    expect(chart.registry.execute('chart.data.download')).toEqual({ kind: 'ok' })
    expect(name).toBe('ES_5m.csv')
    expect(created).toHaveBeenCalledTimes(1)
    chart.dispose()
    vi.unstubAllGlobals()
  })

  it('is unavailable on a chart holding no bars, so no door offers an empty file', () => {
    const chart = mount({ bars: [] })
    expect(chart.registry.available('chart.data.download')).toBe(false)
    expect(chart.registry.execute('chart.data.download')).toEqual({ kind: 'unavailable' })
    chart.dispose()
  })

  // Replay narrows the chart's PAINTED model to the cursor slice, and the command reads that same
  // model, so a bar the cursor has not revealed cannot leave through the file.
  it('writes only what replay has revealed', () => {
    const revealed = BARS.slice(0, 1)
    let written = ''
    vi.stubGlobal('URL', Object.assign(Object.create(URL), { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() }))
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    const blob = vi.spyOn(globalThis, 'Blob').mockImplementation(function (parts: BlobPart[]) {
      written = String(parts[0])
      return {} as Blob
    } as never)
    const chart = mount({ bars: revealed })
    chart.registry.execute('chart.data.download')
    expect(written.split('\n')).toHaveLength(2)
    expect(written).toContain('2023-11-14T22:13:20.000Z')
    expect(written).not.toContain('2023-11-14T22:14:20.000Z')
    blob.mockRestore()
    chart.dispose()
    vi.unstubAllGlobals()
  })

  it('answers denied when the host access policy refuses it, and writes nothing', () => {
    const created = vi.fn(() => 'blob:x')
    vi.stubGlobal('URL', Object.assign(Object.create(URL), { createObjectURL: created, revokeObjectURL: vi.fn() }))
    const chart = mount({ bars: BARS, access: (id) => id !== 'chart.data.download' })
    expect(chart.registry.execute('chart.data.download')).toEqual({ kind: 'denied' })
    expect(created).not.toHaveBeenCalled()
    chart.dispose()
    vi.unstubAllGlobals()
  })
})

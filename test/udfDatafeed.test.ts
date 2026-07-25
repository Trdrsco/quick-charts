import { describe, expect, it, vi } from 'vitest'
import { createUdfDatafeed, tfToUdfResolution, type FetchLike } from '../src/udfDatafeed'

/** A fake UDF server: a route table of path → JSON (or text). Records the URLs it was asked for. */
function fakeUdf(routes: Record<string, unknown>, opts?: { status?: number }) {
  const calls: string[] = []
  const fetch: FetchLike = async (url) => {
    calls.push(url)
    const path = url.replace('https://feed.test', '')
    const key = Object.keys(routes).find((r) => path.startsWith(r))
    const body = key ? routes[key] : undefined
    return {
      ok: body !== undefined && (opts?.status ?? 200) < 400,
      status: body === undefined ? 404 : (opts?.status ?? 200),
      json: async () => body,
      text: async () => String(body),
    }
  }
  return { fetch, calls }
}

const feed = (routes: Record<string, unknown>) => {
  const { fetch, calls } = fakeUdf(routes)
  return { df: createUdfDatafeed({ baseUrl: 'https://feed.test', fetch }), calls }
}

describe('tfToUdfResolution', () => {
  it('maps timeframe tokens to UDF resolutions (hours fold to minutes)', () => {
    expect(tfToUdfResolution('1m')).toBe('1')
    expect(tfToUdfResolution('5m')).toBe('5')
    expect(tfToUdfResolution('1h')).toBe('60')
    expect(tfToUdfResolution('4h')).toBe('240')
    expect(tfToUdfResolution('1d')).toBe('1D')
    expect(tfToUdfResolution('1w')).toBe('1W')
    expect(tfToUdfResolution('1mo')).toBe('1M')
    expect(tfToUdfResolution('30s')).toBe('30S')
    expect(tfToUdfResolution('100t')).toBe('100T')
  })
})

describe('UdfDatafeed.history', () => {
  it('zips the parallel OHLCV arrays into ascending bars', async () => {
    const { df } = feed({ '/history': { s: 'ok', t: [100, 160], o: [1, 2], h: [3, 4], l: [0.5, 1.5], c: [2, 3], v: [10, 20] } })
    const page = await df.history('ES', '1m', { from: 0, to: 200 })
    expect(page.noData).toBe(false)
    expect(page.bars).toEqual([
      { t: 100, o: 1, h: 3, l: 0.5, c: 2, v: 10 },
      { t: 160, o: 2, h: 4, l: 1.5, c: 3, v: 20 },
    ])
  })

  it('maps s:"no_data" to the stop-scrolling-back signal', async () => {
    const { df } = feed({ '/history': { s: 'no_data' } })
    const page = await df.history('ES', '1m', { countBack: 300 })
    expect(page).toEqual({ bars: [], noData: true })
  })

  it('throws on s:"error" (a retryable transport failure, not end-of-history)', async () => {
    const { df } = feed({ '/history': { s: 'error', errmsg: 'boom' } })
    await expect(df.history('ES', '1m')).rejects.toThrow(/boom/)
  })

  it('forwards countBack as the UDF countback param and omits from', async () => {
    const { df, calls } = feed({ '/history': { s: 'ok', t: [], o: [], h: [], l: [], c: [], v: [] } })
    await df.history('ES', '1h', { to: 500, countBack: 42 })
    const url = calls[0]!
    expect(url).toContain('resolution=60')
    expect(url).toContain('countback=42')
    expect(url).not.toContain('from=')
  })
})

describe('UdfDatafeed.resolve', () => {
  it('derives tick + precision from pricescale/minmov', async () => {
    const { df } = feed({ '/symbols': { name: 'ES', ticker: 'ES', description: 'E-mini', exchange: 'CME', type: 'futures', pricescale: 100, minmov: 1 } })
    const info = await df.resolve('ES')
    expect(info).toMatchObject({ symbol: 'ES', exchange: 'CME', tick: 0.01, pricePrecision: 2, provider: null, quotes: false })
  })

  it('returns null for an unknown/error symbol', async () => {
    const { df } = feed({ '/symbols': { s: 'error' } })
    expect(await df.resolve('NOPE')).toBeNull()
  })
})

describe('UdfDatafeed.getQuotes', () => {
  it('echoes one snapshot per requested symbol in order, all-null for an omitted one', async () => {
    const { df } = feed({
      '/quotes': { s: 'ok', d: [{ n: 'ES', s: 'ok', v: { lp: 5000, prev_close_price: 4950, ch: 50, chp: 1.01, open_price: 4960, high_price: 5010, low_price: 4940, volume: 1234 } }] },
    })
    const [es, nq] = await df.getQuotes!(['ES', 'NQ'])
    expect(es).toMatchObject({ symbol: 'ES', last: 5000, prevClose: 4950, change: 50, changePct: 1.01, volume: 1234, spark: [] })
    expect(nq).toMatchObject({ symbol: 'NQ', last: null, change: null })
  })

  it('derives change from last/prevClose when the server omits it', async () => {
    const { df } = feed({ '/quotes': { s: 'ok', d: [{ n: 'ES', v: { lp: 100, prev_close_price: 90 } }] } })
    const [es] = await df.getQuotes!(['ES'])
    expect(es!.change).toBe(10)
  })
})

describe('UdfDatafeed.subscribeBars', () => {
  it('emits an initial snapshot then polls the tail for the newest bar', async () => {
    vi.useFakeTimers()
    try {
      const { df } = feed({ '/history': { s: 'ok', t: [100], o: [1], h: [2], l: [1], c: [2], v: [9] } })
      const events: string[] = []
      const unsub = df.subscribeBars('ES', '1m', {
        onBars: (e) => events.push(e.kind),
        onStatus: (s) => events.push(`status:${s}`),
      })
      await vi.advanceTimersByTimeAsync(0) // resolve the snapshot promise
      expect(events).toContain('snapshot')
      expect(events).toContain('status:live')
      await vi.advanceTimersByTimeAsync(10_000) // one poll tick
      expect(events.filter((e) => e === 'bar').length).toBeGreaterThanOrEqual(1)
      unsub()
    } finally {
      vi.useRealTimers()
    }
  })
})

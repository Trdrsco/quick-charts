import { expect, test } from '@playwright/test'

test('a year preset survives overlapping streamed history and its older page', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(String(error)))
  await page.goto('/')
  await page.waitForFunction(() => Boolean((window as any).quickcharts))
  const result = await page.evaluate(async () => {
    const end = Math.floor(Date.now() / 86_400_000) * 86_400
    const bars = (count: number, step: number) => Array.from({ length: count }, (_, i) => ({
      t: end - (count - 1 - i) * step, o: 100, h: 102, l: 98, c: 101, v: 10,
    }))
    const daily = bars(500, 86_400)
    let initialDone: (page: unknown) => void = () => undefined
    let olderDone: (page: unknown) => void = () => undefined
    const initial = new Promise(resolve => { initialDone = resolve })
    const older = new Promise(resolve => { olderDone = resolve })
    let stream: any
    const container = document.createElement('div')
    container.style.cssText = 'position:absolute;left:0;top:0;width:900px;height:520px'
    document.body.append(container)
    const widget = (window as any).quickcharts.createChart({
      container, symbol: 'ALPHA', timeframe: '30m', datafeed: {
        search: async () => ({ hits: [], hasMore: false }), resolve: async () => null,
        history: (_symbol: string, tf: string, range: { to?: number } = {}) => tf !== '1d'
          ? Promise.resolve({ bars: bars(300, 1800), noData: true })
          : range.to === undefined ? initial : older,
        subscribeBars: (_symbol: string, tf: string, handlers: unknown) => {
          if (tf === '1d') stream = handlers
          return () => undefined
        },
      },
    })
    const frame = () => new Promise(resolve => requestAnimationFrame(resolve))
    await widget.ready()
    await frame()
    await frame()
    widget.commands.execute('chart.range.1Y')
    await Promise.resolve()
    stream.onBars({ kind: 'bar', bar: daily[daily.length - 1] })
    stream.onBars({ kind: 'snapshot', bars: daily, backfill: true })
    olderDone({ bars: daily.slice(-445, -1), noData: false })
    await frame()
    await frame()
    stream.onBars({ kind: 'snapshot', bars: daily })
    initialDone({ bars: daily.slice(-445), noData: false })
    await frame()
    await frame()
    const range = widget.activeChart().visibleRange()
    const preset = widget.activeChart().rangePreset()
    widget.dispose()
    return { range, preset, end }
  })
  expect(result.preset).toBe('1Y')
  expect(result.range.to).toBe(result.end)
  expect((result.range.to - result.range.from) / 86_400).toBe(364)
  expect(errors).toEqual([])
})

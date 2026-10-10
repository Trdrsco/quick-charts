// The watermark the chart settings name: which lines it writes for which parts, and how the layer
// creates, updates and hides the renderer's text watermark. The replay part is the legend's replay
// mark, which the legend look turns on and inks.
import { describe, expect, it, vi } from 'vitest'
import { chartSettingsDefaults } from '../../src/settings/defaults'
import { DARK_THEME } from '../../src/theme/palettes'
import { legendLook } from '../../src/widget/legend'
import { attachWatermark, watermarkLines } from '../../src/widget/watermark'

const facts = { ticker: 'BTCUSDT', interval: '1', description: 'Bitcoin / TetherUS' }
const parts = (ticker: boolean, interval: boolean, description: boolean) => ({ watermarkTicker: ticker, watermarkInterval: interval, watermarkDescription: description })

describe('the watermark lines', () => {
  it('join the ticker and the interval on a large first line and set the description smaller under it', () => {
    expect(watermarkLines(parts(true, false, false), facts)).toEqual([{ text: 'BTCUSDT', fontSize: 80 }])
    expect(watermarkLines(parts(true, true, false), facts)).toEqual([{ text: 'BTCUSDT, 1', fontSize: 80 }])
    expect(watermarkLines(parts(false, true, false), facts)).toEqual([{ text: '1', fontSize: 80 }])
    expect(watermarkLines(parts(true, true, true), facts)).toEqual([
      { text: 'BTCUSDT, 1', fontSize: 80 },
      { text: 'Bitcoin / TetherUS', fontSize: 36 },
    ])
  })

  it('promote a description alone to the first line, and write nothing when no part is asked for', () => {
    expect(watermarkLines(parts(false, false, true), facts)).toEqual([{ text: 'Bitcoin / TetherUS', fontSize: 80 }])
    expect(watermarkLines(parts(false, false, false), facts)).toEqual([])
  })
})

describe('the watermark layer', () => {
  it('creates the renderer watermark on the first line asked for, updates it, and hides it when none is', () => {
    let settings = chartSettingsDefaults(DARK_THEME)
    const applied: Record<string, unknown>[] = []
    const create = vi.fn((_pane: unknown, options: Record<string, unknown>) => {
      applied.push(options)
      return { applyOptions: (next: Record<string, unknown>) => void applied.push(next), detach: vi.fn() }
    })
    const layer = attachWatermark({
      chart: { panes: () => [{}] } as never,
      settings: () => settings,
      facts: () => facts,
      fontFamily: () => 'sans-serif',
      create: create as never,
    })
    expect(create).not.toHaveBeenCalled()
    settings = { ...settings, canvas: { ...settings.canvas, watermarkTicker: true } }
    layer.refresh()
    expect(create).toHaveBeenCalledTimes(1)
    expect(applied[0]).toMatchObject({
      visible: true,
      horzAlign: 'center',
      vertAlign: 'center',
      lines: [{ text: 'BTCUSDT', fontSize: 80, color: DARK_THEME['canvas.watermark'], fontFamily: 'sans-serif' }],
    })
    settings = { ...settings, canvas: { ...settings.canvas, watermarkTicker: false } }
    layer.refresh()
    expect(create).toHaveBeenCalledTimes(1)
    expect(applied.at(-1)).toMatchObject({ visible: false, lines: [] })
    layer.destroy()
  })
})

describe('the replay mark', () => {
  it('shows while replay runs when the watermark names it, in the watermark ink', () => {
    const settings = chartSettingsDefaults(DARK_THEME)
    expect(legendLook(settings)).toMatchObject({ replayMark: true, replayMarkColor: DARK_THEME['canvas.watermark'] })
    expect(legendLook({ ...settings, canvas: { ...settings.canvas, watermarkReplay: false } }).replayMark).toBe(false)
  })
})

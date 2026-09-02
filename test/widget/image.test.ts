// Client image capture. The header strip exists so a shared picture identifies what it shows, and
// so the attribution a host states rides INTO the image. The layout arithmetic is pure and is
// exercised here directly; the canvas painter above it is a thin applier over these runs.
import { describe, expect, it } from 'vitest'
import { imageFileName, imageHeaderRuns, imageLayoutHeaderRuns, imageTileRuns, tileScale, IMAGE_HEADER_H, type ImageHeader, type ImageTile } from '../../src/widget/image'

const header = (over: Partial<ImageHeader> = {}): ImageHeader => ({
  symbol: 'ESU6',
  timeframe: '5m',
  attribution: null,
  background: '#141414',
  ink: '#ffffff',
  inkMuted: '#999999',
  ...over,
})

describe('the single-chart header', () => {
  it('always carries the chart identity, at the ink the theme resolved', () => {
    const runs = imageHeaderRuns(header(), 800)
    expect(runs.map((r) => r.text)).toEqual(['ESU6 · 5m'])
    expect(runs[0]!.align).toBe('left')
    expect(runs[0]!.color).toBe('#ffffff')
  })

  it('carries the host attribution at the right edge, and none when the host states none', () => {
    const marked = imageHeaderRuns(header({ attribution: 'trdrs' }), 800)
    expect(marked.map((r) => r.text)).toEqual(['ESU6 · 5m', 'trdrs'])
    expect(marked[1]!.align).toBe('right')
    expect(marked[1]!.x).toBe(790)
    expect(imageHeaderRuns(header(), 800).some((r) => r.text === 'trdrs')).toBe(false)
  })

  it('places a note after the identity rather than over it', () => {
    const runs = imageHeaderRuns(header({ note: 'data by Hyperliquid' }), 800)
    expect(runs.map((r) => r.text)).toEqual(['ESU6 · 5m', 'data by Hyperliquid'])
    expect(runs[1]!.x).toBeGreaterThan(runs[0]!.x)
    expect(runs[1]!.color).toBe('#999999')
  })

  it('every run fits inside the header strip', () => {
    for (const run of imageHeaderRuns(header({ attribution: 'trdrs', note: 'data by Rithmic' }), 800)) {
      expect(run.y).toBeLessThanOrEqual(IMAGE_HEADER_H)
      expect(run.y).toBeGreaterThan(0)
    }
  })
})

describe('a layout is ONE picture', () => {
  // Every chart at its own place under a single header, each captioned with the market it charts.
  // Exporting the first chart alone would answer a different question than the camera asks.
  const tiles: ImageTile[] = [
    { canvas: { width: 800 } as HTMLCanvasElement, rect: { x: 0, y: 0, w: 0.5, h: 1 }, symbol: 'ESU6', timeframe: '5m' },
    { canvas: { width: 800 } as HTMLCanvasElement, rect: { x: 0.5, y: 0, w: 0.5, h: 1 }, symbol: 'NQU6', timeframe: '1h' },
  ]

  it('the strip carries only what is true of the whole image', () => {
    expect(imageLayoutHeaderRuns(header({ attribution: 'trdrs', note: 'data by Rithmic' }), 800).map((r) => r.text)).toEqual([
      'data by Rithmic',
      'trdrs',
    ])
    expect(imageLayoutHeaderRuns(header(), 800)).toEqual([])
  })

  it('every chart captions itself, below the header and at its own place', () => {
    const runs = imageTileRuns(tiles, 800, 600, IMAGE_HEADER_H, '#ffffff')
    expect(runs.map((r) => r.text)).toEqual(['ESU6 · 5m', 'NQU6 · 1h'])
    expect(runs[0]!.x).toBe(10)
    expect(runs[1]!.x).toBe(410)
    for (const run of runs) expect(run.y).toBeGreaterThan(IMAGE_HEADER_H)
  })

  it('recovers the capture scale from any chart, because each bitmap is its own CSS box', () => {
    // A half-width chart 800 device pixels wide, in a 800-pixel logical widget, was captured at 2x.
    expect(tileScale(tiles[0]!, 800)).toBe(2)
    expect(tileScale({ ...tiles[0]!, rect: { x: 0, y: 0, w: 1, h: 1 } }, 800)).toBe(1)
  })
})

describe('the default file name', () => {
  it('names the chart and the moment, and survives a symbol that is not a file name', () => {
    const at = new Date(Date.UTC(2026, 8, 1, 14, 30, 5))
    expect(imageFileName('ESU6', '5m', at)).toBe('ESU6-5m-2026-09-01-14-30-05.png')
    expect(imageFileName('BTC/USDC', '1m', at)).toBe('BTC-USDC-1m-2026-09-01-14-30-05.png')
  })
})

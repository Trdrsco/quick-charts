// @vitest-environment happy-dom
// A layer drawing on the chart's bundled artwork paints an emoji as text until the artwork
// arrives, then hands every drawing the source again, which repaints them with it. A layer the host
// gave a source of its own, and a layer already gone, are left alone.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { attachDrawings } from '../../src/drawings'
import { bundledGlyphSource, loadBundledArtwork } from '../../src/drawings/emoji'
import { DrawingManager } from '../../src/internal/drawings/index'
import { fakeChart } from './fakeChart'

const layer = (glyphSource?: (glyph: string) => string | null) => {
  const fake = fakeChart()
  const container = document.createElement('div')
  document.body.appendChild(container)
  return attachDrawings({ chart: fake.chart, series: fake.series, container, symbol: 'ES', timeframe: '5m', ...(glyphSource ? { glyphSource } : {}) })
}

afterEach(() => {
  vi.restoreAllMocks()
  document.body.replaceChildren()
})

describe('the bundled artwork arriving', () => {
  it('repaints the drawings of a live layer on the bundled artwork, and of no other', async () => {
    const handed = vi.spyOn(DrawingManager.prototype, 'setGlyphSource')
    const own = (glyph: string) => `/art/${glyph.codePointAt(0)}.svg`
    const live = layer()
    const hosted = layer(own)
    layer().destroy()
    expect(handed.mock.calls.map(([source]) => source)).toEqual([bundledGlyphSource, own, bundledGlyphSource])
    expect(bundledGlyphSource('😀')).toBeNull()
    await loadBundledArtwork()
    expect(handed.mock.calls.slice(3)).toEqual([[bundledGlyphSource]])
    expect(handed.mock.contexts[3]).toBe(handed.mock.contexts[0])
    live.destroy()
    hosted.destroy()
  })
})

// @vitest-environment happy-dom
// The ACTIVE CHART RING in a multi-chart layout, pinned to the source it was restored from: the
// baseline drew a one-pixel inset ring in the focus colour at 60%, rounded on the outer TOP corners
// only, painted over the chart canvas and under the drag dividers, and drew nothing at all when the
// layout held a single chart. Quick Charts draws the same mark from its own tokens, as an outline on
// the pane element rather than an overlay div, because an outline paints in the last step of its
// stacking context and therefore lands above the canvas an inset box-shadow was overpainted by.
//
// Two halves are pinned here because the mark needs both: the DOM state the layout writes as tiles
// are activated, re-tiled and maximized, and the CSS recipe those data attributes select. Neither
// half alone is the ring.
import { beforeAll, afterEach, describe, expect, it } from 'vitest'
import { createChart } from '../../src/widget/create'
import type { ChartDatafeed, FeedBar } from '../../src/datafeed'
import { authoredStylesheets } from '../theme/stylesheetSource'

beforeAll(() => {
  const written: Record<PropertyKey, unknown> = {}
  const context = new Proxy({} as Record<PropertyKey, unknown>, {
    get: (_target, key) => {
      if (key in written) return written[key]
      if (key === 'measureText') return () => ({ width: 8, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 })
      if (key === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) })
      if (key === 'canvas') return document.createElement('canvas')
      return () => undefined
    },
    set: (_target, key, value) => {
      written[key] = value
      return true
    },
  })
  HTMLCanvasElement.prototype.getContext = (() => context) as unknown as HTMLCanvasElement['getContext']
  // The library normalizes a color by reading it back from a computed style, which happy-dom does
  // not resolve to rgb(); the reading resolves a hex or named color the way a browser would.
  const NAMED: Record<string, string> = { white: 'rgb(255, 255, 255)', black: 'rgb(0, 0, 0)', transparent: 'rgba(0, 0, 0, 0)' }
  const rgbOf = (raw: string): string | null => {
    if (raw.startsWith('rgb')) return raw
    if (NAMED[raw]) return NAMED[raw]!
    const hex = raw.match(/^#([0-9a-f]{3,8})$/i)?.[1]
    if (!hex) return null
    const full = hex.length <= 4 ? [...hex].map((c) => c + c).join('') : hex
    const n = (i: number) => parseInt(full.slice(i, i + 2), 16)
    return full.length === 8 ? 'rgba(' + n(0) + ', ' + n(2) + ', ' + n(4) + ', ' + n(6) / 255 + ')' : 'rgb(' + n(0) + ', ' + n(2) + ', ' + n(4) + ')'
  }
  const computed = window.getComputedStyle.bind(window)
  window.getComputedStyle = ((element: Element, pseudo?: string | null) => {
    const style = computed(element, pseudo)
    const rgb = rgbOf((element as HTMLElement).style?.color ?? '')
    return rgb ? new Proxy(style, { get: (target, key) => (key === 'color' ? rgb : Reflect.get(target, key)) }) : style
  }) as typeof window.getComputedStyle
  if (typeof window.matchMedia !== 'function') {
    window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia
  }
})

const bar = (t: number): FeedBar => ({ t, o: 100, h: 101, l: 99, c: 100.5, v: 10 })
const datafeed: ChartDatafeed = {
  config: async () => ({ resolutions: ['1m', '5m'] }) as never,
  search: async () => ({ items: [], total: 0 }) as never,
  resolve: async (symbol) => ({ symbol, name: symbol, type: 'future', exchange: 'X', timezone: 'UTC', resolutions: ['1m', '5m'], priceFormat: { type: 'decimal', precision: 2, minMove: 0.25 } }) as never,
  history: async () => ({ bars: Array.from({ length: 20 }, (_, i) => bar(1_700_000_000 + i * 60)), noData: false }) as never,
  subscribeBars: () => () => undefined,
}

const mounted: { dispose(): void }[] = []
afterEach(() => {
  for (const w of mounted.splice(0)) w.dispose()
  document.body.replaceChildren()
})

const mount = (arrangement: string) => {
  const container = document.createElement('div')
  document.body.append(container)
  const widget = createChart({ container, datafeed, symbol: 'ES', timeframe: '1m', layout: { arrangement } })
  mounted.push(widget)
  const panes = container.querySelector<HTMLElement>('.qc-panes')!
  return { widget, panes, tiles: () => [...panes.querySelectorAll<HTMLElement>('.qc-pane')] }
}

/** The ring state each tile wears: whether it is ringed, and which of its corners are rounded. */
const ring = (tile: HTMLElement) => ({
  active: tile.dataset.qcActive,
  tl: tile.dataset.qcCornerTl,
  tr: tile.dataset.qcCornerTr,
})

describe('the active chart wears the ring, and only in a layout that has a second chart', () => {
  it('rings no tile in a single-chart layout, and rings the active one as soon as there is a sibling', () => {
    const { widget, tiles } = mount('s')
    expect(tiles()).toHaveLength(1)
    // Nothing to be active AGAINST: a lone chart is not "the selected one".
    expect(ring(tiles()[0]!)).toEqual({ active: 'false', tl: 'true', tr: 'true' })

    widget.layout.setArrangement('2h')
    expect(tiles().map((t) => t.dataset.qcActive)).toEqual(['true', 'false'])
    widget.layout.setActive(1)
    expect(tiles().map((t) => t.dataset.qcActive)).toEqual(['false', 'true'])

    // Back to one chart and the mark goes away with the sibling it distinguished.
    widget.layout.setArrangement('s')
    expect(tiles().map((t) => t.dataset.qcActive)).toEqual(['false'])
  })

  it('rounds the outer top corners only, never an interior or a bottom one', () => {
    const { tiles } = mount('2v')
    // Two stacked tiles: the top one meets the card's rounded top, the lower one meets nothing.
    expect(tiles().map(ring)).toEqual([
      { active: 'true', tl: 'true', tr: 'true' },
      { active: 'false', tl: 'false', tr: 'false' },
    ])

    const side = mount('2h')
    expect(side.tiles().map(ring)).toEqual([
      { active: 'true', tl: 'true', tr: 'false' },
      { active: 'false', tl: 'false', tr: 'true' },
    ])

    // No tile in any arrangement claims a bottom corner: the attribute is not written at all.
    for (const tile of [...tiles(), ...side.tiles()]) {
      expect(tile.dataset.qcCornerBl).toBeUndefined()
      expect(tile.dataset.qcCornerBr).toBeUndefined()
    }
  })

  it('gives a maximized tile the whole area, both top corners and the ring', () => {
    const { widget, panes, tiles } = mount('2h')
    widget.layout.setActive(1)
    tiles()[1]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', altKey: true, bubbles: true, cancelable: true }))

    expect(tiles()[0]!.hidden).toBe(true)
    expect(ring(tiles()[1]!)).toEqual({ active: 'true', tl: 'true', tr: 'true' })
    // Maximize is a view, so there is no divider left for the ring to be layered against.
    expect(panes.querySelectorAll('.qc-layout-divider')).toHaveLength(0)

    tiles()[1]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', altKey: true, bubbles: true, cancelable: true }))
    expect(tiles()[1]!.hidden).toBe(false)
    expect(ring(tiles()[1]!)).toEqual({ active: 'true', tl: 'false', tr: 'true' })
  })

  it('stands one tile alone from the host api, and puts the layout back', () => {
    const { widget, tiles } = mount('2h')
    expect(widget.layout.maximized()).toBeNull()
    widget.layout.setMaximized(1)
    expect(widget.layout.maximized()).toBe(1)
    // The chart standing alone is the one the layout is pointed at.
    expect(widget.layout.active()).toBe(1)
    expect(tiles()[0]!.hidden).toBe(true)
    // The same index again is not a second maximize, and an index no tile holds is refused.
    widget.layout.setMaximized(1)
    widget.layout.setMaximized(7)
    expect(widget.layout.maximized()).toBe(1)
    widget.layout.setMaximized(0)
    expect(widget.layout.maximized()).toBe(0)
    expect(tiles()[1]!.hidden).toBe(true)
    widget.layout.setMaximized(null)
    expect(widget.layout.maximized()).toBeNull()
    expect(tiles().every((tile) => !tile.hidden)).toBe(true)
  })
})

describe('the ring recipe', () => {
  const css = authoredStylesheets()['/src/styles/quickcharts.css']!
  const rule = (selector: string): string => {
    const at = css.indexOf(selector)
    expect(at, selector + ' has no recipe').toBeGreaterThan(-1)
    return css.slice(at, css.indexOf('}', at))
  }

  it('is one pixel of the focus token at 60%, drawn OVER the renderer', () => {
    // An outline is painted by the pane itself, and the renderer's canvas is a positioned
    // descendant, so the canvas covers whichever edges it reaches and the ring shows only where the
    // canvas does not: two edges on a tile, and a corner that misses the radius. A pseudo-element
    // above the canvas is the whole rectangle, and `border-radius: inherit` follows the tile's own
    // rounding into the corners.
    const base = rule('[data-qc-theme] .qc-pane {')
    expect(base).not.toContain('outline')
    const ring = rule("[data-qc-theme] .qc-pane[data-qc-active='true']::after")
    expect(ring).toContain('border: 1px solid color-mix(in srgb, var(--qc-state-focusRing) 60%, transparent)')
    // Half a pixel out, so the ring lands ON the tile boundary rather than inside the plot.
    expect(ring).toContain('inset: -0.5px')
    expect(ring).toContain('border-radius: inherit')
    expect(ring).toContain('pointer-events: none')
  })

  it('rounds top corners at the panel radius and defines no bottom-corner rule', () => {
    expect(css).toContain("[data-qc-theme] .qc-pane[data-qc-corner-tl='true'] { border-top-left-radius: var(--qc-chrome-radiusLarge); }")
    expect(css).toContain("[data-qc-theme] .qc-pane[data-qc-corner-tr='true'] { border-top-right-radius: var(--qc-chrome-radiusLarge); }")
    expect(css).not.toContain('data-qc-corner-bl')
    expect(css).not.toContain('data-qc-corner-br')
  })

  it('stacks the ringed tile over its neighbours and under the dividers', () => {
    const active = rule("[data-qc-theme] .qc-pane[data-qc-active='true']")
    const divider = rule('[data-qc-theme] .qc-layout-divider {')
    const layer = (text: string) => Number(/z-index:\s*(\d+)/.exec(text)![1])
    expect(layer(active)).toBe(1)
    // A neighbour is unlayered, so the ring is never clipped by the tile beside it; the divider
    // stays above so the seam is still grabbable where the ring runs along it.
    expect(layer(divider)).toBeGreaterThan(layer(active))
  })

  it("isolates the charts grid so the renderer's own layers stay under the widget's menus", () => {
    // The renderer positions its pane separators with an inline z-index far above the chrome ladder.
    // The grid's own stacking context keeps them under the overlay layer, where an open menu lives.
    expect(rule('[data-qc-theme] .qc-panes {')).toContain('isolation: isolate')
  })
})

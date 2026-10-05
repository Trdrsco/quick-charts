// @vitest-environment happy-dom
// The chart's own icon artwork as markup a host draws without the chart: every drawing tool and every
// drawing-toolbar control answers exactly the drawings the chart paints, on their own grids, as svg
// that parses on its own; an icon drawn at two sizes answers both; the illustrations drawn in the
// theme's roles answer none, and adding another is a conscious event; and a host's own `icons` never
// reach it.
import { describe, expect, it } from 'vitest'
import { ICONS } from '../../src/ui/controls/icons'
import { CHART_ICON_IDS, chartIconArtwork, toolGlyph, type ChartIconId } from '../../src/ui/icons/catalog'

/** The drawing toolbar's own controls, beside the tools themselves. */
const TOOLBAR_CONTROLS: readonly ChartIconId[] = [
  'cursorCross', 'eraser', 'measure', 'zoomIn', 'zoomOut', 'magnet', 'magnetStrong', 'stayInMode', 'stayInModeOn',
  'locked', 'unlocked', 'drawingsShown', 'drawingsHidden', 'delete', 'favorite', 'favorited',
]

describe('the chart’s icon artwork', () => {
  it('answers every drawing tool with the miniature the toolbar paints', () => {
    const tools = CHART_ICON_IDS.filter((id) => id.startsWith('tool.'))
    expect(tools.length).toBeGreaterThan(50)
    for (const id of tools) {
      const mark = toolGlyph(id.slice('tool.'.length))!
      expect(chartIconArtwork(id), id).toEqual([{ viewBox: mark.viewBox, body: mark.body, svg: expect.stringContaining(mark.body) }])
    }
  })

  it('answers every drawing-toolbar control, and an icon drawn at two sizes with both on their own grids', () => {
    for (const id of TOOLBAR_CONTROLS) expect(chartIconArtwork(id).length, id).toBeGreaterThan(0)
    expect(chartIconArtwork('delete').map((art) => art.viewBox)).toEqual([ICONS.trash.viewBox, ICONS.trash28.viewBox])
    expect(chartIconArtwork('magnet')).toEqual([{ viewBox: ICONS.magnet.viewBox, body: ICONS.magnet.body, svg: expect.any(String) }])
  })

  it('writes each drawing as a standalone svg on its grid, with no fill of its own, that parses on its own', () => {
    for (const id of CHART_ICON_IDS) {
      for (const art of chartIconArtwork(id)) {
        const doc = new DOMParser().parseFromString(art.svg, 'image/svg+xml')
        const root = doc.documentElement
        expect(root.nodeName.toLowerCase(), id).toBe('svg')
        expect(root.getAttribute('viewBox'), id).toBe(art.viewBox)
        expect(root.getAttribute('fill'), id).toBe('none')
        expect(doc.querySelector('parsererror'), id).toBeNull()
        expect(art.body, id).not.toMatch(/var\(--|class=/)
      }
    }
  })

  it('answers none for the illustrations drawn in the theme’s roles, and for an id the chart does not draw', () => {
    const none = CHART_ICON_IDS.filter((id) => chartIconArtwork(id).length === 0)
    expect(none).toEqual(['replayStatus', 'emptySearch', 'emptyCompare'])
    expect(chartIconArtwork('tool.nothing' as ChartIconId)).toEqual([])
  })

  it('answers the chart’s own artwork, which a host’s `icons` cannot reach', () => {
    // A pure function of the id: there is no host input to read, so the answer is the same before and
    // after any widget with any `icons` exists.
    expect(chartIconArtwork.length).toBe(1)
    expect(chartIconArtwork('tool.trend_line')).toEqual(chartIconArtwork('tool.trend_line'))
  })
})

// @vitest-environment happy-dom
// The tool miniatures held to the catalog: every key names a registered tool, and every registered
// tool has one except the glyph family, whose group opens the picker, and measure, which is a
// toolbar action rather than a flyout row. A miniature nobody can reach and a row with no
// miniature are both silent, which is why both directions are pinned.
import { describe, expect, it } from 'vitest'
import { drawingTools } from '../../../src/drawings/index'
import { TOOL_ICONS } from '../../../src/ui/drawings/toolIcons'
import { ICONS } from '../../../src/ui/controls/icons'
import { ownIcons } from '../../ownIcons'

const NO_MINIATURE = new Set(['emoji', 'sticker', 'icon', 'measure'])

describe('the tool miniatures', () => {
  it('every key is a registered tool type', () => {
    expect(Object.keys(TOOL_ICONS).filter((type) => !drawingTools.has(type))).toEqual([])
  })

  it('every registered tool has one, except the glyph family and measure', () => {
    const missing = drawingTools
      .all()
      .map((tool) => tool.type)
      .filter((type) => !NO_MINIATURE.has(type) && !Object.hasOwn(TOOL_ICONS, type))
    expect(missing).toEqual([])
    expect(Object.keys(TOOL_ICONS)).toHaveLength(90 - NO_MINIATURE.size)
  })

  it('draws in currentColor on a 28 grid, and answers nothing for a type without one', () => {
    for (const [type, body] of Object.entries(TOOL_ICONS)) {
      expect(body, type).toContain('currentColor')
      expect(body, type).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    }
    const svg = ownIcons().tool('trend_line', 20)!
    expect(svg.getAttribute('viewBox')).toBe('0 0 28 28')
    expect(svg.getAttribute('width')).toBe('20')
    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expect(ownIcons().tool('emoji')).toBeNull()
  })
})

describe('the chrome glyphs', () => {
  const bodyOf = (glyph: (typeof ICONS)[keyof typeof ICONS]): string => glyph.body

  it('each carries its own grid and body, and renders hidden from assistive technology', () => {
    for (const [name, glyph] of Object.entries(ICONS)) {
      expect(glyph.viewBox, name).toMatch(/^0 0 \d+ \d+$/)
      expect(bodyOf(glyph).length, name).toBeGreaterThan(10)
      expect(bodyOf(glyph), name).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
      expect(bodyOf(glyph), name).toContain('currentColor')
    }
    expect(ownIcons().icon('magnet').getAttribute('aria-hidden')).toBe('true')
  })

  // The drawing toolbar's own marks. Each is drawn on the same 28 grid the tool miniatures beside
  // it use, so a utility button and a tool button read at one weight in one row.
  it.each(['magnet', 'magnetStrong', 'lockOpen', 'lockClosed', 'drawingsShown', 'drawingsHidden', 'pin', 'pinOn', 'ruler', 'zoomIn', 'trash28', 'sync', 'cursorCross', 'cursorDot', 'cursorArrow'] as const)(
    '%s is drawn on the 28 grid',
    (name) => {
      expect(ICONS[name].viewBox).toBe('0 0 28 28')
    },
  )

  it('draws the solid marks as fills, and keeps the eraser, the arrow and the grip on their own grids', () => {
    // The lidded can, the eraser, the magnets, the padlocks, the pins, the ruler and the eye are
    // solid silhouettes: they carry no stroke at all, so no size scales their weight.
    for (const name of ['trash28', 'eraser', 'magnet', 'magnetStrong', 'lockOpen', 'lockClosed', 'pin', 'pinOn', 'ruler', 'zoomIn', 'sync', 'drawingsShown'] as const) {
      expect(bodyOf(ICONS[name]), name).toContain('fill="currentColor"')
      expect(bodyOf(ICONS[name]), name).not.toContain('stroke-width')
    }
    // The eraser keeps its own 29 by 31 grid and is drawn at that size.
    expect(ICONS.eraser.viewBox).toBe('0 0 29 31')
    expect(ICONS.eraser.size).toBe(31)
    expect(Math.round(31 * ICONS.eraser.aspect!)).toBe(29)
    // The drawing toolbar's arrow is a filled chevron on a 10 by 16 grid, drawn 4 by 7.
    expect(ICONS.chevronRight16.viewBox).toBe('0 0 10 16')
    expect(bodyOf(ICONS.chevronRight16)).toContain('fill="currentColor"')
    expect(ICONS.chevronRight16.size).toBe(7)
    expect(Math.round(7 * ICONS.chevronRight16.aspect!)).toBe(4)
    // The grip is six dots on an 8 by 12 grid, painted rather than outlined, so it is visible.
    expect(ICONS.grip.viewBox).toBe('0 0 8 12')
    expect((bodyOf(ICONS.grip).match(/<rect/g) ?? []).length).toBe(6)
  })

  it('draws a star as an outline at rest and a filled star once saved, both on the 18 grid', () => {
    expect(ICONS.star.viewBox).toBe('0 0 18 18')
    expect(ICONS.starFilled.viewBox).toBe('0 0 18 18')
    const outline = bodyOf(ICONS.star)
    const filled = bodyOf(ICONS.starFilled)
    // The outline is stroked and fills nothing; the saved star is filled and strokes nothing.
    expect(outline).toContain('stroke="currentColor"')
    expect(outline).not.toContain('fill="currentColor"')
    expect(filled).toContain('fill="currentColor"')
    expect(filled).not.toContain('stroke=')
  })
})

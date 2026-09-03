// The tool miniatures held to the catalog: every key names a registered tool, and every registered
// tool has one except the glyph family, whose group opens the picker, and measure, which is a
// toolbar action rather than a flyout row. A miniature nobody can reach and a row with no
// miniature are both silent, which is why both directions are pinned.
import { describe, expect, it } from 'vitest'
import { drawingTools } from '../../../src/drawings/index'
import { TOOL_ICONS, toolIconSvg } from '../../../src/ui/drawings/toolIcons'
import { ICONS, iconSvg } from '../../../src/ui/drawings/icons'

const NO_MINIATURE = new Set(['emoji', 'sticker', 'icon', 'measure'])

describe('the tool miniatures', () => {
  it('every key is a registered tool type', () => {
    expect(Object.keys(TOOL_ICONS).filter((type) => !drawingTools.has(type))).toEqual([])
  })

  it('every registered tool has one, except the glyph family and measure', () => {
    const missing = drawingTools
      .all()
      .map((tool) => tool.type)
      .filter((type) => !NO_MINIATURE.has(type) && !TOOL_ICONS[type])
    expect(missing).toEqual([])
    expect(Object.keys(TOOL_ICONS)).toHaveLength(90 - NO_MINIATURE.size)
  })

  it('draws in currentColor on a 28 grid, and answers nothing for a type without one', () => {
    for (const [type, body] of Object.entries(TOOL_ICONS)) {
      expect(body, type).toContain('currentColor')
      expect(body, type).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    }
    const svg = toolIconSvg('trend_line', 20)
    expect(svg).toContain('viewBox="0 0 28 28"')
    expect(svg).toContain('width="20"')
    expect(svg).toContain('aria-hidden="true"')
    expect(toolIconSvg('emoji')).toBe('')
  })
})

describe('the chrome glyphs', () => {
  it('each carries its own grid and body, and renders hidden from assistive technology', () => {
    for (const [name, glyph] of Object.entries(ICONS)) {
      expect(glyph.viewBox, name).toMatch(/^0 0 \d+ \d+$/)
      expect(glyph.body.length, name).toBeGreaterThan(10)
      expect(glyph.body, name).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    }
    expect(iconSvg('magnet')).toContain('aria-hidden="true"')
  })
})

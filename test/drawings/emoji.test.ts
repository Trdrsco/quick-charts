import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { bundledGlyphSource } from '../../src/drawings/emoji'
import { EMOJI_CATEGORIES, isEmojiGlyph } from '../../src/drawings/glyphs'

describe('bundled emoji artwork', () => {
  it('covers every picker emoji and category face without a host request', () => {
    for (const category of EMOJI_CATEGORIES) {
      for (const glyph of [category.face, ...category.glyphs].filter(isEmojiGlyph)) {
        expect(bundledGlyphSource(glyph), glyph).toMatch(/^data:image\/svg\+xml/)
      }
    }
  })

  it('keeps forced-text icons and unknown glyphs as text', () => {
    expect(bundledGlyphSource('⬆︎')).toBeNull()
    expect(bundledGlyphSource('not a glyph')).toBeNull()
    expect(bundledGlyphSource('❤️')).toContain('%3Csvg')
    expect(bundledGlyphSource('🏳️‍🌈')).toContain('%3Csvg')
  })

  it('pins the artwork to its vendored graphics and catalog', () => {
    expect(() => execFileSync(process.execPath, ['scripts/build-emoji.mjs', '--check'])).not.toThrow()
  })
})

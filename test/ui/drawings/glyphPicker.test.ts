// @vitest-environment happy-dom
// The glyph picker: recents first, every category under its heading, artwork from the asset port
// where it answers, the kind strip, and a pick that names the kind and the glyph.
import { afterEach, describe, expect, it } from 'vitest'
import { createChartI18n } from '../../../src/i18n'
import { EMOJI_CATEGORIES, ICON_CATEGORIES, isEmojiGlyph } from '../../../src/drawings/glyphs'
import { mountGlyphPicker, pushRecentGlyph, RECENT_GLYPHS_MAX, type GlyphKind } from '../../../src/ui/drawings/glyphPicker'

const t = createChartI18n().t

afterEach(() => {
  document.body.replaceChildren()
})

describe('the glyph data', () => {
  it('ships the eight emoji groups and seven icon groups, every glyph unique within its set', () => {
    expect(EMOJI_CATEGORIES.map((c) => c.id)).toEqual(['smileys', 'nature', 'food', 'activity', 'travel', 'objects', 'symbols', 'flags'])
    expect(ICON_CATEGORIES).toHaveLength(7)
    const emoji = EMOJI_CATEGORIES.flatMap((c) => c.glyphs)
    expect(new Set(emoji).size).toBe(emoji.length)
    for (const g of emoji) expect(isEmojiGlyph(g), g).toBe(true)
    // An icon glyph carrying the text variation selector is text whatever its base code point is.
    for (const g of ICON_CATEGORIES.flatMap((c) => c.glyphs).filter((g) => g.includes('︎'))) expect(isEmojiGlyph(g), g).toBe(false)
  })

  it('keeps recents newest first within the cap', () => {
    let recents: string[] = []
    for (let i = 0; i < RECENT_GLYPHS_MAX + 3; i++) recents = pushRecentGlyph(recents, `g${i}`)
    expect(recents).toHaveLength(RECENT_GLYPHS_MAX)
    expect(recents[0]).toBe(`g${RECENT_GLYPHS_MAX + 2}`)
    expect(pushRecentGlyph(['a', 'b'], 'b')).toEqual(['b', 'a'])
  })
})

describe('the picker', () => {
  it('renders recents, the category strip and headings, and reports a pick with its kind', () => {
    const picks: [GlyphKind, string][] = []
    const picker = mountGlyphPicker({ t, recents: ['🚀'], glyphSource: (glyph) => `/art/${glyph.codePointAt(0)}.svg`, onPick: (kind, glyph) => picks.push([kind, glyph]) })
    document.body.appendChild(picker.root)
    expect(picker.root.getAttribute('aria-label')).toBe('Glyph picker')
    const tabs = [...picker.root.querySelectorAll<HTMLElement>('.qc-drawing-glyph-strip [role="tab"]')]
    expect(tabs.map((tab) => tab.getAttribute('aria-label'))).toEqual(['Smileys & People', 'Animals & Nature', 'Food & Drink', 'Activity', 'Travel & Places', 'Objects', 'Symbols', 'Flags'])
    expect(tabs[0]!.getAttribute('aria-selected')).toBe('true')
    const headings = [...picker.root.querySelectorAll('.qc-dialog-heading')].map((h) => h.textContent)
    expect(headings[0]).toBe('Recently used')
    expect(headings[1]).toBe('Smileys & People')
    const recent = picker.root.querySelector<HTMLButtonElement>('.qc-drawing-glyph-cell')!
    expect(recent.getAttribute('aria-label')).toBe('Recent 🚀')
    expect(recent.querySelector('img')!.getAttribute('src')).toBe(`/art/${'🚀'.codePointAt(0)}.svg`)
    recent.click()
    expect(picks).toEqual([['emoji', '🚀']])
    picker.destroy()
  })

  it('draws a glyph as text when the port answers null, and icons always as text', () => {
    const picker = mountGlyphPicker({ t, recents: [], glyphSource: () => null, onPick: () => undefined })
    document.body.appendChild(picker.root)
    const first = picker.root.querySelector<HTMLButtonElement>('.qc-drawing-glyph-cell')!
    expect(first.querySelector('img')).toBeNull()
    expect(first.textContent).toBe(EMOJI_CATEGORIES[0]!.glyphs[0])
    const kinds = [...picker.root.querySelectorAll<HTMLElement>('.qc-drawing-glyph-kinds [role="tab"]')]
    expect(kinds.map((k) => k.textContent)).toEqual(['Emojis', 'Stickers', 'Icons'])
    kinds[2]!.click()
    const strip = [...picker.root.querySelectorAll<HTMLElement>('.qc-drawing-glyph-strip [role="tab"]')]
    expect(strip[0]!.getAttribute('aria-label')).toBe('Arrows')
    const cell = picker.root.querySelector<HTMLButtonElement>('.qc-drawing-glyph-cell')!
    expect(cell.textContent).toBe(ICON_CATEGORIES[0]!.glyphs[0])
    kinds[1]!.click()
    expect(picker.root.querySelector<HTMLElement>('.qc-drawing-glyph-empty')!.hidden).toBe(false)
    expect(picker.root.querySelector<HTMLElement>('.qc-drawing-glyph-empty')!.textContent).toBe('No sticker set is installed.')
    picker.destroy()
  })

  it('a category tab marks itself and jumps to its section', () => {
    const picker = mountGlyphPicker({ t, recents: [], onPick: () => undefined })
    document.body.appendChild(picker.root)
    const tabs = [...picker.root.querySelectorAll<HTMLElement>('.qc-drawing-glyph-strip [role="tab"]')]
    tabs[7]!.click()
    expect(tabs[7]!.getAttribute('aria-selected')).toBe('true')
    expect(tabs[0]!.getAttribute('aria-selected')).toBe('false')
    // The jump mounted the whole set, so the flags section exists to land on.
    expect(picker.root.querySelector('[data-category="flags"]')).toBeTruthy()
    picker.destroy()
  })
})

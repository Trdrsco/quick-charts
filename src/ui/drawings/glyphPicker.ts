// The emoji, sticker and icon picker: the glyph group's flyout. One continuous scroll of every
// category, recents first, with the category strip on top as a scroll-spy: a tab scrolls to its
// section, and scrolling moves the highlight to the section in view. The kind strip along the
// bottom switches sets. Picking a glyph arms the matching tool with it; the next chart press
// drops it.
//
// Emoji cells draw the artwork the host's asset port answers for the glyph, as an image, because
// platform emoji fonts cannot be trusted; a null answer draws the glyph as text. Icon glyphs are
// always text, so the drawing's own tint carries over.
import type { ChartMessageKey, ChartTranslate } from '../../i18n'
import { EMOJI_CATEGORIES, ICON_CATEGORIES, isEmojiGlyph, type GlyphCategory } from '../../drawings/glyphs'
import { button, el, rovingFocus } from './dom'

export type GlyphKind = 'emoji' | 'sticker' | 'icon'

/** The category HEADING for each set's id. The id stays the anchor in every language. */
const CATEGORY_LABEL: Record<string, ChartMessageKey> = {
  smileys: 'drawing.glyphCatSmileys',
  nature: 'drawing.glyphCatNature',
  food: 'drawing.glyphCatFood',
  activity: 'drawing.glyphCatActivity',
  travel: 'drawing.glyphCatTravel',
  objects: 'drawing.glyphCatObjects',
  symbols: 'drawing.glyphCatSymbols',
  flags: 'drawing.glyphCatFlags',
  'icon-arrows': 'drawing.glyphCatIconArrows',
  'icon-currency': 'drawing.glyphCatIconCurrency',
  'icon-gestures': 'drawing.glyphCatIconGestures',
  'icon-nature': 'drawing.glyphCatIconNature',
  'icon-objects': 'drawing.glyphCatObjects',
  'icon-special': 'drawing.glyphCatIconSpecial',
  'icon-symbols': 'drawing.glyphCatIconSymbols',
}

const KIND_LABEL: Record<GlyphKind, ChartMessageKey> = {
  emoji: 'drawing.kindEmojis',
  sticker: 'drawing.kindStickers',
  icon: 'drawing.kindIcons',
}

/** How many cells the opening frame mounts; the rest mount below the fold, a budget per frame, so
 *  no single frame is long. */
const CELL_BUDGET = 96

/** The most recent picks kept. */
export const RECENT_GLYPHS_MAX = 12

export interface GlyphPickerDeps {
  t: ChartTranslate
  /** Artwork for a glyph, from the host's asset port; null draws the glyph as text. */
  glyphSource?: (glyph: string) => string | null
  recents: readonly string[]
  /** The stem every element id the picker writes derives from: the chart's id. */
  idBase: string
  /** Whether the registry would arm a tool now; a cell renders disabled otherwise. */
  available(): boolean
  /** Whether the access policy permits the glyph tool of a kind. */
  toolAllowed(kind: GlyphKind): boolean
  onPick(kind: GlyphKind, glyph: string): void
}

export interface GlyphPickerHandle {
  root: HTMLElement
  destroy(): void
}

/** The recents list after a pick: the glyph moves to the front, the list stays within its cap. */
export function pushRecentGlyph(recents: readonly string[], glyph: string): string[] {
  return [glyph, ...recents.filter((g) => g !== glyph)].slice(0, RECENT_GLYPHS_MAX)
}

export function mountGlyphPicker(deps: GlyphPickerDeps): GlyphPickerHandle {
  const { t } = deps
  let kind: GlyphKind = 'emoji'
  let activeCategory = EMOJI_CATEGORIES[0]!.id
  let budget = CELL_BUDGET
  let pinnedUntil = 0
  let frame: number | null = null

  const root = el('div', { class: 'qc-drawing-glyphs', role: 'dialog', 'aria-label': t('drawing.glyphPicker') })
  const strip = el('div', { class: 'qc-drawing-glyph-strip', role: 'tablist' })
  const grid = el('div', { class: 'qc-drawing-glyph-grid', role: 'tabpanel', id: `${deps.idBase}-grid` })
  const empty = el('div', { class: 'qc-muted qc-drawing-glyph-empty', text: t('drawing.stickersSoon') })
  const kinds = el('div', { class: 'qc-drawing-glyph-kinds', role: 'tablist' })
  root.append(strip, grid, empty, kinds)

  const categories = (): readonly GlyphCategory[] => (kind === 'icon' ? ICON_CATEGORIES : EMOJI_CATEGORIES)
  const label = (c: GlyphCategory): string => (CATEGORY_LABEL[c.id] ? t(CATEGORY_LABEL[c.id]!) : c.id)

  const face = (glyph: string): HTMLElement | string => {
    if (kind === 'icon' || !isEmojiGlyph(glyph)) return glyph
    const url = deps.glyphSource?.(glyph) ?? null
    if (!url) return glyph
    return el('img', { class: 'qc-drawing-glyph-art', src: url, alt: '', draggable: 'false' })
  }

  const cell = (glyph: string, name: string): HTMLButtonElement => {
    const b = button({ class: 'qc-drawing-glyph-cell', label: name, disabled: !deps.available() || !deps.toolAllowed(kind), onClick: () => deps.onPick(kind, glyph) })
    b.append(face(glyph))
    return b
  }

  const sections = new Map<string, HTMLElement>()
  const renderGrid = (): void => {
    grid.replaceChildren()
    sections.clear()
    if (kind !== 'sticker' && deps.recents.length > 0) {
      const box = el('div', { class: 'qc-drawing-glyph-section' }, el('div', { class: 'qc-dialog-heading', text: t('drawing.recentlyUsed') }))
      const cells = el('div', { class: 'qc-drawing-glyph-cells' })
      for (const g of deps.recents) cells.appendChild(cell(g, t('drawing.recentGlyph', { glyph: g })))
      box.appendChild(cells)
      grid.appendChild(box)
    }
    let spent = 0
    for (const c of categories()) {
      const take = Math.max(0, Math.min(c.glyphs.length, budget - spent))
      spent += c.glyphs.length
      if (take === 0) continue
      const box = el('div', { class: 'qc-drawing-glyph-section', 'data-category': c.id, id: `${deps.idBase}-${c.id}` }, el('div', { class: 'qc-dialog-heading', text: label(c) }))
      // A section's intrinsic size is the FULL section's, so scroll offsets and category jumps are
      // true while only part of it is mounted.
      box.style.containIntrinsicSize = `auto ${26 + Math.ceil(c.glyphs.length / 8) * 32}px`
      const cells = el('div', { class: 'qc-drawing-glyph-cells', 'data-kind': kind })
      for (const g of c.glyphs.slice(0, take)) cells.appendChild(cell(g, g))
      box.appendChild(cells)
      grid.appendChild(box)
      sections.set(c.id, box)
    }
    empty.hidden = kind !== 'sticker'
    grid.hidden = kind === 'sticker'
    strip.hidden = kind === 'sticker'
    scheduleMore()
  }

  const scheduleMore = (): void => {
    const total = categories().reduce((n, c) => n + c.glyphs.length, 0)
    if (budget >= total || frame !== null || typeof requestAnimationFrame !== 'function') return
    frame = requestAnimationFrame(() => {
      frame = null
      budget += CELL_BUDGET
      renderGrid()
    })
  }

  const renderStrip = (): void => {
    strip.replaceChildren()
    for (const c of categories()) {
      const b = el('button', { type: 'button', class: 'qc-drawing-glyph-tab', role: 'tab', 'aria-label': label(c), title: label(c), 'aria-selected': String(c.id === activeCategory), 'aria-controls': `${deps.idBase}-${c.id}` })
      b.append(face(c.face))
      b.addEventListener('click', () => jumpTo(c.id))
      strip.appendChild(b)
    }
  }

  const markActive = (id: string): void => {
    activeCategory = id
    for (const b of strip.querySelectorAll<HTMLElement>('[role="tab"]')) {
      const c = categories().find((x) => label(x) === b.getAttribute('aria-label'))
      b.setAttribute('aria-selected', String(c?.id === id))
    }
  }

  const jumpTo = (id: string): void => {
    markActive(id)
    pinnedUntil = Date.now() + 600
    const section = sections.get(id)
    if (section) {
      grid.scrollTo({ top: section.offsetTop - 4, behavior: 'smooth' })
      return
    }
    // Mid-ramp, the target section may not exist yet: finish the mount in one commit and jump after.
    budget = categories().reduce((n, c) => n + c.glyphs.length, 0)
    renderGrid()
    sections.get(id)?.scrollIntoView({ block: 'start' })
  }

  grid.addEventListener('scroll', () => {
    if (Date.now() < pinnedUntil) return
    let current = categories()[0]!.id
    for (const c of categories()) {
      const section = sections.get(c.id)
      if (section && section.offsetTop <= grid.scrollTop + 48) current = c.id
    }
    if (current !== activeCategory) markActive(current)
  })

  const renderKinds = (): void => {
    kinds.replaceChildren()
    for (const k of ['emoji', 'sticker', 'icon'] as const) {
      const b = el('button', { type: 'button', class: 'qc-button qc-drawing-glyph-kind', role: 'tab', id: `${deps.idBase}-kind-${k}`, 'aria-controls': `${deps.idBase}-grid`, 'aria-selected': String(k === kind), text: t(KIND_LABEL[k]) })
      if (k === kind) grid.setAttribute('aria-labelledby', b.id)
      b.addEventListener('click', () => {
        kind = k
        activeCategory = categories()[0]?.id ?? ''
        budget = CELL_BUDGET
        renderKinds()
        renderStrip()
        renderGrid()
        grid.scrollTo({ top: 0 })
      })
      kinds.appendChild(b)
    }
  }

  const unroveStrip = rovingFocus(strip, () => [...strip.querySelectorAll<HTMLElement>('[role="tab"]')], 'horizontal')
  const unroveKinds = rovingFocus(kinds, () => [...kinds.querySelectorAll<HTMLElement>('[role="tab"]')], 'horizontal')
  const unroveGrid = rovingFocus(grid, () => [...grid.querySelectorAll<HTMLElement>('.qc-drawing-glyph-cell')], 'both')
  renderKinds()
  renderStrip()
  renderGrid()

  return {
    root,
    destroy() {
      if (frame !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame)
      unroveStrip()
      unroveKinds()
      unroveGrid()
      root.remove()
    },
  }
}

// The emoji, sticker and icon picker: the glyph group's flyout. One continuous scroll of every
// category, recents first, with the category strip on top as a scroll-spy: a tab scrolls to its
// section, and scrolling moves the highlight to the section in view. The kind strip along the
// bottom switches sets. Picking a glyph arms the matching tool with it; the next chart press
// drops it.
//
// Emoji cells use bundled artwork or the host's override, as an image, because
// platform emoji fonts cannot be trusted; a null answer draws the glyph as text. Icon glyphs are
// always text, so the drawing's own tint carries over. Bundled artwork is fetched the first time an
// emoji is drawn, and the emoji the picker drew as text meanwhile take it where they stand.
import type { ChartMessageKey, ChartTranslate } from '../../i18n'
import { EMOJI_CATEGORIES, ICON_CATEGORIES, isEmojiGlyph, type GlyphCategory } from '../../drawings/glyphs'
import { button, el, rovingFocus } from './dom'
import { bundledGlyphSource, onBundledArtwork } from '../../drawings/emoji'

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
 *  no single frame is long. A fixed cell budget makes every frame the same small size however the
 *  categories fall; whole-category chunks kept the biggest category's share of the opening commit.
 *  Each frame APPENDS the next cells to the sections it already built: rebuilding the mounted grid
 *  on every step cost the square of the set over the budget rather than the set, which for the
 *  1,566 emoji was 14,622 cell builds across the ramp's 17 frames, paid again on every open. */
export const CELL_BUDGET = 96

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
  /** Whether the picker draws a kind's tab and grid at all. Every kind is drawn without it. */
  toolShown?(kind: GlyphKind): boolean
  onPick(kind: GlyphKind, glyph: string): void
}

export interface GlyphPickerHandle {
  root: HTMLElement
  /** What a reopen runs: the recents the host now holds, and the gates re-read over the cells
   *  already mounted. The grid itself is kept, so opening the picker again costs the recents row
   *  rather than the whole set. */
  refresh(recents: readonly string[]): void
  destroy(): void
}

/** The recents list after a pick: the glyph moves to the front, the list stays within its cap. */
export function pushRecentGlyph(recents: readonly string[], glyph: string): string[] {
  return [glyph, ...recents.filter((g) => g !== glyph)].slice(0, RECENT_GLYPHS_MAX)
}

export function mountGlyphPicker(input: GlyphPickerDeps): GlyphPickerHandle {
  let deps = input
  const { t } = deps
  let kind: GlyphKind = 'emoji'
  let activeCategory = EMOJI_CATEGORIES[0]!.id
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

  /** The artwork for a glyph, or null while there is none to show. */
  const art = (glyph: string): HTMLElement | null => {
    const url = (deps.glyphSource ?? bundledGlyphSource)(glyph)
    return url ? el('img', { class: 'qc-drawing-glyph-art', src: url, alt: '', draggable: 'false' }) : null
  }

  const face = (glyph: string): HTMLElement | string => {
    if (kind === 'icon' || !isEmojiGlyph(glyph)) return glyph
    return art(glyph) ?? glyph
  }

  const cell = (glyph: string, name: string): HTMLButtonElement => {
    const b = button({ class: 'qc-drawing-glyph-cell', label: name, disabled: !deps.available() || !deps.toolAllowed(kind), onClick: () => deps.onPick(kind, glyph) })
    b.append(face(glyph))
    return b
  }

  // Each set keeps its own mounted grid for the life of the picker. A later open, a jump between
  // categories and a return to a set already mounted therefore reuse the cells they have: nothing
  // is built twice, and closing the flyout does not throw the work away.
  interface Panel {
    element: HTMLElement
    sections: Map<string, HTMLElement>
    /** How many of the set's glyphs are mounted, in category order. */
    mounted: number
  }
  const panels = new Map<GlyphKind, Panel>()
  const recentsBox = el('div', { class: 'qc-drawing-glyph-section' })
  const cellsOf = (root: HTMLElement): HTMLButtonElement[] => [...root.querySelectorAll<HTMLButtonElement>('.qc-drawing-glyph-cell')]

  const panelFor = (k: GlyphKind): Panel => {
    let panel = panels.get(k)
    if (!panel) {
      panel = { element: el('div', { class: 'qc-drawing-glyph-panel' }), sections: new Map(), mounted: 0 }
      panels.set(k, panel)
    }
    return panel
  }

  /** Mount the next glyphs of the active set, up to the budget, into the sections that hold them,
   *  creating a section the first time it is reached. Returns how many were mounted. */
  const mountMore = (limit: number): number => {
    // Stickers have no set yet, and `categories()` would hand back the emoji list.
    if (kind === 'sticker') return 0
    const panel = panelFor(kind)
    let seen = 0
    let placed = 0
    for (const c of categories()) {
      const start = Math.max(0, Math.min(c.glyphs.length, panel.mounted - seen))
      const room = limit - placed
      if (room <= 0) break
      if (start < c.glyphs.length) {
        let box = panel.sections.get(c.id)
        if (!box) {
          box = el('div', { class: 'qc-drawing-glyph-section', 'data-category': c.id, id: `${deps.idBase}-${c.id}` }, el('div', { class: 'qc-dialog-heading', text: label(c) }))
          // A section's intrinsic size is the FULL section's, so scroll offsets and category jumps
          // are true while only part of it is mounted.
          box.style.containIntrinsicSize = `auto ${26 + Math.ceil(c.glyphs.length / 8) * 32}px`
          box.appendChild(el('div', { class: 'qc-drawing-glyph-cells', 'data-kind': kind }))
          panel.sections.set(c.id, box)
          panel.element.appendChild(box)
        }
        const target = box.querySelector<HTMLElement>('.qc-drawing-glyph-cells')!
        const take = Math.min(room, c.glyphs.length - start)
        for (const g of c.glyphs.slice(start, start + take)) target.appendChild(cell(g, g))
        placed += take
        panel.mounted += take
      }
      seen += c.glyphs.length
    }
    return placed
  }

  const totalOf = (k: GlyphKind): number => (k === 'sticker' ? 0 : (k === 'icon' ? ICON_CATEGORIES : EMOJI_CATEGORIES).reduce((n, c) => n + c.glyphs.length, 0))

  /** The recents row: the only part of the grid a pick can change, so it alone is rebuilt. */
  const renderRecents = (): void => {
    recentsBox.replaceChildren()
    if (kind === 'sticker' || deps.recents.length === 0) {
      recentsBox.hidden = true
      return
    }
    recentsBox.hidden = false
    recentsBox.appendChild(el('div', { class: 'qc-dialog-heading', text: t('drawing.recentlyUsed') }))
    const cells = el('div', { class: 'qc-drawing-glyph-cells' })
    for (const g of deps.recents) cells.appendChild(cell(g, t('drawing.recentGlyph', { glyph: g })))
    recentsBox.appendChild(cells)
  }

  /** Show the active set, mounting the opening budget the first time it is reached. */
  const showKind = (): void => {
    renderRecents()
    const panel = panelFor(kind)
    if (panel.element.parentNode !== grid) {
      for (const other of panels.values()) other.element.remove()
      grid.replaceChildren(recentsBox, panel.element)
    }
    if (panel.mounted === 0) mountMore(CELL_BUDGET)
    empty.hidden = kind !== 'sticker'
    grid.hidden = kind === 'sticker'
    strip.hidden = kind === 'sticker'
    scheduleMore()
  }

  const scheduleMore = (): void => {
    if (panelFor(kind).mounted >= totalOf(kind) || frame !== null || typeof requestAnimationFrame !== 'function') return
    frame = requestAnimationFrame(() => {
      frame = null
      mountMore(CELL_BUDGET)
      scheduleMore()
    })
  }

  /** Mount the rest of the active set in one commit: what a jump to a section below the ramp asks
   *  for, and paying its cost then is the honest response. */
  const mountAll = (): void => {
    const remaining = totalOf(kind) - panelFor(kind).mounted
    if (remaining > 0) mountMore(remaining)
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
    const section = panelFor(kind).sections.get(id)
    if (section) {
      grid.scrollTo({ top: section.offsetTop - 4, behavior: 'smooth' })
      return
    }
    // Mid-ramp, the target section may not exist yet: finish the mount and jump after.
    mountAll()
    panelFor(kind).sections.get(id)?.scrollIntoView({ block: 'start' })
  }

  grid.addEventListener('scroll', () => {
    if (Date.now() < pinnedUntil) return
    const { sections } = panelFor(kind)
    let current = categories()[0]!.id
    for (const c of categories()) {
      const section = sections.get(c.id)
      if (section && section.offsetTop <= grid.scrollTop + 48) current = c.id
    }
    if (current !== activeCategory) markActive(current)
  })

  const renderKinds = (): void => {
    kinds.replaceChildren()
    // A kind the picker does not draw has no tab, and the picker opens on the first kind it draws.
    const drawn = (['emoji', 'sticker', 'icon'] as const).filter((k) => deps.toolShown?.(k) ?? true)
    if (drawn.length > 0 && !drawn.includes(kind)) {
      kind = drawn[0]!
      activeCategory = categories()[0]?.id ?? ''
    }
    for (const k of drawn) {
      const b = el('button', { type: 'button', class: 'qc-button qc-drawing-glyph-kind', role: 'tab', id: `${deps.idBase}-kind-${k}`, 'aria-controls': `${deps.idBase}-grid`, 'aria-selected': String(k === kind), text: t(KIND_LABEL[k]) })
      if (k === kind) grid.setAttribute('aria-labelledby', b.id)
      b.addEventListener('click', () => {
        if (k === kind) return
        kind = k
        activeCategory = categories()[0]?.id ?? ''
        renderKinds()
        renderStrip()
        showKind()
        grid.scrollTo({ top: 0 })
      })
      kinds.appendChild(b)
    }
  }

  // As the bundled artwork lands, the emoji set's cells swap their text for it in place, mounted on
  // screen or kept behind another set, and the strip and recents redraw when they show emoji.
  const stopArtwork = deps.glyphSource
    ? () => undefined
    : onBundledArtwork(() => {
        const emoji = panels.get('emoji')
        for (const b of emoji ? cellsOf(emoji.element) : []) {
          const text = b.firstChild
          if (text?.nodeType !== Node.TEXT_NODE) continue
          const image = art(text.textContent ?? '')
          if (image) text.replaceWith(image)
        }
        if (kind !== 'icon') {
          renderStrip()
          renderRecents()
        }
      })

  const unroveStrip = rovingFocus(strip, () => [...strip.querySelectorAll<HTMLElement>('[role="tab"]')], 'horizontal')
  const unroveKinds = rovingFocus(kinds, () => [...kinds.querySelectorAll<HTMLElement>('[role="tab"]')], 'horizontal')
  const unroveGrid = rovingFocus(grid, () => cellsOf(grid), 'both')
  renderKinds()
  renderStrip()
  showKind()

  return {
    root,
    refresh(recents) {
      // What a reopen costs: the recents row, which a pick may have changed, and the gates on the
      // cells already mounted. The grid itself is kept.
      deps = { ...deps, recents }
      const before = kind
      renderKinds()
      if (kind !== before) {
        renderStrip()
        showKind()
      }
      renderRecents()
      const disabled = !deps.available() || !deps.toolAllowed(kind)
      for (const b of cellsOf(panelFor(kind).element)) b.disabled = disabled
      scheduleMore()
    },
    destroy() {
      if (frame !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame)
      frame = null
      stopArtwork()
      unroveStrip()
      unroveKinds()
      unroveGrid()
      for (const panel of panels.values()) panel.element.remove()
      panels.clear()
      grid.replaceChildren()
      root.remove()
    },
  }
}

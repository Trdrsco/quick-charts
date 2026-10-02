// The drawing toolbar: the column down the chart's inline-start edge. One button per tool group,
// each with a flyout of the group's sections; the cursor with its modes and the eraser; measure
// and zoom; the magnet with its strengths; stay-in-drawing-mode; lock all; the eye with its
// subjects; drawing sync in a layout; the remove menu that names what it takes; and the favorites
// star. WHAT is on the toolbar comes from the models on `@trdrs/quickcharts/drawings`; this module
// is the toolbar's presentation over them, and every action it takes is a command through the
// registry, so a verb the host hides or refuses is refused here too. A control the registry would
// not run is drawn disabled; one the host's policy refuses is left out instead when the host hides
// what it refuses, and a section, group or rule it empties goes with it.
//
// The toolbar renders from a state getter and re-renders on demand. Flyouts are built when they
// open and torn down when they close, so the toolbar's own DOM stays the buttons a reader can
// count.
import type { ChartTranslate } from '../../i18n'
import { toolName } from '../../i18n'
import {
  buildDrawingToolbarGroups,
  chooseHideMode,
  chooseMagnetStrength,
  CURSOR_LABELS,
  CURSOR_MODES,
  cursorButtonArmed,
  drawingToolbarFaceOf,
  groupOfTool,
  HIDE_LABELS,
  hideOrder,
  hideRowActive,
  isBuiltInHideMode,
  isFavorite,
  MAGNET_LABELS,
  MAGNET_STRENGTHS,
  removableDrawings,
  removeRows,
  toggleMagnet,
  TRANSIENT_LABELS,
  type CursorMode,
  type DrawingCounts,
  type DrawingToolbarGroup,
  type BuiltInHideMode,
  type FavoritesState,
  type HideMode,
  type HideState,
  type MagnetMode,
} from '../../drawings/index'
import type { ChartExtensionHideLayer } from '../../extension'
import { buildGlyph } from '../chrome/vector'
import { tidyRules } from '../chrome/dom'
import { button, el, focusFirst, menuKeys, ownPointer, rovingFocus } from './dom'
import { openPopover, reopenPopover } from './fields'
import { mountGlyphPicker, type GlyphKind } from './glyphPicker'
import type { IconName } from '../controls/icons'
import { panelHostFor } from './overlays'
import type { IconResolver } from '../icons/resolver'

/** Everything the toolbar renders from, read live at every render. */
export interface ToolbarState {
  activeTool: string | null
  cursor: CursorMode
  magnet: MagnetMode
  stayInDrawingMode: boolean
  allLocked: boolean
  hide: HideState
  /** The layers extensions offered the eye, after the chart's own. */
  hideLayers: readonly ChartExtensionHideLayer[]
  /** Whether new drawings are shared across the layout. */
  sync: boolean
  removeLocked: boolean
  counts: DrawingCounts
  indicatorCount: number
  drawingToolbarTools: Readonly<Record<string, string>>
  favorites: FavoritesState
  recentGlyphs: readonly string[]
  /** Charts in the layout; the sync control exists only past one. */
  layoutCharts: number
}

export interface ToolbarDeps {
  /** The chrome subtree the toolbar mounts into, and the box its flyouts stay within. */
  chrome: HTMLElement
  /** Separate mounting space, or null to keep the toolbar detached until its chart is active. */
  container?: HTMLElement | null
  t: ChartTranslate
  /** Draws every glyph: the host's drawing for its icon, or the chart's own. */
  icons: IconResolver
  state(): ToolbarState
  /** Run a command through the registry. Answers whether it ran. */
  run(command: string, arg?: unknown): boolean
  /** Whether the registry would run a command now. A control whose command is denied or
   *  unavailable renders disabled, never hidden, so the toolbar keeps its shape. */
  available(command: string): boolean
  /** Whether the access policy permits arming a tool. A refused tool renders disabled. */
  toolAllowed(type: string): boolean
  /** Whether a control for a command is drawn at all. Every control is drawn without it. */
  shown?(command: string): boolean
  /** Whether a tool is drawn at all: in its group's flyout, as its group's face, and in the glyph
   *  picker. Every tool is drawn without it. */
  toolShown?(type: string): boolean
  /** The stem every element id the toolbar's surfaces write derives from: the chart's id. */
  idBase: string
  /** Artwork for a glyph, from the host's asset port. */
  glyphSource?: (glyph: string) => string | null
}

export interface ToolbarHandle {
  /** Move the toolbar and close any flyout belonging to its previous placement. */
  mount(container: HTMLElement | null): void
  /** Re-render from the current state. */
  render(): void
  /** Re-read every label, after a language switch. */
  relabel(): void
  destroy(): void
}

const CURSOR_ICON: Record<CursorMode, IconName> = { cross: 'cursorCross', dot: 'cursorDot', arrow: 'cursorArrow' }

const HIDE_ICON: Record<BuiltInHideMode, { shown: IconName; hidden: IconName }> = {
  drawings: { shown: 'drawingsShown', hidden: 'drawingsHidden' },
  indicators: { shown: 'indicatorsShown', hidden: 'indicatorsHidden' },
  all: { shown: 'allShown', hidden: 'allHidden' },
}

export function mountDrawingToolbar(deps: ToolbarDeps): ToolbarHandle {
  const { t } = deps
  const groups: DrawingToolbarGroup[] = buildDrawingToolbarGroups()
  const shown = (command: string): boolean => deps.shown?.(command) ?? true
  const toolShown = (type: string): boolean => deps.toolShown?.(type) ?? true
  /** A group as the toolbar draws it: the tools it draws, leaving out a section with none. A group
   *  left with no section is not drawn, and its face wears the first tool it draws when the one
   *  the viewer last armed there is left out. */
  const drawnGroup = (group: DrawingToolbarGroup): DrawingToolbarGroup => ({
    ...group,
    sections: group.sections.map((section) => ({ ...section, tools: section.tools.filter((tool) => toolShown(tool.type)) })).filter((section) => section.tools.length > 0),
  })
  const toolbar = el('div', { class: 'qc-surface qc-drawing-toolbar', role: 'toolbar', 'aria-orientation': 'vertical', 'aria-label': t('drawing.toolbar'), 'data-role': 'drawing-toolbar' })
  ownPointer(toolbar)
  const column = el('div', { class: 'qc-drawing-toolbar-column' })
  toolbar.appendChild(column)

  /** The one open flyout's closer. Opening another closes it first: a swap, not a stack. */
  let closeFlyout: (() => void) | null = null
  /** The coordinate plane a flyout mounts into. An internal toolbar uses its chart chrome; the
   * package-created external surface resolves to the widget plane without changing its target. */
  let panelHost = deps.chrome
  const closeOpen = (): void => {
    closeFlyout?.()
    closeFlyout = null
  }
  const openFlyout = (anchor: HTMLElement, content: HTMLElement, onClose?: () => void): void => {
    const wasOpen = anchor.getAttribute('aria-expanded') === 'true'
    closeOpen()
    if (wasOpen) return
    // A flyout re-reads the host's policy by opening again from its control, which builds its rows
    // afresh; a control the policy now hides or disables leaves it closed.
    const close = openPopover(panelHost, anchor, content, 'side', () => {
      if (closeFlyout === close) closeFlyout = null
      onClose?.()
    }, anchor.closest<HTMLElement>('.qc-drawing-cell') ?? anchor, () => reopenPopover(close, content, () => anchor))
    closeFlyout = close
    focusFirst(content)
  }
  column.addEventListener('scroll', closeOpen)

  const rows = (menu: HTMLElement): HTMLElement[] => [...menu.querySelectorAll<HTMLElement>('[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"], [role="switch"]')]
  const menuRow = (label: string, onPick: () => void, options: { icon?: Element; active?: boolean; role?: string; command?: string; commands?: readonly string[] } = {}): HTMLButtonElement => {
    const b = el('button', { type: 'button', class: 'qc-menu-row qc-drawing-menu-row', role: options.role ?? 'menuitem' })
    // A row that runs several commands is live only when every one of them would run.
    const needs = [...(options.command ? [options.command] : []), ...(options.commands ?? [])]
    if (needs.some((command) => !deps.available(command))) b.disabled = true
    if (needs.some((command) => !shown(command))) b.hidden = true
    if (options.active !== undefined) b.setAttribute('aria-checked', String(options.active))
    if (options.active) b.dataset.qcActive = 'true'
    // A row carries a mark column only when it has a mark: a menu of words alone starts its
    // labels at the row's own edge.
    if (options.icon) {
      b.classList.add('qc-drawing-menu-row--marked')
      b.appendChild(el('span', { class: 'qc-menu-icon' }, options.icon))
    }
    b.appendChild(el('span', { class: 'qc-menu-label', text: label }))
    b.addEventListener('click', () => {
      closeOpen()
      onPick()
    })
    return b
  }
  const menu = (label: string, ...items: HTMLElement[]): HTMLElement => {
    const m = el('div', { class: 'qc-drawing-menu', role: 'menu', 'aria-label': label }, ...items.filter((item) => !item.hidden))
    tidyRules(m, (child) => !child.hidden)
    menuKeys(m, () => rows(m))
    return m
  }

  /** A split entry: the face button acts, the arrow opens the flyout. */
  const cell = (face: HTMLButtonElement, arrow: HTMLButtonElement | null): HTMLElement => {
    const box = el('div', { class: 'qc-drawing-cell' }, face)
    face.classList.add('qc-drawing-toolbar-button')
    if (arrow) {
      arrow.classList.add('qc-drawing-toolbar-arrow')
      arrow.setAttribute('aria-haspopup', 'menu')
      arrow.setAttribute('aria-expanded', 'false')
      box.appendChild(arrow)
    }
    return box
  }
  /** A rule, in the recipe of the surface that draws it: the toolbar's short hairline between
   *  groups, a tool flyout's section rule across the panel's content area, or a menu's rule across
   *  the same content area. One width for all three read as the toolbar's everywhere it was not. */
  const divider = (where: 'toolbar' | 'flyout' | 'menu' = 'toolbar'): HTMLElement =>
    el('div', { class: `qc-separator qc-drawing-${where === 'toolbar' ? 'divider' : where === 'flyout' ? 'flyout-rule' : 'menu-rule'}`, role: 'separator' })

  // ── Cursor ──────────────────────────────────────────────────────────────────────────────────
  const cursorFace = button({ class: 'qc-button', label: t('drawing.cursor'), onClick: () => deps.run('chart.drawings.arm', null) })
  const cursorArrow = button({ class: 'qc-button', label: t('drawing.cursorMenu'), icon: deps.icons.icon('chevronRight16') })
  cursorArrow.addEventListener('click', () => {
    const s = deps.state()
    openFlyout(
      cursorArrow,
      menu(
        t('drawing.cursorMenu'),
        ...CURSOR_MODES.map((mode) =>
          menuRow(t(CURSOR_LABELS[mode]), () => deps.run('chart.drawings.cursor', mode), { icon: deps.icons.icon(CURSOR_ICON[mode]), active: s.cursor === mode && s.activeTool !== 'eraser', role: 'menuitemradio', command: 'chart.drawings.cursor' }),
        ),
        ...[menuRow(t(TRANSIENT_LABELS.eraser), () => deps.run('chart.drawings.arm', 'eraser'), { icon: deps.icons.icon('eraser'), active: s.activeTool === 'eraser', role: 'menuitemradio', command: 'chart.drawings.arm' })].filter(() => toolShown('eraser')),
      ),
    )
  })
  column.appendChild(cell(cursorFace, cursorArrow))

  // ── Tool groups ─────────────────────────────────────────────────────────────────────────────
  const groupFaces = new Map<string, { face: HTMLButtonElement; arrow: HTMLButtonElement }>()
  let glyphPicker: ReturnType<typeof mountGlyphPicker> | null = null
  const openGroup = (group: DrawingToolbarGroup, anchor: HTMLElement): void => {
    if (group.id === 'glyphs') {
      // One picker for the life of the toolbar. Its grid is the most expensive thing the toolbar
      // builds, so a close detaches it and the next open brings the same cells back.
      glyphPicker ??= mountGlyphPicker({
        t,
        ...(deps.glyphSource ? { glyphSource: deps.glyphSource } : {}),
        recents: deps.state().recentGlyphs,
        idBase: `${deps.idBase}-glyphs`,
        available: () => deps.available('chart.drawings.arm'),
        toolAllowed: (kind) => deps.toolAllowed(kind),
        toolShown: (kind) => toolShown(kind),
        onPick: (kind: GlyphKind, glyph: string) => {
          closeOpen()
          deps.run('chart.drawings.arm', { tool: kind, props: { glyph } })
        },
      })
      glyphPicker.refresh(deps.state().recentGlyphs)
      openFlyout(anchor, glyphPicker.root, () => glyphPicker?.root.remove())
      return
    }
    const s = deps.state()
    const list = el('div', { class: 'qc-drawing-flyout', role: 'menu', 'aria-label': t(group.label) })
    drawnGroup(group).sections.forEach((section, index) => {
      if (index > 0) list.appendChild(divider('flyout'))
      list.appendChild(el('div', { class: 'qc-dialog-heading', text: t(section.label) }))
      for (const tool of section.tools) {
        const name = toolName(t, tool.type, tool.name)
        const fav = isFavorite(s.favorites, tool.type)
        const rowEl = el('div', { class: 'qc-drawing-flyout-row' })
        const pick = el('button', { type: 'button', class: 'qc-menu-row qc-drawing-menu-row qc-drawing-menu-row--marked', role: 'menuitem', 'data-tool': tool.type })
        pick.appendChild(el('span', { class: 'qc-menu-icon' }, deps.icons.tool(tool.type)))
        pick.appendChild(el('span', { class: 'qc-menu-label', text: name }))
        if (s.activeTool === tool.type) pick.dataset.qcActive = 'true'
        if (!deps.toolAllowed(tool.type) || !deps.available('chart.drawings.arm')) pick.disabled = true
        // The Image tool places through its own command, which needs an asset port to exist.
        if (tool.type === 'image' && !deps.available('chart.drawings.placeImage')) pick.disabled = true
        if (tool.type === 'image' && !shown('chart.drawings.placeImage')) continue
        pick.addEventListener('click', () => {
          closeOpen()
          deps.run('chart.drawings.arm', tool.type)
        })
        const star = button({
          class: 'qc-drawing-star',
          label: t(fav ? 'drawing.favRemove' : 'drawing.favAdd', { tool: name }),
          icon: deps.icons.icon(fav ? 'starFilled' : 'star', 18),
          pressed: fav,
          disabled: !deps.available('chart.drawings.favorite'),
          onClick: () => {
            deps.run('chart.drawings.favorite', tool.type)
            const now = isFavorite(deps.state().favorites, tool.type)
            star.replaceChildren(deps.icons.icon(now ? 'starFilled' : 'star', 18))
            star.setAttribute('aria-pressed', String(now))
            star.setAttribute('aria-label', t(now ? 'drawing.favRemove' : 'drawing.favAdd', { tool: name }))
            star.title = star.getAttribute('aria-label') ?? ''
          },
        })
        // The star is a command of its own; a host that hides it when refused keeps the row.
        star.hidden = !shown('chart.drawings.favorite')
        rowEl.append(pick, star)
        list.appendChild(rowEl)
      }
    })
    menuKeys(list, () => rows(list))
    openFlyout(anchor, list)
  }
  for (const group of groups) {
    const face = button({ class: 'qc-button', label: t(group.label) })
    const arrow = button({ class: 'qc-button', label: t('drawing.groupMenu', { group: t(group.label) }), icon: deps.icons.icon('chevronRight16') })
    face.addEventListener('click', () => {
      // The face arms the tool it wears. The glyph group is the exception: a glyph tool is nothing
      // without a chosen glyph, so its face opens the picker as its arrow does.
      const faceTool = drawingToolbarFaceOf(drawnGroup(group), deps.state().drawingToolbarTools)
      if (group.id === 'glyphs' || !faceTool) {
        openGroup(group, arrow)
        return
      }
      closeOpen()
      deps.run('chart.drawings.arm', faceTool)
    })
    arrow.addEventListener('click', () => openGroup(group, arrow))
    groupFaces.set(group.id, { face, arrow })
    column.appendChild(cell(face, arrow))
  }

  column.appendChild(divider())

  // ── Measure and zoom ────────────────────────────────────────────────────────────────────────
  const measure = button({ class: 'qc-button', label: t(TRANSIENT_LABELS.measure), icon: deps.icons.icon('ruler'), onClick: () => deps.run('chart.drawings.arm', deps.state().activeTool === 'measure' ? null : 'measure') })
  const zoom = button({ class: 'qc-button', label: t(TRANSIENT_LABELS.zoom), icon: deps.icons.icon('zoomIn'), onClick: () => deps.run('chart.drawings.arm', deps.state().activeTool === 'zoom' ? null : 'zoom') })
  column.append(cell(measure, null), cell(zoom, null), divider())

  // ── Magnet, stay in mode, lock all ──────────────────────────────────────────────────────────
  const magnetFace = button({ class: 'qc-button', label: t('drawing.magnet'), onClick: () => deps.run('chart.drawings.magnet', toggleMagnet(deps.state().magnet, lastStrength())) })
  const lastStrength = (): Exclude<MagnetMode, 'off'> => (deps.state().magnet === 'strong' ? 'strong' : 'weak')
  const magnetArrow = button({ class: 'qc-button', label: t('drawing.magnetMenu'), icon: deps.icons.icon('chevronRight16') })
  magnetArrow.addEventListener('click', () => {
    const s = deps.state()
    openFlyout(
      magnetArrow,
      menu(
        t('drawing.magnetMenu'),
        ...MAGNET_STRENGTHS.map((strength) =>
          menuRow(t(MAGNET_LABELS[strength]), () => deps.run('chart.drawings.magnet', chooseMagnetStrength(s.magnet, strength)), {
            icon: deps.icons.icon(strength === 'strong' ? 'magnetStrong' : 'magnet'),
            active: s.magnet === strength,
            role: 'menuitemradio',
            command: 'chart.drawings.magnet',
          }),
        ),
      ),
    )
  })
  const stay = button({ class: 'qc-button qc-drawing-toolbar-mode', label: t('drawing.stayInDrawingMode'), onClick: () => deps.run('chart.drawings.stayInMode', !deps.state().stayInDrawingMode) })
  const lockAll = button({ class: 'qc-button', label: t('drawing.lockAll'), onClick: () => deps.run('chart.drawings.lockAll', !deps.state().allLocked) })
  column.append(cell(magnetFace, magnetArrow), cell(stay, null), cell(lockAll, null))

  // ── The eye ─────────────────────────────────────────────────────────────────────────────────
  const eyeFace = button({ class: 'qc-button', label: t('drawing.hideDrawings'), onClick: () => deps.run('chart.drawings.hide', { mode: deps.state().hide.mode, on: !deps.state().hide.on }) })
  const eyeArrow = button({ class: 'qc-button', label: t('drawing.hideMenu'), icon: deps.icons.icon('chevronRight16') })
  /** A subject's wording: the chart's own from the catalog, a contributed layer's from itself. */
  const hideLabel = (s: ToolbarState, mode: HideMode, kind: 'hide' | 'show'): string =>
    isBuiltInHideMode(mode) ? t(HIDE_LABELS[mode][kind]) : (s.hideLayers.find((layer) => layer.id === mode)?.label[kind] ?? '')
  /** The eye's mark for a subject in a state: the chart's own glyphs by name, a contributed
   *  layer's from its descriptor through the one builder every contributed glyph rides. */
  const hideMark = (s: ToolbarState, mode: HideMode, on: boolean): Node | null => {
    if (isBuiltInHideMode(mode)) return deps.icons.icon(HIDE_ICON[mode][on ? 'hidden' : 'shown'])
    const layer = s.hideLayers.find((l) => l.id === mode)
    return layer ? buildGlyph(layer.icon[on ? 'hidden' : 'shown']) : null
  }
  eyeArrow.addEventListener('click', () => {
    const s = deps.state()
    // The rows are words alone: the eye wears the subject's mark, the menu only names the choice.
    openFlyout(
      eyeArrow,
      menu(
        t('drawing.hideMenu'),
        ...hideOrder(s.hideLayers.map((layer) => layer.id)).map((mode) =>
          menuRow(hideLabel(s, mode, 'hide'), () => deps.run('chart.drawings.hide', chooseHideMode(s.hide, mode)), { active: hideRowActive(s.hide, mode), role: 'menuitemradio', command: 'chart.drawings.hide' }),
        ),
      ),
    )
  })
  column.append(cell(eyeFace, eyeArrow))

  // ── Drawing sync, present only in a layout of more than one chart ───────────────────────────
  let syncButton: HTMLButtonElement | null = null
  const syncCell = el('div', { class: 'qc-drawing-cell' })
  column.appendChild(syncCell)

  column.appendChild(divider())

  // ── Remove ──────────────────────────────────────────────────────────────────────────────────
  const removeFace = button({ class: 'qc-button', label: t('drawing.removeDrawings'), icon: deps.icons.icon('trash28'), onClick: () => deps.run('chart.drawings.removeAll', deps.state().removeLocked) })
  const removeArrow = button({ class: 'qc-button', label: t('drawing.removeMenu'), icon: deps.icons.icon('chevronRight16') })
  removeArrow.addEventListener('click', () => {
    const s = deps.state()
    const list = removeRows(s.counts, s.indicatorCount, s.removeLocked)
    const drawingsPhrase = t('drawing.countDrawings', { count: removableDrawings(s.counts, s.removeLocked) })
    const indicatorsPhrase = t('drawing.countIndicators', { count: s.indicatorCount })
    const items: HTMLElement[] = list.map((rowSpec) =>
      menuRow(
        rowSpec.id === 'both' ? t(rowSpec.label, { drawings: drawingsPhrase, indicators: indicatorsPhrase }) : t(rowSpec.label, { items: rowSpec.id === 'drawings' ? drawingsPhrase : indicatorsPhrase }),
        () => {
          if (rowSpec.drawings > 0) deps.run('chart.drawings.removeAll', s.removeLocked)
          if (rowSpec.indicators > 0) deps.run('chart.indicators.removeAll')
        },
        { commands: [...(rowSpec.drawings > 0 ? ['chart.drawings.removeAll'] : []), ...(rowSpec.indicators > 0 ? ['chart.indicators.removeAll'] : [])] },
      ),
    )
    if (items.length === 0) items.push(el('div', { class: 'qc-menu-note', text: t('drawing.nothingToRemove') }))
    const policy = el('button', { type: 'button', class: 'qc-menu-row qc-drawing-menu-row qc-drawing-switch-row', role: 'switch', 'aria-checked': String(s.removeLocked) })
    policy.disabled = !deps.available('chart.drawings.removeLockedPolicy')
    policy.hidden = !shown('chart.drawings.removeLockedPolicy')
    policy.append(el('span', { class: 'qc-menu-label', text: t('drawing.alwaysRemoveLocked') }), el('span', { class: 'qc-switch', 'aria-hidden': 'true' }, el('span', { class: 'qc-switch-knob' })))
    policy.addEventListener('click', () => {
      const next = !deps.state().removeLocked
      deps.run('chart.drawings.removeLockedPolicy', next)
      policy.setAttribute('aria-checked', String(next))
    })
    openFlyout(removeArrow, menu(t('drawing.removeMenu'), ...items, divider('menu'), policy))
  })
  column.append(cell(removeFace, removeArrow))

  // ── Favorites, pinned to the end ────────────────────────────────────────────────────────────
  const favorites = button({ class: 'qc-button qc-drawing-toolbar-mode', label: t('drawing.favToolsBar'), title: t('drawing.favTools'), onClick: () => deps.run('chart.drawings.favoritesBar', !deps.state().favorites.visible) })
  column.append(el('div', { class: 'qc-drawing-toolbar-end' }, cell(favorites, null)))

  const unrove = rovingFocus(toolbar, () => [...column.querySelectorAll<HTMLElement>('button')].filter((b) => !b.closest('[hidden]')), 'vertical')

  const setActive = (b: HTMLElement, active: boolean): void => {
    b.dataset.qcActive = String(active)
  }
  const relabelButton = (b: HTMLButtonElement, label: string, title = label): void => {
    b.setAttribute('aria-label', label)
    b.title = title
  }
  /** A button is enabled exactly when the registry would run its command now. */
  const gate = (b: HTMLButtonElement, command: string, refused = false): void => {
    b.disabled = refused || !deps.available(command)
    b.hidden = !shown(command)
  }

  const render = (): void => {
    const s = deps.state()
    // The cursor face wears the mode's glyph, or the eraser while it is armed.
    cursorFace.replaceChildren(deps.icons.icon(s.activeTool === 'eraser' ? 'eraser' : CURSOR_ICON[s.cursor]))
    setActive(cursorFace, cursorButtonArmed(s.activeTool))
    gate(cursorFace, 'chart.drawings.arm')
    gate(cursorArrow, 'chart.drawings.cursor')
    // The eraser is the cursor menu's one tool, so a host that hides it when refused keeps the menu
    // for the cursor modes.
    cursorArrow.hidden = !shown('chart.drawings.cursor') && !(shown('chart.drawings.arm') && toolShown('eraser'))
    const activeGroup = groupOfTool(groups, s.activeTool)
    for (const group of groups) {
      const entry = groupFaces.get(group.id)!
      const drawn = drawnGroup(group)
      // The armed tool takes the face immediately, even before the remembered preference writes.
      const faceTool = activeGroup === group.id && s.activeTool && toolShown(s.activeTool)
        ? s.activeTool
        : drawingToolbarFaceOf(drawn, s.drawingToolbarTools)
      // Every tool outside the glyph family carries its own miniature, which its group's face wears;
      // the glyph family's face is its own mark and opens the picker.
      entry.face.replaceChildren(...[group.id === 'glyphs' ? deps.icons.icon('groupGlyphs') : faceTool ? deps.icons.tool(faceTool) : null].filter((face) => face !== null))
      // The face is named by what it arms, so a reader and a test find the tool by name; the
      // glyph group's face opens the picker and is named by the group.
      const faceName = faceTool && group.id !== 'glyphs' ? toolName(t, faceTool, faceTool) : t(group.label)
      relabelButton(entry.face, faceName)
      gate(entry.face, 'chart.drawings.arm', !!faceTool && group.id !== 'glyphs' && !deps.toolAllowed(faceTool))
      gate(entry.arrow, 'chart.drawings.arm')
      if (drawn.sections.length === 0) entry.face.hidden = entry.arrow.hidden = true
      setActive(entry.face, activeGroup === group.id)
      entry.face.setAttribute('aria-pressed', String(activeGroup === group.id))
    }
    setActive(measure, s.activeTool === 'measure')
    setActive(zoom, s.activeTool === 'zoom')
    gate(measure, 'chart.drawings.arm')
    gate(zoom, 'chart.drawings.arm')
    if (!toolShown('measure')) measure.hidden = true
    if (!toolShown('zoom')) zoom.hidden = true
    magnetFace.replaceChildren(deps.icons.icon(s.magnet === 'strong' ? 'magnetStrong' : 'magnet'))
    setActive(magnetFace, s.magnet !== 'off')
    magnetFace.setAttribute('aria-pressed', String(s.magnet !== 'off'))
    gate(magnetFace, 'chart.drawings.magnet')
    gate(magnetArrow, 'chart.drawings.magnet')
    stay.replaceChildren(deps.icons.icon(s.stayInDrawingMode ? 'pinOn' : 'pin'))
    setActive(stay, s.stayInDrawingMode)
    stay.setAttribute('aria-pressed', String(s.stayInDrawingMode))
    gate(stay, 'chart.drawings.stayInMode')
    lockAll.replaceChildren(deps.icons.icon(s.allLocked ? 'lockClosed' : 'lockOpen'))
    relabelButton(lockAll, t(s.allLocked ? 'drawing.unlockAll' : 'drawing.lockAll'))
    setActive(lockAll, s.allLocked)
    lockAll.setAttribute('aria-pressed', String(s.allLocked))
    gate(lockAll, 'chart.drawings.lockAll')
    const mark = hideMark(s, s.hide.mode, s.hide.on)
    if (mark) eyeFace.replaceChildren(mark)
    else eyeFace.replaceChildren()
    relabelButton(eyeFace, hideLabel(s, s.hide.mode, s.hide.on ? 'show' : 'hide'))
    setActive(eyeFace, s.hide.on)
    eyeFace.setAttribute('aria-pressed', String(s.hide.on))
    gate(eyeFace, 'chart.drawings.hide')
    gate(eyeArrow, 'chart.drawings.hide')
    if (s.layoutCharts > 1) {
      if (!syncButton) {
        syncButton = button({ class: 'qc-button qc-drawing-toolbar-button', label: t('drawing.syncLabel'), icon: deps.icons.icon('sync'), onClick: () => deps.run('chart.drawings.sync', !deps.state().sync) })
        syncCell.appendChild(syncButton)
      }
      syncButton.title = t(s.sync ? 'drawing.syncOnHelp' : 'drawing.syncOffHelp')
      syncButton.setAttribute('aria-pressed', String(s.sync))
      setActive(syncButton, s.sync)
      gate(syncButton, 'chart.drawings.sync')
    } else if (syncButton) {
      syncButton.remove()
      syncButton = null
    }
    const removable = removableDrawings(s.counts, s.removeLocked)
    removeFace.title = removable > 0 ? t('drawing.removeItems', { items: t('drawing.countDrawings', { count: removable }) }) : t('drawing.removeDrawings')
    // The remove face takes drawings, so it is live only while there are drawings to take. The
    // arrow always opens: its menu names what each row would take and gates every row itself.
    gate(removeFace, 'chart.drawings.removeAll')
    removeArrow.hidden = !shown('chart.drawings.removeAll') && !shown('chart.indicators.removeAll') && !shown('chart.drawings.removeLockedPolicy')
    favorites.replaceChildren(deps.icons.icon('favoritesBar'))
    favorites.setAttribute('aria-pressed', String(s.favorites.visible))
    setActive(favorites, s.favorites.visible)
    gate(favorites, 'chart.drawings.favoritesBar')
    // A cell whose every control is left out goes, and a rule left with nothing on one side of it.
    for (const box of column.querySelectorAll<HTMLElement>('.qc-drawing-cell')) {
      const controls = [...box.querySelectorAll<HTMLElement>('button')]
      box.hidden = controls.length > 0 && controls.every((control) => control.hidden)
    }
    tidyRules(column, (child) => !child.hidden && [...child.querySelectorAll<HTMLElement>('button')].some((control) => !control.closest('[hidden]')))
  }

  const relabel = (): void => {
    toolbar.setAttribute('aria-label', t('drawing.toolbar'))
    relabelButton(cursorFace, t('drawing.cursor'))
    relabelButton(cursorArrow, t('drawing.cursorMenu'))
    for (const group of groups) relabelButton(groupFaces.get(group.id)!.arrow, t('drawing.groupMenu', { group: t(group.label) }))
    relabelButton(measure, t(TRANSIENT_LABELS.measure))
    relabelButton(zoom, t(TRANSIENT_LABELS.zoom))
    relabelButton(magnetFace, t('drawing.magnet'))
    relabelButton(magnetArrow, t('drawing.magnetMenu'))
    relabelButton(stay, t('drawing.stayInDrawingMode'))
    relabelButton(eyeArrow, t('drawing.hideMenu'))
    relabelButton(removeFace, t('drawing.removeDrawings'))
    relabelButton(removeArrow, t('drawing.removeMenu'))
    relabelButton(favorites, t('drawing.favToolsBar'), t('drawing.favTools'))
    if (syncButton) relabelButton(syncButton, t('drawing.syncLabel'))
    render()
  }

  const mount = (container: HTMLElement | null): void => {
    const nextPanelHost = panelHostFor(container, deps.chrome)
    if (toolbar.parentElement === container && panelHost === nextPanelHost) return
    closeOpen()
    panelHost = nextPanelHost
    toolbar.remove()
    container?.appendChild(toolbar)
    render()
  }
  mount(deps.container === undefined ? deps.chrome : deps.container)
  render()
  return {
    mount,
    render,
    relabel,
    destroy() {
      closeOpen()
      unrove()
      glyphPicker?.destroy()
      glyphPicker = null
      toolbar.remove()
    },
  }
}

// The drawing toolbar: the rail down the chart's inline-start edge. One button per tool group,
// each with a flyout of the group's sections; the cursor with its modes and the eraser; measure
// and zoom; the magnet with its strengths; stay-in-drawing-mode; lock all; the eye with its
// subjects; drawing sync in a layout; the remove menu that names what it takes; and the favorites
// star. WHAT is on the rail comes from the models on `quickcharts/drawings`; this module is the
// rail's presentation over them, and every action it takes is a command through the registry, so
// a verb the host hides or refuses is refused here too.
//
// The rail renders from a state getter and re-renders on demand. Flyouts are built when they open
// and torn down when they close, so the toolbar's own DOM stays the buttons a reader can count.
import type { ChartTranslate } from '../../i18n'
import { toolName } from '../../i18n'
import {
  buildRailGroups,
  chooseHideMode,
  chooseMagnetStrength,
  CURSOR_LABELS,
  CURSOR_MODES,
  cursorButtonArmed,
  groupOfTool,
  HIDE_LABELS,
  HIDE_ORDER,
  hideRowActive,
  isFavorite,
  MAGNET_LABELS,
  MAGNET_STRENGTHS,
  railFaceOf,
  removableDrawings,
  removeRows,
  toggleMagnet,
  TRANSIENT_LABELS,
  type CursorMode,
  type DrawingCounts,
  type FavoritesState,
  type HideMode,
  type HideState,
  type MagnetMode,
  type RailGroup,
} from '../../drawings/index'
import { button, el, focusFirst, menuKeys, ownPointer, rovingFocus } from './dom'
import { openPopover } from './fields'
import { mountGlyphPicker, type GlyphKind } from './glyphPicker'
import { iconSvg, type IconName } from './icons'
import { toolIconSvg } from './toolIcons'

/** Everything the rail renders from, read live at every render. */
export interface ToolbarState {
  activeTool: string | null
  cursor: CursorMode
  magnet: MagnetMode
  stayInDrawingMode: boolean
  allLocked: boolean
  hide: HideState
  /** Whether new drawings are shared across the layout. */
  sync: boolean
  removeLocked: boolean
  counts: DrawingCounts
  indicatorCount: number
  railTools: Readonly<Record<string, string>>
  favorites: FavoritesState
  recentGlyphs: readonly string[]
  /** Charts in the layout; the sync control exists only past one. */
  layoutCharts: number
}

export interface ToolbarDeps {
  /** The chrome subtree the rail mounts into, and the box its flyouts stay within. */
  chrome: HTMLElement
  t: ChartTranslate
  state(): ToolbarState
  /** Run a command through the registry. Answers whether it ran. */
  run(command: string, arg?: unknown): boolean
  /** Whether the access policy permits arming a tool. A refused tool renders disabled. */
  toolAllowed(type: string): boolean
  /** Artwork for a glyph, from the host's asset port. */
  glyphSource?: (glyph: string) => string | null
}

export interface ToolbarHandle {
  /** Re-render from the current state. */
  render(): void
  /** Re-read every label, after a language switch. */
  relabel(): void
  destroy(): void
}

/** Each group's static face, worn when its face tool carries no miniature (the glyph group). */
const GROUP_ICON: Record<string, IconName> = {
  trend: 'groupTrend',
  'fib-gann': 'groupFib',
  patterns: 'groupPatterns',
  forecast: 'groupForecast',
  shapes: 'groupShapes',
  annotation: 'groupText',
  glyphs: 'groupGlyphs',
}

const CURSOR_ICON: Record<CursorMode, IconName> = { cross: 'cursorCross', dot: 'cursorDot', arrow: 'cursorArrow' }

const HIDE_ICON: Record<HideMode, { shown: IconName; hidden: IconName }> = {
  drawings: { shown: 'drawingsShown', hidden: 'drawingsHidden' },
  indicators: { shown: 'indicatorsShown', hidden: 'indicatorsHidden' },
  all: { shown: 'allShown', hidden: 'allHidden' },
}

export function mountDrawingToolbar(deps: ToolbarDeps): ToolbarHandle {
  const { t } = deps
  const groups: RailGroup[] = buildRailGroups()
  const rail = el('div', { class: 'qc-surface qc-drawing-toolbar', role: 'toolbar', 'aria-orientation': 'vertical', 'aria-label': t('drawing.toolbar'), 'data-role': 'drawing-toolbar' })
  ownPointer(rail)
  const column = el('div', { class: 'qc-drawing-toolbar-column' })
  rail.appendChild(column)

  /** The one open flyout's closer. Opening another closes it first: a swap, not a stack. */
  let closeFlyout: (() => void) | null = null
  const closeOpen = (): void => {
    closeFlyout?.()
    closeFlyout = null
  }
  const openFlyout = (anchor: HTMLElement, content: HTMLElement, onClose?: () => void): void => {
    const wasOpen = anchor.getAttribute('aria-expanded') === 'true'
    closeOpen()
    if (wasOpen) return
    const close = openPopover(deps.chrome, anchor, content, 'side', () => {
      if (closeFlyout === close) closeFlyout = null
      onClose?.()
    })
    closeFlyout = close
    focusFirst(content)
  }
  column.addEventListener('scroll', closeOpen)

  const rows = (menu: HTMLElement): HTMLElement[] => [...menu.querySelectorAll<HTMLElement>('[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"], [role="switch"]')]
  const menuRow = (label: string, onPick: () => void, options: { icon?: string; active?: boolean; role?: string } = {}): HTMLButtonElement => {
    const b = el('button', { type: 'button', class: 'qc-menu-row qc-drawing-menu-row', role: options.role ?? 'menuitem' })
    if (options.active !== undefined) b.setAttribute('aria-checked', String(options.active))
    if (options.active) b.dataset.qcActive = 'true'
    const cell = el('span', { class: 'qc-menu-icon' })
    if (options.icon) cell.innerHTML = options.icon
    b.append(cell, el('span', { class: 'qc-menu-label', text: label }))
    b.addEventListener('click', () => {
      closeOpen()
      onPick()
    })
    return b
  }
  const menu = (label: string, ...items: HTMLElement[]): HTMLElement => {
    const m = el('div', { class: 'qc-drawing-menu', role: 'menu', 'aria-label': label }, ...items)
    menuKeys(m, () => rows(m))
    return m
  }

  /** A split entry: the face button acts, the arrow opens the flyout. */
  const cell = (face: HTMLButtonElement, arrow: HTMLButtonElement | null): HTMLElement => {
    const box = el('div', { class: 'qc-drawing-cell' }, face)
    face.classList.add('qc-drawing-rail-button')
    if (arrow) {
      arrow.classList.add('qc-drawing-rail-arrow')
      arrow.setAttribute('aria-haspopup', 'menu')
      arrow.setAttribute('aria-expanded', 'false')
      box.appendChild(arrow)
    }
    return box
  }
  const divider = (): HTMLElement => el('div', { class: 'qc-separator qc-drawing-divider', role: 'separator' })

  // ── Cursor ──────────────────────────────────────────────────────────────────────────────────
  const cursorFace = button({ class: 'qc-button', label: t('drawing.cursor'), onClick: () => deps.run('chart.drawings.arm', null) })
  const cursorArrow = button({ class: 'qc-button', label: t('drawing.cursorMenu'), html: iconSvg('chevronRight', 18) })
  cursorArrow.addEventListener('click', () => {
    const s = deps.state()
    openFlyout(
      cursorArrow,
      menu(
        t('drawing.cursorMenu'),
        ...CURSOR_MODES.map((mode) =>
          menuRow(t(CURSOR_LABELS[mode]), () => deps.run('chart.drawings.cursor', mode), { icon: iconSvg(CURSOR_ICON[mode]), active: s.cursor === mode && s.activeTool !== 'eraser', role: 'menuitemradio' }),
        ),
        menuRow(t(TRANSIENT_LABELS.eraser), () => deps.run('chart.drawings.arm', 'eraser'), { icon: iconSvg('eraser'), active: s.activeTool === 'eraser', role: 'menuitemradio' }),
      ),
    )
  })
  column.appendChild(cell(cursorFace, cursorArrow))

  // ── Tool groups ─────────────────────────────────────────────────────────────────────────────
  const groupFaces = new Map<string, { face: HTMLButtonElement; arrow: HTMLButtonElement }>()
  const openGroup = (group: RailGroup, anchor: HTMLElement): void => {
    if (group.id === 'glyphs') {
      let picker: ReturnType<typeof mountGlyphPicker> | null = null
      picker = mountGlyphPicker({
        t,
        ...(deps.glyphSource ? { glyphSource: deps.glyphSource } : {}),
        recents: deps.state().recentGlyphs,
        onPick: (kind: GlyphKind, glyph: string) => {
          closeOpen()
          deps.run('chart.drawings.arm', { tool: kind, props: { glyph } })
        },
      })
      openFlyout(anchor, picker.root, () => picker?.destroy())
      return
    }
    const s = deps.state()
    const list = el('div', { class: 'qc-drawing-flyout', role: 'menu', 'aria-label': t(group.label) })
    group.sections.forEach((section, index) => {
      if (index > 0) list.appendChild(divider())
      list.appendChild(el('div', { class: 'qc-dialog-heading', text: t(section.label) }))
      for (const tool of section.tools) {
        const name = toolName(t, tool.type, tool.name)
        const fav = isFavorite(s.favorites, tool.type)
        const rowEl = el('div', { class: 'qc-drawing-flyout-row' })
        const pick = el('button', { type: 'button', class: 'qc-menu-row qc-drawing-menu-row', role: 'menuitem', 'data-tool': tool.type })
        pick.innerHTML = `<span class="qc-menu-icon">${toolIconSvg(tool.type)}</span>`
        pick.appendChild(el('span', { class: 'qc-menu-label', text: name }))
        if (s.activeTool === tool.type) pick.dataset.qcActive = 'true'
        if (!deps.toolAllowed(tool.type)) pick.disabled = true
        pick.addEventListener('click', () => {
          closeOpen()
          deps.run('chart.drawings.arm', tool.type)
        })
        const star = button({
          class: 'qc-drawing-star',
          label: t(fav ? 'drawing.favRemove' : 'drawing.favAdd', { tool: name }),
          html: iconSvg(fav ? 'starFilled' : 'star', 18),
          pressed: fav,
          onClick: () => {
            deps.run('chart.drawings.favorite', tool.type)
            const now = isFavorite(deps.state().favorites, tool.type)
            star.innerHTML = iconSvg(now ? 'starFilled' : 'star', 18)
            star.setAttribute('aria-pressed', String(now))
            star.setAttribute('aria-label', t(now ? 'drawing.favRemove' : 'drawing.favAdd', { tool: name }))
            star.title = star.getAttribute('aria-label') ?? ''
          },
        })
        rowEl.append(pick, star)
        list.appendChild(rowEl)
      }
    })
    menuKeys(list, () => rows(list))
    openFlyout(anchor, list)
  }
  for (const group of groups) {
    const face = button({ class: 'qc-button', label: t(group.label) })
    const arrow = button({ class: 'qc-button', label: t('drawing.groupMenu', { group: t(group.label) }), html: iconSvg('chevronRight', 18) })
    face.addEventListener('click', () => {
      // The face arms the tool it wears. The glyph group is the exception: a glyph tool is nothing
      // without a chosen glyph, so its face opens the picker as its arrow does.
      const faceTool = railFaceOf(group, deps.state().railTools)
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
  const measure = button({ class: 'qc-button', label: t(TRANSIENT_LABELS.measure), html: iconSvg('ruler'), onClick: () => deps.run('chart.drawings.arm', deps.state().activeTool === 'measure' ? null : 'measure') })
  const zoom = button({ class: 'qc-button', label: t(TRANSIENT_LABELS.zoom), html: iconSvg('zoomIn'), onClick: () => deps.run('chart.drawings.arm', deps.state().activeTool === 'zoom' ? null : 'zoom') })
  column.append(cell(measure, null), cell(zoom, null), divider())

  // ── Magnet, stay in mode, lock all ──────────────────────────────────────────────────────────
  const magnetFace = button({ class: 'qc-button', label: t('drawing.magnet'), onClick: () => deps.run('chart.drawings.magnet', toggleMagnet(deps.state().magnet, lastStrength())) })
  const lastStrength = (): Exclude<MagnetMode, 'off'> => (deps.state().magnet === 'strong' ? 'strong' : 'weak')
  const magnetArrow = button({ class: 'qc-button', label: t('drawing.magnetMenu'), html: iconSvg('chevronRight', 18) })
  magnetArrow.addEventListener('click', () => {
    const s = deps.state()
    openFlyout(
      magnetArrow,
      menu(
        t('drawing.magnetMenu'),
        ...MAGNET_STRENGTHS.map((strength) =>
          menuRow(t(MAGNET_LABELS[strength]), () => deps.run('chart.drawings.magnet', chooseMagnetStrength(s.magnet, strength)), {
            icon: iconSvg(strength === 'strong' ? 'magnetStrong' : 'magnet'),
            active: s.magnet === strength,
            role: 'menuitemradio',
          }),
        ),
      ),
    )
  })
  const stay = button({ class: 'qc-button', label: t('drawing.stayInDrawingMode'), onClick: () => deps.run('chart.drawings.stayInMode', !deps.state().stayInDrawingMode) })
  const lockAll = button({ class: 'qc-button', label: t('drawing.lockAll'), onClick: () => deps.run('chart.drawings.lockAll', !deps.state().allLocked) })
  column.append(cell(magnetFace, magnetArrow), cell(stay, null), cell(lockAll, null))

  // ── The eye ─────────────────────────────────────────────────────────────────────────────────
  const eyeFace = button({ class: 'qc-button', label: t('drawing.hideDrawings'), onClick: () => deps.run('chart.drawings.hide', { mode: deps.state().hide.mode, on: !deps.state().hide.on }) })
  const eyeArrow = button({ class: 'qc-button', label: t('drawing.hideMenu'), html: iconSvg('chevronRight', 18) })
  eyeArrow.addEventListener('click', () => {
    const s = deps.state()
    openFlyout(
      eyeArrow,
      menu(
        t('drawing.hideMenu'),
        ...HIDE_ORDER.map((mode) =>
          menuRow(t(HIDE_LABELS[mode].hide), () => deps.run('chart.drawings.hide', chooseHideMode(s.hide, mode)), { icon: iconSvg(HIDE_ICON[mode].hidden), active: hideRowActive(s.hide, mode), role: 'menuitemradio' }),
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
  const removeFace = button({ class: 'qc-button', label: t('drawing.removeDrawings'), html: iconSvg('trash'), onClick: () => deps.run('chart.drawings.removeAll', deps.state().removeLocked) })
  const removeArrow = button({ class: 'qc-button', label: t('drawing.removeMenu'), html: iconSvg('chevronRight', 18) })
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
      ),
    )
    if (items.length === 0) items.push(el('div', { class: 'qc-muted qc-drawing-menu-note', text: t('drawing.nothingToRemove') }))
    const policy = el('button', { type: 'button', class: 'qc-menu-row qc-drawing-menu-row qc-drawing-switch-row', role: 'switch', 'aria-checked': String(s.removeLocked) })
    policy.append(el('span', { class: 'qc-menu-label', text: t('drawing.alwaysRemoveLocked') }), el('span', { class: 'qc-drawing-switch', 'aria-hidden': 'true' }, el('span', { class: 'qc-drawing-switch-knob' })))
    policy.addEventListener('click', () => {
      const next = !deps.state().removeLocked
      deps.run('chart.drawings.removeLockedPolicy', next)
      policy.setAttribute('aria-checked', String(next))
    })
    openFlyout(removeArrow, menu(t('drawing.removeMenu'), ...items, divider(), policy))
  })
  column.append(cell(removeFace, removeArrow))

  // ── Favorites, pinned to the end ────────────────────────────────────────────────────────────
  const favorites = button({ class: 'qc-button', label: t('drawing.favToolsBar'), title: t('drawing.favTools'), onClick: () => deps.run('chart.drawings.favoritesBar', !deps.state().favorites.visible) })
  column.append(el('div', { class: 'qc-drawing-toolbar-end' }, cell(favorites, null)))

  const unrove = rovingFocus(rail, () => [...column.querySelectorAll<HTMLElement>('button')], 'vertical')

  const setActive = (b: HTMLElement, active: boolean): void => {
    b.dataset.qcActive = String(active)
  }
  const relabelButton = (b: HTMLButtonElement, label: string, title = label): void => {
    b.setAttribute('aria-label', label)
    b.title = title
  }

  const render = (): void => {
    const s = deps.state()
    // The cursor face wears the mode's glyph, or the eraser while it is armed.
    cursorFace.innerHTML = iconSvg(s.activeTool === 'eraser' ? 'eraser' : CURSOR_ICON[s.cursor])
    setActive(cursorFace, cursorButtonArmed(s.activeTool))
    const activeGroup = groupOfTool(groups, s.activeTool)
    for (const group of groups) {
      const entry = groupFaces.get(group.id)!
      const faceTool = railFaceOf(group, s.railTools)
      const miniature = faceTool && group.id !== 'glyphs' ? toolIconSvg(faceTool) : ''
      entry.face.innerHTML = miniature || iconSvg(GROUP_ICON[group.id] ?? 'groupTrend')
      // The face is named by what it arms, so a reader and a test find the tool by name; the
      // glyph group's face opens the picker and is named by the group.
      const faceName = faceTool && group.id !== 'glyphs' ? toolName(t, faceTool, faceTool) : t(group.label)
      relabelButton(entry.face, faceName)
      entry.face.disabled = !!faceTool && group.id !== 'glyphs' && !deps.toolAllowed(faceTool)
      setActive(entry.face, activeGroup === group.id)
    }
    setActive(measure, s.activeTool === 'measure')
    setActive(zoom, s.activeTool === 'zoom')
    magnetFace.innerHTML = iconSvg(s.magnet === 'strong' ? 'magnetStrong' : 'magnet')
    setActive(magnetFace, s.magnet !== 'off')
    magnetFace.setAttribute('aria-pressed', String(s.magnet !== 'off'))
    stay.innerHTML = iconSvg(s.stayInDrawingMode ? 'pinOn' : 'pin')
    setActive(stay, s.stayInDrawingMode)
    stay.setAttribute('aria-pressed', String(s.stayInDrawingMode))
    lockAll.innerHTML = iconSvg(s.allLocked ? 'lockClosed' : 'lockOpen')
    relabelButton(lockAll, t(s.allLocked ? 'drawing.unlockAll' : 'drawing.lockAll'))
    setActive(lockAll, s.allLocked)
    lockAll.setAttribute('aria-pressed', String(s.allLocked))
    eyeFace.innerHTML = iconSvg(s.hide.on ? HIDE_ICON[s.hide.mode].hidden : HIDE_ICON[s.hide.mode].shown)
    relabelButton(eyeFace, t(s.hide.on ? HIDE_LABELS[s.hide.mode].show : HIDE_LABELS[s.hide.mode].hide))
    setActive(eyeFace, s.hide.on)
    eyeFace.setAttribute('aria-pressed', String(s.hide.on))
    if (s.layoutCharts > 1) {
      if (!syncButton) {
        syncButton = button({ class: 'qc-button qc-drawing-rail-button', label: t('drawing.syncLabel'), html: iconSvg('sync'), onClick: () => deps.run('chart.drawings.sync', !deps.state().sync) })
        syncCell.appendChild(syncButton)
      }
      syncButton.title = t(s.sync ? 'drawing.syncOnHelp' : 'drawing.syncOffHelp')
      syncButton.setAttribute('aria-pressed', String(s.sync))
      setActive(syncButton, s.sync)
    } else if (syncButton) {
      syncButton.remove()
      syncButton = null
    }
    const removable = removableDrawings(s.counts, s.removeLocked)
    removeFace.title = removable > 0 ? t('drawing.removeItems', { items: t('drawing.countDrawings', { count: removable }) }) : t('drawing.removeDrawings')
    favorites.innerHTML = iconSvg(s.favorites.visible ? 'starFilled' : 'star')
    favorites.setAttribute('aria-pressed', String(s.favorites.visible))
    setActive(favorites, s.favorites.visible)
  }

  const relabel = (): void => {
    rail.setAttribute('aria-label', t('drawing.toolbar'))
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

  deps.chrome.appendChild(rail)
  render()
  return {
    render,
    relabel,
    destroy() {
      closeOpen()
      unrove()
      rail.remove()
    },
  }
}

// The context menu the chart raises on right-click (the rows come from `chartContextMenu`; this is
// the painter), the price menu the price scale's plus opens, which holds the rows for the price
// alone, and the scale's menu its corner button opens, whose rows may each open a flyout of rows
// beside it. Same chrome discipline as the drawing toolbar, the legend and the chrome surfaces:
// package-owned vanilla DOM mounted into the chrome subtree, opting back into pointer events so the
// drag layers cannot steal its presses, and painted entirely through `.qc-*` recipes. The only
// inline writes are the clamped position, which is calculated at the moment the menu opens.
//
// The geometry: a 327px box of 32px rows, the glyph 8px in at its own 28 grid with the label at 40,
// and 1px separators between groups. The price menu is the same box as wide as its widest row. Those
// numbers live in the `.qc-menu*` recipes; the one below is the width the viewport clamp needs as a
// number, because a clamp is arithmetic rather than a rule.
import { chartContextMenuGroups, flattenMenuGroups, type ChartMenuAction, type ChartMenuContext, type ChartMenuIcon, type ChartMenuRow } from './contextMenu'
import type { ChartExtensionIcon } from './extension'
import { createChartI18n, readingDirection, type ChartI18n } from './i18n'
import { buildGlyph } from './ui/chrome/vector'
import { CHECK_PATH, ICONS as GLYPHS, NUT_PATH, NUT_RING_PATH } from './ui/controls/icons'
import type { ChartIconId, ChartIcons } from './ui/icons/catalog'
import { createIconDiagnostics } from './ui/icons/draw'
import { createIconResolver, type IconResolver } from './ui/icons/resolver'

/** A row the HOST contributed for this raise (through the chart's extension seam). It carries its
 *  own action, so the painter routes nothing and a contributed row can never collide with a
 *  built-in id. Structural on purpose: the menu has no dependency on who contributed or why. */
export interface ContextMenuExtraRow {
  label: string
  shortcut?: string
  checked?: boolean
  /** An inert vector glyph for the shared gutter. */
  icon?: ChartExtensionIcon
  /** `level` rows (the default) group under Copy price and Paste; `view` rows under the removes. */
  group?: 'level' | 'view'
  run(): void
}

export interface ContextMenuHandle {
  /** Raise the menu at a viewport point, for the level the caller resolved. `extra` places the
   *  contributed rows by their group between the built-ins; an empty list adds no separator. */
  open(at: { clientX: number; clientY: number }, ctx: ChartMenuContext, extra?: readonly ContextMenuExtraRow[]): void
  close(): void
  destroy(): void
}

/** A row of the price menu the scale's plus opens: a contributed row, or one of the chart's own,
 *  which brings its glyph already drawn. */
export interface PriceMenuRow extends ContextMenuExtraRow {
  glyph?: Element | null
}

/** A row of the scale's menu. A press runs it, or, on a row holding `rows`, opens them in a flyout
 *  beside the menu. A `disabled` row stands dimmed and takes no press. */
export interface ScaleMenuRow {
  label: string
  shortcut?: string
  checked?: boolean
  icon?: ChartMenuIcon
  disabled?: boolean
  run?(): void
  /** The flyout's groups, a rule between each. */
  rows?: readonly (readonly ScaleMenuRow[])[]
}

/** The plus the price menu opens under, in viewport pixels, and the side of the plot its scale
 *  stands on: the menu's end meets the plus's end on that side. */
export interface PriceMenuPlacement {
  left: number
  top: number
  right: number
  bottom: number
  side: 'left' | 'right'
}

/** The menu over the widget's own resolver, with the price menu beside the right-click one. */
export interface WidgetMenuHandle extends ContextMenuHandle {
  /** Rebuild an open menu's rows where they stand. */
  refresh(): void
  /** Raise the price menu under the plus: the groups `rows` builds, a rule between each, and nothing
   *  of the right-click menu's own. `rows` is asked again when the language changes under the open
   *  menu. `focus` puts the keyboard on the first row. The page under it stays live: a press off it
   *  closes it and reaches nothing beneath. */
  openPrice(at: PriceMenuPlacement, rows: () => readonly (readonly PriceMenuRow[])[], focus: boolean): void
  /** Raise the scale's menu flush above its corner button, its end on the button's end on the
   *  scale's side, and inside the viewport. It stands as the price menu stands: a press off it closes
   *  it and reaches nothing beneath. `expanded` hears it open and close. */
  openScale(at: PriceMenuPlacement, rows: () => readonly (readonly ScaleMenuRow[])[], focus: boolean, expanded: (open: boolean) => void): void
}

/** The measured box width, which the viewport clamp needs as a number. */
const MENU_W = 327

/** The path data of a glyph drawn as one path. */
const pathOf = (body: string): string => /\sd="([^"]+)"/.exec(body)?.[1] ?? ''

/** The menu's own glyphs, as DESCRIPTORS on the same 28 grid a contributed one is drawn on, and
 *  inline so the package ships no asset dependency. They ride the one builder every glyph in this
 *  menu rides, which is what keeps the chart's rows and a host's rows a single icon contract rather
 *  than two that can drift apart. */
const ICONS: Record<ChartMenuIcon, ChartExtensionIcon> = {
  // Three quarters of a circle run back to a level line across its top, and the head the line ends in.
  reset: {
    paths: [
      { d: 'M8.5 6.5H15A8.5 8.5 0 1 1 6.5 15', paint: 'outline' },
      { d: 'M12 3 8.5 6.5 12 10', paint: 'outline' },
    ],
  },
  // The settings mark's nut and ring.
  settings: {
    paths: [
      { d: NUT_RING_PATH, rule: 'evenodd' },
      { d: NUT_PATH, rule: 'evenodd' },
    ],
  },
  check: { paths: [{ d: CHECK_PATH }] },
  // The drawing toolbar's own glyphs for a table's edits and for removing, drawn once.
  'table-add-column': { paths: [{ d: pathOf(GLYPHS.tableAddColumn.body) }] },
  'table-add-row': { paths: [{ d: pathOf(GLYPHS.tableAddRow.body) }] },
  delete: { paths: [{ d: pathOf(GLYPHS.trash28.body) }] },
}

/** The icon each of the menu's own glyphs draws, so a host's drawing for it stands here as it stands
 *  in every other control that means the same. */
const MENU_ICON_IDS = { reset: 'reset', settings: 'settings', check: 'check', 'table-add-column': 'tableAddColumn', 'table-add-row': 'tableAddRow', delete: 'delete' } as const satisfies Record<ChartMenuIcon, ChartIconId>

/** `strings` is the chart's language: the rows are built through it every time the menu is raised,
 *  and an open menu re-labels in place if the language changes under it. `icons` are the host's
 *  drawings for the menu's own glyphs, as a chart takes them. */
export function mountContextMenu(
  container: HTMLElement,
  run: (id: ChartMenuAction) => void,
  strings: ChartI18n = createChartI18n(),
  icons?: ChartIcons,
): ContextMenuHandle {
  return mountMenu(container, run, strings, createIconResolver({ icons, document: container.ownerDocument, direction: () => readingDirection(strings), diagnostics: createIconDiagnostics() }))
}

/** The menu over the widget's own resolver, so its glyphs wear what every other control of the
 *  widget wears and a failed drawing is reported where the widget's others are. */
/** `shown` says whether a built-in row is drawn at all; a row it turns away leaves its group, and an
 *  emptied group draws no rule. `refresh` rebuilds an open menu's rows where they stand, asking
 *  `shown` again, for a change the menu cannot observe on its own (the host's access policy
 *  answering differently); a closed menu stays closed. */
export function mountMenu(container: HTMLElement, run: (id: ChartMenuAction) => void, strings: ChartI18n, icons: IconResolver, shown: (id: ChartMenuAction) => boolean = () => true): WidgetMenuHandle {
  // A full-viewport backdrop closes the right-click menu on any press elsewhere, and swallows the
  // browser's own menu so a second right-click re-aims ours rather than stacking the native one on top.
  const backdrop = document.createElement('div')
  backdrop.className = 'qc-menu-backdrop'
  backdrop.hidden = true
  backdrop.addEventListener('contextmenu', (e) => e.preventDefault())

  const box = document.createElement('div')
  box.className = 'qc-overlay qc-menu'
  box.hidden = true
  box.addEventListener('contextmenu', (e) => e.preventDefault())
  for (const type of ['pointerdown', 'pointerup', 'pointermove'] as const) box.addEventListener(type, (e) => e.stopPropagation())

  /** The level the open menu is showing rows for — kept so the rows can be rebuilt in place. */
  let openCtx: ChartMenuContext | null = null
  /** The contributed rows this raise was given, kept for the same rebuild. */
  let openExtra: readonly ContextMenuExtraRow[] = []
  /** The open price menu's rows, asked again for a rebuild; null while the price menu is shut. */
  let openPriceRows: (() => readonly (readonly PriceMenuRow[])[]) | null = null
  /** The open scale menu's rows, asked again for a rebuild; null while it is shut. */
  let openScaleRows: (() => readonly (readonly ScaleMenuRow[])[]) | null = null
  /** How the button that raised the scale menu hears it close. */
  let scaleExpanded: ((open: boolean) => void) | null = null
  /** The side the scale stands on, which the flyouts open away from. */
  let scaleSide: 'left' | 'right' = 'right'
  /** The row whose flyout stands open. */
  let flyoutRow: HTMLButtonElement | null = null

  /** The box a row's flyout opens in, in the document only while it stands. */
  const flyout = document.createElement('div')
  flyout.className = 'qc-overlay qc-menu qc-price-menu'
  flyout.addEventListener('contextmenu', (e) => e.preventDefault())
  for (const type of ['pointerdown', 'pointerup', 'pointermove'] as const) flyout.addEventListener(type, (e) => e.stopPropagation())

  /** Say on a row whether its flyout stands open. */
  const markFlyout = (row: HTMLButtonElement, open: boolean): void => {
    row.ariaExpanded = String(open)
    row.dataset.qcFlyout = open ? 'open' : 'shut'
  }

  const closeFlyout = (): void => {
    flyout.remove()
    flyout.replaceChildren()
    if (flyoutRow) markFlyout(flyoutRow, false)
    flyoutRow = null
  }

  const closeScale = (): void => {
    closeFlyout()
    openScaleRows = null
    scaleExpanded?.(false)
    scaleExpanded = null
  }

  const close = (): void => {
    box.hidden = true
    backdrop.hidden = true
    box.replaceChildren()
    box.classList.remove('qc-price-menu')
    openCtx = null
    openExtra = []
    openPriceRows = null
    closeScale()
  }
  backdrop.addEventListener('pointerdown', close)
  const onKey = (e: KeyboardEvent): void => {
    if (box.hidden) return
    const active = box.ownerDocument.activeElement
    const inFlyout = active instanceof Node && flyout.contains(active)
    if (e.key === 'Escape') {
      if (!inFlyout) return close()
      const row = flyoutRow
      closeFlyout()
      row?.focus()
      return
    }
    if (openScaleRows === null || !(active instanceof HTMLElement)) return
    const rows = Array.from((inFlyout ? flyout : box).querySelectorAll<HTMLButtonElement>('.qc-menu-row:not([disabled])'))
    const at = rows.indexOf(active as HTMLButtonElement)
    if (at < 0) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      rows[(at + (e.key === 'ArrowDown' ? 1 : rows.length - 1)) % rows.length]?.focus()
    } else if (e.key === 'ArrowRight' && active.dataset.qcFlyout !== undefined) {
      e.preventDefault()
      active.click()
    } else if (e.key === 'ArrowLeft' && inFlyout) {
      e.preventDefault()
      const row = flyoutRow
      closeFlyout()
      row?.focus()
    }
  }
  window.addEventListener('keydown', onKey)

  // The price menu raises no backdrop, so the chart under it stays live: while the pointer is on the
  // chart, its crosshair, the crosshair's price label and the plus the menu opened from stand where
  // the pointer holds them, and they go only when it leaves for the menu. A press anywhere off the
  // menu closes it all the same, and that press is the menu's: it, its release, and the click, the
  // right-click or the touches the browser makes of them reach nothing beneath. Holding the press's
  // default back also holds back the mouse events it would have raised.
  const view = container.ownerDocument.defaultView ?? window
  /** The pointer whose press closed the price menu, until what the browser makes of it has passed. */
  let closing: number | null = null
  const onPressOff = (e: PointerEvent): void => {
    closing = null
    if (openPriceRows === null && openScaleRows === null) return
    if (e.target instanceof Node && (box.contains(e.target) || flyout.contains(e.target))) return
    close()
    closing = e.pointerId
    e.preventDefault()
    e.stopPropagation()
  }
  const onReleaseOff = (e: PointerEvent): void => {
    if (closing === e.pointerId) e.stopPropagation()
  }
  const onAfterPressOff = (e: Event): void => {
    // A click the keyboard raises is no pointer's: it passes.
    if (closing === null || ((e.type === 'click' || e.type === 'auxclick') && (e as MouseEvent).detail === 0)) return
    e.stopPropagation()
    if (e.cancelable) e.preventDefault()
    // The click ends a mouse's press, the lifted finger a touch's.
    if (e.type === 'click' || e.type === 'auxclick' || e.type === 'touchend' || e.type === 'touchcancel') closing = null
  }
  const AFTER_PRESS = ['click', 'auxclick', 'contextmenu', 'touchstart', 'touchend', 'touchcancel'] as const
  const capturing = { capture: true, passive: false }
  view.addEventListener('pointerdown', onPressOff, capturing)
  view.addEventListener('pointerup', onReleaseOff, capturing)
  view.addEventListener('pointercancel', onReleaseOff, capturing)
  for (const type of AFTER_PRESS) view.addEventListener(type, onAfterPressOff, capturing)

  container.append(backdrop, box)

  const separator = (): HTMLDivElement => {
    const sep = document.createElement('div')
    sep.className = 'qc-separator'
    return sep
  }

  /** One row, built the same way whichever list it came from, so a contributed row is
   *  indistinguishable from a built-in one at the glass. */
  const rowButton = (row: { label: string; shortcut?: string; checked?: boolean; icon?: ChartMenuIcon | ChartExtensionIcon; glyph?: Element | null; disabled?: boolean }, act: (event: MouseEvent) => void, closes = true): HTMLButtonElement => {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'qc-menu-row'

    // Every row reserves the glyph cell, so labels line up whether or not one is drawn.
    const cell = document.createElement('span')
    cell.className = 'qc-menu-icon'
    // The CHECKED state owns the cell wherever it applies, so a switch reads the same whoever
    // contributed it. Otherwise a built-in row names one of the chart's own glyphs, or brings one
    // already drawn, either wearing the host's drawing for its icon when there is one, and a
    // contributed row brings its own drawing; all reach the glass as elements, never markup. A name
    // the map does not know and a drawing the builder refuses both leave the cell empty, which is
    // what a row with no glyph looks like.
    const own = row.checked ? 'check' : typeof row.icon === 'string' ? row.icon : null
    const drawn = own ? (icons.host(MENU_ICON_IDS[own], { width: 28, height: 28 }) ?? buildGlyph(ICONS[own])) : (row.glyph ?? buildGlyph(row.icon as ChartExtensionIcon | undefined))
    if (drawn) cell.append(drawn)

    const label = document.createElement('span')
    label.className = 'qc-menu-label'
    label.textContent = row.label

    b.append(cell, label)
    if (row.shortcut) {
      const sc = document.createElement('span')
      sc.className = 'qc-menu-hint'
      sc.textContent = row.shortcut
      b.append(sc)
    }
    b.disabled = row.disabled === true
    b.addEventListener('click', (event) => {
      if (closes) close()
      act(event)
    })
    return b
  }

  /** A contributed row in the shared row shape, carrying its own action along. */
  type Placed = { kind: 'item'; extra: ContextMenuExtraRow }
  const fill = (ctx: ChartMenuContext, extra: readonly ContextMenuExtraRow[]): void => {
    box.replaceChildren()
    // Contributed rows take their own group in the slot their kind names: level actions under the
    // clipboard, view switches under the removes. The chart's own groups keep their measured
    // order and position, and a host cannot displace them by contributing.
    const level: Placed[] = extra.filter((row) => row.group !== 'view').map((row) => ({ kind: 'item', extra: row }))
    const view: Placed[] = extra.filter((row) => row.group === 'view').map((row) => ({ kind: 'item', extra: row }))
    const groups: (ChartMenuRow | Placed)[][] = []
    for (const group of chartContextMenuGroups({ ...ctx, t: ctx.t ?? strings.t })) {
      groups.push(group.rows.filter((row) => row.kind !== 'item' || shown(row.id)))
      if (group.slot === 'clipboard') groups.push(level)
      if (group.slot === 'remove') groups.push(view)
    }
    for (const row of flattenMenuGroups(groups as ChartMenuRow[][]) as (ChartMenuRow | Placed)[]) {
      if (row.kind === 'separator') {
        box.append(separator())
        continue
      }
      if ('extra' in row) {
        const placed = row.extra
        box.append(rowButton(placed, () => placed.run()))
        continue
      }
      const id = row.id
      box.append(rowButton(row, () => run(id)))
    }
  }

  /** The price menu's rows: each group in its order, a rule between groups, an empty group none. */
  const fillPrice = (groups: readonly (readonly PriceMenuRow[])[]): void => {
    box.replaceChildren()
    for (const group of groups.filter((rows) => rows.length > 0)) {
      if (box.childElementCount > 0) box.append(separator())
      for (const row of group) box.append(rowButton(row, () => row.run()))
    }
  }

  /** Stand a flyout beside the scale menu, away from the scale, its top on the row's and inside the
   *  viewport, on the other side of the menu where the room runs out. */
  const openFlyout = (row: HTMLButtonElement, groups: readonly (readonly ScaleMenuRow[])[], focus: boolean): void => {
    if (flyoutRow !== row) {
      closeFlyout()
      flyoutRow = row
      markFlyout(row, true)
      fillScale(flyout, groups)
      box.after(flyout)
      flyout.style.left = '0px'
      flyout.style.top = '0px'
      const { width, height } = flyout.getBoundingClientRect()
      const menuBox = box.getBoundingClientRect()
      const before = menuBox.left - width
      const after = menuBox.right
      const left = scaleSide === 'right' ? (before >= 0 ? before : after) : after + width <= window.innerWidth ? after : before
      flyout.style.left = `${left}px`
      flyout.style.top = `${Math.max(0, Math.min(row.getBoundingClientRect().top, window.innerHeight - height))}px`
    }
    if (focus) flyout.querySelector<HTMLButtonElement>('.qc-menu-row:not([disabled])')?.focus()
  }

  /** The scale menu's rows in a box: each group in its order and a rule between groups. On the menu
   *  itself the pointer opens a row's flyout by resting on it and closes it by leaving for another
   *  row; a finger opens it with a press. */
  const fillScale = (into: HTMLElement, groups: readonly (readonly ScaleMenuRow[])[]): void => {
    into.replaceChildren()
    for (const group of groups.filter((rows) => rows.length > 0)) {
      if (into.childElementCount > 0) into.append(separator())
      for (const row of group) {
        const held = row.rows
        const button: HTMLButtonElement = rowButton(row, (event) => (held ? openFlyout(button, held, event.detail === 0) : row.run?.()), held === undefined)
        if (held) {
          button.ariaHasPopup = 'menu'
          markFlyout(button, false)
          button.append(icons.glyph(GLYPHS.menuFlyoutArrow, { size: 10, height: 10, className: 'qc-menu-flyout-arrow' }))
        }
        if (into === box) {
          button.addEventListener('pointerenter', (event) => {
            if (event.pointerType === 'touch') return
            if (held) openFlyout(button, held, false)
            else closeFlyout()
          })
        }
        into.append(button)
      }
    }
  }

  // A language switch under an OPEN menu rebuilds its rows where they stand: the labels were
  // resolved when it was raised, so nothing else would replace them until the next right-click.
  const rebuild = (): void => {
    if (openCtx) fill(openCtx, openExtra)
    else if (openPriceRows) fillPrice(openPriceRows())
    else if (openScaleRows) {
      closeFlyout()
      fillScale(box, openScaleRows())
    }
  }
  const unsubscribe = strings.onChange(rebuild)

  return {
    openPrice(at, rows, focus) {
      closeScale()
      openCtx = null
      openExtra = []
      openPriceRows = rows
      box.classList.add('qc-price-menu')
      fillPrice(rows())
      backdrop.hidden = true
      box.hidden = false
      box.style.left = '0px'
      box.style.top = '0px'
      // As wide as its widest row, its end on the plus's end on the scale's side and its top on the
      // plus's foot; above the plus where the room below cannot hold it, and inside the viewport.
      const { width, height } = box.getBoundingClientRect()
      const margin = 8
      let left = at.side === 'right' ? at.right - width : at.left
      let top = at.bottom
      if (top + height > window.innerHeight - margin && at.top - height >= margin) top = at.top - height
      left = Math.max(margin, Math.min(left, window.innerWidth - width - margin))
      top = Math.max(margin, Math.min(top, window.innerHeight - height - margin))
      box.style.left = `${left}px`
      box.style.top = `${top}px`
      if (focus) box.querySelector<HTMLButtonElement>('.qc-menu-row')?.focus()
    },
    openScale(at, rows, focus, expanded) {
      close()
      openScaleRows = rows
      scaleExpanded = expanded
      scaleSide = at.side
      box.classList.add('qc-price-menu')
      fillScale(box, rows())
      box.hidden = false
      box.style.left = '0px'
      box.style.top = '0px'
      const { width, height } = box.getBoundingClientRect()
      const margin = 8
      const left = at.side === 'right' ? at.right - width : at.left
      box.style.left = `${Math.max(margin, Math.min(left, window.innerWidth - width))}px`
      box.style.top = `${Math.max(margin, at.top - height)}px`
      expanded(true)
      if (focus) box.querySelector<HTMLButtonElement>('.qc-menu-row:not([disabled])')?.focus()
    },
    open(at, ctx, extra = []) {
      closeScale()
      openPriceRows = null
      box.classList.remove('qc-price-menu')
      openCtx = ctx
      openExtra = extra
      fill(ctx, extra)

      // Clamp into the viewport: a chart at the window's edge would otherwise raise a menu that
      // runs off it. Measured after filling, because the height depends on which rows survived.
      backdrop.hidden = false
      box.hidden = false
      box.style.left = '0px'
      box.style.top = '0px'
      const h = box.getBoundingClientRect().height
      box.style.left = `${Math.max(8, Math.min(at.clientX, window.innerWidth - MENU_W - 8))}px`
      box.style.top = `${Math.max(8, Math.min(at.clientY, window.innerHeight - h - 8))}px`
    },
    close,
    refresh: rebuild,
    destroy() {
      unsubscribe()
      window.removeEventListener('keydown', onKey)
      view.removeEventListener('pointerdown', onPressOff, capturing)
      view.removeEventListener('pointerup', onReleaseOff, capturing)
      view.removeEventListener('pointercancel', onReleaseOff, capturing)
      for (const type of AFTER_PRESS) view.removeEventListener(type, onAfterPressOff, capturing)
      backdrop.remove()
      box.remove()
      flyout.remove()
    },
  }
}

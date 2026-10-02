// The level menu the chart raises on right-click — the rows come from `chartContextMenu`, this is
// the painter. Same chrome discipline as the drawing toolbar, the legend and the chrome surfaces: package-owned vanilla DOM
// mounted into the chrome subtree, opting back into pointer events so the drag layers cannot steal
// its presses, and painted entirely through `.qc-*` recipes. The only inline writes are the
// clamped position, which is calculated at the moment the menu opens.
//
// The geometry: a 327px box of 32px rows, the glyph 8px in at its own 28 grid with the label at 40,
// and 1px separators between groups. Those numbers live in the `.qc-menu*` recipes; the one below is
// the width the viewport clamp needs as a number, because a clamp is arithmetic rather than a rule.
import { chartContextMenuGroups, flattenMenuGroups, type ChartMenuAction, type ChartMenuContext, type ChartMenuIcon, type ChartMenuRow } from './contextMenu'
import type { ChartExtensionIcon } from './extension'
import { createChartI18n, readingDirection, type ChartI18n } from './i18n'
import { buildGlyph } from './ui/chrome/vector'
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

/** The measured box width, which the viewport clamp needs as a number. */
const MENU_W = 327

/** The menu's own glyphs, as DESCRIPTORS on the same 28 grid a contributed one is drawn on, and
 *  inline so the package ships no asset dependency. They ride the one builder every glyph in this
 *  menu rides, which is what keeps the chart's rows and a host's rows a single icon contract rather
 *  than two that can drift apart. */
const ICONS: Record<ChartMenuIcon, ChartExtensionIcon> = {
  reset: {
    paths: [
      { d: 'M6.5 15A8.5 8.5 0 1 0 15 6.5H8.5', paint: 'outline' },
      { d: 'M12 10L8.5 6.5 12 3', paint: 'outline' },
    ],
  },
  settings: {
    paths: [
      { d: 'M18 14a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm-1 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z', rule: 'evenodd' },
      { d: 'M8.5 5h11l5 9-5 9h-11l-5-9 5-9Zm-3.86 9L9.1 6h9.82l4.45 8-4.45 8H9.1l-4.45-8Z', rule: 'evenodd' },
    ],
  },
  check: { paths: [{ d: 'M22 9.06 11 20 6 14.7l1.09-1.02 3.94 4.16L20.94 8 22 9.06Z' }] },
}

/** The icon each of the menu's own glyphs draws, so a host's drawing for it stands here as it stands
 *  in every other control that means the same. */
const MENU_ICON_IDS = { reset: 'reset', settings: 'settings', check: 'check' } as const satisfies Record<ChartMenuIcon, ChartIconId>

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
export function mountMenu(container: HTMLElement, run: (id: ChartMenuAction) => void, strings: ChartI18n, icons: IconResolver, shown: (id: ChartMenuAction) => boolean = () => true): ContextMenuHandle & { refresh(): void } {
  // A full-viewport backdrop closes the menu on any press elsewhere, and swallows the browser's own
  // menu so a second right-click re-aims ours rather than stacking the native one on top.
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

  const close = (): void => {
    box.hidden = true
    backdrop.hidden = true
    box.replaceChildren()
    openCtx = null
    openExtra = []
  }
  backdrop.addEventListener('pointerdown', close)
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && !box.hidden) close()
  }
  window.addEventListener('keydown', onKey)

  container.append(backdrop, box)

  const separator = (): HTMLDivElement => {
    const sep = document.createElement('div')
    sep.className = 'qc-separator'
    return sep
  }

  /** One row, built the same way whichever list it came from — so a contributed row is
   *  indistinguishable from a built-in one at the glass. */
  const rowButton = (row: { label: string; shortcut?: string; checked?: boolean; icon?: ChartMenuIcon | ChartExtensionIcon }, act: () => void): HTMLButtonElement => {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'qc-menu-row'

    // Every row reserves the glyph cell, so labels line up whether or not one is drawn.
    const cell = document.createElement('span')
    cell.className = 'qc-menu-icon'
    // The CHECKED state owns the cell wherever it applies, so a switch reads the same whoever
    // contributed it. Otherwise a built-in row names one of the chart's own glyphs, which wears the
    // host's drawing for its icon when there is one, and a contributed row brings its own drawing;
    // both reach the glass as elements, never markup. A name the map does not know and a drawing
    // the builder refuses both leave the cell empty, which is what a row with no glyph looks like.
    const own = row.checked ? 'check' : typeof row.icon === 'string' ? row.icon : null
    const drawn = own ? (icons.host(MENU_ICON_IDS[own], { width: 28, height: 28 }) ?? buildGlyph(ICONS[own])) : buildGlyph(row.icon as ChartExtensionIcon | undefined)
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
    b.addEventListener('click', () => {
      close()
      act()
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

  // A language switch under an OPEN menu rebuilds its rows where they stand: the labels were
  // resolved when it was raised, so nothing else would replace them until the next right-click.
  const unsubscribe = strings.onChange(() => {
    if (openCtx) fill(openCtx, openExtra)
  })

  return {
    open(at, ctx, extra = []) {
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
    refresh() {
      if (openCtx) fill(openCtx, openExtra)
    },
    destroy() {
      unsubscribe()
      window.removeEventListener('keydown', onKey)
      backdrop.remove()
      box.remove()
    },
  }
}

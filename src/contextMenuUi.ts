// The level menu the widget raises on right-click — the rows come from `chartContextMenu`, this is
// the painter. Same chrome discipline as the rail, legend and replay bar: tiny theme-tinted vanilla
// DOM, mounted into the overlay subtree and opting back into pointer events so the gesture layers
// cannot steal its presses.
//
// The geometry is the reference's, measured: a 327px box of 32px rows, the glyph 8px in at its own
// 28 grid with the label at 40, and 1px separators between the groups that survived.
import { chartContextMenu, type ChartMenuAction, type ChartMenuContext, type ChartMenuIcon } from './contextMenu'
import type { ResolvedTheme } from './host'
import { createChartI18n, type ChartI18n } from './i18n'

/** A row the HOST contributed for this raise (through the chart's extension seam). It carries its
 *  own action, so the painter routes nothing and a contributed row can never collide with a
 *  built-in id. Structural on purpose: the menu has no dependency on who contributed or why. */
export interface ContextMenuExtraRow {
  label: string
  shortcut?: string
  checked?: boolean
  run(): void
}

export interface ContextMenuHandle {
  /** Raise the menu at a viewport point, for the level the caller resolved. `extra` appends one
   *  group of contributed rows below the built-ins; an empty list adds no separator. */
  open(at: { clientX: number; clientY: number }, ctx: ChartMenuContext, extra?: readonly ContextMenuExtraRow[]): void
  close(): void
  destroy(): void
}

const MENU_W = 327
const ROW_H = 32

/** The reference's own glyphs, inline so the package ships no asset dependency. */
const ICONS: Record<ChartMenuIcon, string> = {
  reset: '<g fill="none" fill-rule="evenodd" stroke="currentColor"><path d="M6.5 15A8.5 8.5 0 1 0 15 6.5H8.5"/><path d="M12 10L8.5 6.5 12 3"/></g>',
  settings:
    '<path fill="currentColor" fill-rule="evenodd" d="M18 14a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm-1 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/><path fill="currentColor" fill-rule="evenodd" d="M8.5 5h11l5 9-5 9h-11l-5-9 5-9Zm-3.86 9L9.1 6h9.82l4.45 8-4.45 8H9.1l-4.45-8Z"/>',
  check: '<path fill="currentColor" d="M22 9.06 11 20 6 14.7l1.09-1.02 3.94 4.16L20.94 8 22 9.06Z"/>',
}

const svg = (icon: ChartMenuIcon): string =>
  `<svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">${ICONS[icon]}</svg>`

/** `strings` is the widget's language: the rows are built through it every time the menu is raised,
 *  and an open menu re-labels in place if the language changes under it. */
export function mountContextMenu(
  container: HTMLElement,
  run: (id: ChartMenuAction) => void,
  theme: ResolvedTheme,
  strings: ChartI18n = createChartI18n(),
): ContextMenuHandle {
  // A full-viewport backdrop closes the menu on any press elsewhere, and swallows the browser's own
  // menu so a second right-click re-aims ours rather than stacking the native one on top.
  const backdrop = document.createElement('div')
  backdrop.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:none;'
  backdrop.addEventListener('contextmenu', (e) => e.preventDefault())

  const box = document.createElement('div')
  box.style.cssText =
    // overflow:hidden is load-bearing — a row's highlight fills its slot squarely, so the surface
    // is what rounds it off; without the clip it paints over the corners and out across the border.
    // The 6px is the reference's own, measured off its live menu, and pairs with the 6px a
    // separator carries on each side.
    `position:fixed;z-index:2147483001;display:none;width:${MENU_W}px;overflow:hidden;padding:6px 0;` +
    `background:${theme.background};border:1px solid ${theme.gridColor};border-radius:6px;` +
    `color:${theme.textColor};font-size:13px;pointer-events:auto;box-shadow:0 8px 24px rgba(0,0,0,.45);`
  box.addEventListener('contextmenu', (e) => e.preventDefault())
  for (const type of ['pointerdown', 'pointerup', 'pointermove'] as const) box.addEventListener(type, (e) => e.stopPropagation())

  /** The level the open menu is showing rows for — kept so the rows can be rebuilt in place. */
  let openCtx: ChartMenuContext | null = null
  /** The contributed rows this raise was given, kept for the same rebuild. */
  let openExtra: readonly ContextMenuExtraRow[] = []

  const close = (): void => {
    box.style.display = 'none'
    backdrop.style.display = 'none'
    box.replaceChildren()
    openCtx = null
    openExtra = []
  }
  backdrop.addEventListener('pointerdown', close)
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && box.style.display !== 'none') close()
  }
  window.addEventListener('keydown', onKey)

  container.append(backdrop, box)

  const separator = (): HTMLDivElement => {
    const sep = document.createElement('div')
    sep.style.cssText = `height:1px;margin:6px 0;background:${theme.gridColor};`
    return sep
  }

  /** One row, built the same way whichever list it came from — so a contributed row is
   *  indistinguishable from a built-in one at the glass. */
  const rowButton = (row: { label: string; shortcut?: string; checked?: boolean; icon?: ChartMenuIcon }, act: () => void): HTMLButtonElement => {
    const b = document.createElement('button')
    b.type = 'button'
    b.style.cssText =
      `display:flex;align-items:center;gap:6px;width:100%;height:${ROW_H}px;padding:0 20px 0 0;` +
      `background:none;border:0;color:${theme.textColor};font:inherit;text-align:left;cursor:pointer;`
    b.addEventListener('mouseenter', () => (b.style.background = theme.gridColor))
    b.addEventListener('mouseleave', () => (b.style.background = 'none'))

    // Every row reserves the glyph cell, so labels line up whether or not one is drawn.
    const cell = document.createElement('span')
    cell.style.cssText = 'display:flex;width:36px;flex:0 0 36px;align-items:center;justify-content:center;'
    const glyph = row.checked ? 'check' : row.icon
    if (glyph) cell.innerHTML = svg(glyph)

    const label = document.createElement('span')
    label.textContent = row.label
    label.style.cssText = 'flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'

    b.append(cell, label)
    if (row.shortcut) {
      const sc = document.createElement('span')
      sc.textContent = row.shortcut
      sc.style.cssText = `flex:0 0 auto;padding-left:10px;padding-top:2px;font-size:11px;opacity:.55;`
      b.append(sc)
    }
    b.addEventListener('click', () => {
      close()
      act()
    })
    return b
  }

  const fill = (ctx: ChartMenuContext, extra: readonly ContextMenuExtraRow[]): void => {
    box.replaceChildren()
    for (const row of chartContextMenu({ ...ctx, t: ctx.t ?? strings.t })) {
      if (row.kind === 'separator') {
        box.append(separator())
        continue
      }
      const id = row.id
      box.append(rowButton(row, () => run(id)))
    }
    // Contributed rows come LAST, as their own group: the chart's own actions keep their measured
    // order and position, and a host cannot displace them by contributing.
    if (extra.length === 0) return
    if (box.childElementCount > 0) box.append(separator())
    for (const row of extra) box.append(rowButton(row, () => row.run()))
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
      backdrop.style.display = 'block'
      box.style.display = 'block'
      box.style.left = '0px'
      box.style.top = '0px'
      const h = box.getBoundingClientRect().height
      box.style.left = `${Math.max(8, Math.min(at.clientX, window.innerWidth - MENU_W - 8))}px`
      box.style.top = `${Math.max(8, Math.min(at.clientY, window.innerHeight - h - 8))}px`
    },
    close,
    destroy() {
      unsubscribe()
      window.removeEventListener('keydown', onKey)
      backdrop.remove()
      box.remove()
    },
  }
}

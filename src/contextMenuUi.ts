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

export interface ContextMenuHandle {
  /** Raise the menu at a viewport point, for the level the caller resolved. */
  open(at: { clientX: number; clientY: number }, ctx: ChartMenuContext): void
  close(): void
  destroy(): void
}

const MENU_W = 327
const ROW_H = 32

/** The reference's own glyphs, inline so the package ships no asset dependency. */
const ICONS: Record<ChartMenuIcon, string> = {
  reset: '<g fill="none" fill-rule="evenodd" stroke="currentColor"><path d="M6.5 15A8.5 8.5 0 1 0 15 6.5H8.5"/><path d="M12 10L8.5 6.5 12 3"/></g>',
  alert:
    '<path fill="currentColor" d="m19.54 4.5 3.96 4.32-.74.68-3.96-4.32.74-.68ZM7.46 4.5 3.5 8.82l.74.68L8.2 5.18l-.74-.68ZM19.74 10.33A7.5 7.5 0 0 1 21 14.5v.5h1v-.5a8.5 8.5 0 1 0-8.5 8.5h.5v-1h-.5a7.5 7.5 0 1 1 6.24-11.67Z"/><path fill="currentColor" d="M13 9v5h-3v1h4V9h-1ZM19 20v-4h1v4h4v1h-4v4h-1v-4h-4v-1h4Z"/>',
  sell: '<path fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" d="M19.9792 12.2892C19.7396 12.0142 19.3241 11.9812 19.044 12.2149L14.3924 16.098L14.072 16.3655L13.7516 16.098L9.10009 12.2149C8.82008 11.9812 8.40456 12.0142 8.16495 12.2892C7.92467 12.565 7.94981 12.9825 8.22144 13.2275L14.0721 18.504L19.9227 13.2275C20.1943 12.9825 20.2195 12.565 19.9792 12.2892ZM18.4032 11.4472C19.1009 10.8648 20.1362 10.9471 20.7332 11.6323C21.3318 12.3195 21.2692 13.3597 20.5924 13.9701L14.407 19.5486L14.0721 19.8506L13.7373 19.5486L7.55171 13.9701C6.87492 13.3597 6.81229 12.3195 7.41096 11.6323C8.00796 10.9471 9.04326 10.8648 9.74094 11.4473L14.072 15.0628L18.4032 11.4472Z"/>',
  buy: '<path fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" d="M19.9792 16.6205C19.7396 16.8955 19.3241 16.9285 19.044 16.6948L14.3924 12.8117L14.072 12.5442L13.7516 12.8117L9.10009 16.6947C8.82008 16.9285 8.40456 16.8955 8.16495 16.6205C7.92467 16.3447 7.94981 15.9272 8.22144 15.6822L14.0721 10.4057L19.9227 15.6822C20.1943 15.9272 20.2195 16.3447 19.9792 16.6205ZM18.4032 17.4624C19.1009 18.0448 20.1362 17.9626 20.7332 17.2774C21.3318 16.5902 21.2692 15.55 20.5924 14.9396L14.407 9.36109L14.0721 9.05908L13.7373 9.36109L7.55171 14.9396C6.87492 15.55 6.81229 16.5902 7.41096 17.2774C8.00796 17.9626 9.04326 18.0448 9.74094 17.4624L14.072 13.8468L18.4032 17.4624Z"/>',
  order:
    '<path fill="currentColor" d="M22 6H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h10v1H6a2 2 0 0 1-2-2V7c0-1.1.9-2 2-2h16a2 2 0 0 1 2 2v8h-1V7a1 1 0 0 0-1-1m-6 6.77-3.41-2.48-.6.81 4 2.9 4-2.9-.58-.8zm-4 2.47L8.59 17.7l-.6-.8L12 14 16 16.9l-.59.81zM21 17v3h-3v1h3v3h1v-3h3v-1h-3v-3z"/>',
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

  const close = (): void => {
    box.style.display = 'none'
    backdrop.style.display = 'none'
    box.replaceChildren()
    openCtx = null
  }
  backdrop.addEventListener('pointerdown', close)
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && box.style.display !== 'none') close()
  }
  window.addEventListener('keydown', onKey)

  container.append(backdrop, box)

  const fill = (ctx: ChartMenuContext): void => {
    box.replaceChildren()
    for (const row of chartContextMenu({ ...ctx, t: ctx.t ?? strings.t })) {
      if (row.kind === 'separator') {
        const sep = document.createElement('div')
        sep.style.cssText = `height:1px;margin:6px 0;background:${theme.gridColor};`
        box.append(sep)
        continue
      }
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
      const id = row.id
      b.addEventListener('click', () => {
        close()
        run(id)
      })
      box.append(b)
    }
  }

  // A language switch under an OPEN menu rebuilds its rows where they stand: the labels were
  // resolved when it was raised, so nothing else would replace them until the next right-click.
  const unsubscribe = strings.onChange(() => {
    if (openCtx) fill(openCtx)
  })

  return {
    open(at, ctx) {
      openCtx = ctx
      fill(ctx)

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

// The layout setup menu: a button wearing the active arrangement's glyph, opening the thirteen-row
// grid of the 55 arrangements (rows labeled by chart count, radio semantics) over the five sync
// switches. It edits a code and five flags through the widget's layout commands; the layout owns
// what they do. Where the host offers fewer, the grid shows the offered arrangements alone, a row
// with none of them is not drawn, a single arrangement leaves the grid out, and only the offered
// switches are drawn, under no heading when there are none.
import { arrangementName } from '../../i18n'
import type { ChartMessageKey } from '../../i18n'
import { arrangementOf, LAYOUT_MENU_ROWS } from '../../layoutGrid'
import type { LayoutModelState, LayoutSyncFlags } from '../../widget/layout'
import { shows, type ChromeContext } from './context'
import { FLYOUT_WIDTH } from './flyoutGeometry'
import { switchRow } from './dialog'
import { button, h, name, setDisabled } from './dom'
import { ICONS } from '../controls/icons'
import { openMenu, menuHeading, toggleMenu, type MenuHandle } from './menu'
import { arrangementGlyphOf, iconOf } from '../icons/catalog'
import type { IconResolver } from '../icons/resolver'

/** One arrangement glyph at its native 21 by 19: the host's drawing for the arrangement when there
 *  is one, else the chart's own. A mirror matrix on the chart's body is hoisted onto the element,
 *  where CSS gives the flip a center origin; the same matrix on an inner group would run in user
 *  space and throw the art outside the view box. */
export function arrangementGlyph(code: string, icons: IconResolver): HTMLElement {
  const span = h('span', { class: 'qc-icon qc-arrangement', 'aria-hidden': 'true' })
  // A code the catalog does not carry draws nothing, for the host and for the chart alike.
  const icon = arrangementGlyphOf(code)
  const id = icon && iconOf(icon)
  if (!icon || !id) return span
  const hosted = icons.host(id, { width: 21, height: 19 })
  if (hosted) {
    span.append(hosted)
    return span
  }
  const mirrored = /^<g transform="(matrix\([^"]+\))">([\s\S]*)<\/g>$/.exec(icon.body)
  span.innerHTML = `<svg viewBox="${icon.viewBox}" width="21" height="19" aria-hidden="true"${mirrored ? ` style="transform: ${mirrored[1]}"` : ''}>${mirrored ? mirrored[2] : icon.body}</svg>`
  return span
}

/** The five sync rows: the flag, the row's word, its tooltip, and the switch's own name. */
const SYNC_ROWS: readonly { key: keyof LayoutSyncFlags; label: ChartMessageKey; tip: ChartMessageKey; toggle: ChartMessageKey }[] = [
  { key: 'symbol', label: 'layouts.syncSymbol', tip: 'layouts.syncSymbolTip', toggle: 'layouts.syncSymbolToggle' },
  { key: 'timeframe', label: 'layouts.syncTimeframe', tip: 'layouts.syncTimeframeTip', toggle: 'layouts.syncTimeframeToggle' },
  { key: 'crosshair', label: 'layouts.syncCrosshair', tip: 'layouts.syncCrosshairTip', toggle: 'layouts.syncCrosshairToggle' },
  { key: 'time', label: 'layouts.syncTime', tip: 'layouts.syncTimeTip', toggle: 'layouts.syncTimeToggle' },
  { key: 'dateRange', label: 'layouts.syncDateRange', tip: 'layouts.syncDateRangeTip', toggle: 'layouts.syncDateRangeToggle' },
]

/** The menu's rows for what the widget offers: each row keeps its catalog codes the widget offers,
 *  in catalog order, and a row left with none is not drawn. */
export function offeredRows(offered: readonly string[]): readonly { label: string; codes: readonly string[] }[] {
  return LAYOUT_MENU_ROWS.map((row) => ({ label: row.label, codes: row.codes.filter((code) => offered.includes(code)) })).filter((row) => row.codes.length > 0)
}

export interface LayoutSetupHandle {
  element: HTMLButtonElement
  sync(state?: LayoutModelState): void
  destroy(): void
}

export function mountLayoutSetup(deps: ChromeContext): LayoutSetupHandle {
  const t = (): ChromeContext['i18n']['t'] => deps.i18n.t
  let menu: MenuHandle | null = null
  /** The open menu's tiles and switches, and the language they were written in. A change to the
   *  layout is written onto these in place: a rebuild would swap the switch just pressed for a new
   *  one already at its end, and the knob would jump rather than slide. */
  let live: { tag: string; parts: string; tiles: HTMLButtonElement[]; switches: { key: keyof LayoutSyncFlags; control: HTMLButtonElement }[] } | null = null
  /** Which of the menu's two parts it draws: the grid, with more than one arrangement to choose,
   *  and the switches, with a switch to change. A host that hides what its policy refuses leaves out
   *  a part whose command the policy refuses. */
  const parts = (): { grid: boolean; switches: boolean } => ({
    grid: deps.layouts.arrangements.length > 1 && shows(deps, 'widget.layout.setArrangement'),
    switches: deps.layouts.sync.length > 0 && shows(deps, 'widget.layout.setSync'),
  })
  const partsKey = (): string => {
    const drawn = parts()
    return `${drawn.grid}|${drawn.switches}`
  }
  let projected = { arrangement: deps.widget.layout.arrangement(), sync: deps.widget.layout.sync() }
  const trigger = button({ label: t()('layouts.setup'), className: 'qc-toolbar-button qc-layout-trigger', onClick: () => toggleMenu(trigger, open) })
  trigger.appendChild(arrangementGlyph(deps.widget.layout.arrangement(), deps.icons))
  trigger.setAttribute('aria-haspopup', 'menu')
  trigger.setAttribute('aria-expanded', 'false')
  const numbers = (): Intl.NumberFormat => new Intl.NumberFormat(deps.i18n.tag())

  const open = (): void => {
    menu = openMenu({
      host: deps.overlays,
      anchor: trigger,
      label: t()('layouts.setup'),
      role: 'dialog',
      className: 'qc-layout-menu',
      width: FLYOUT_WIDTH.arrangement,
      build(body, handle) {
        const current = projected.arrangement
        const built: NonNullable<typeof live> = { tag: deps.i18n.tag(), parts: partsKey(), tiles: [], switches: [] }
        const drawn = parts()
        const grid = h('div', { class: 'qc-layout-grid', role: 'radiogroup', 'aria-label': t()('layouts.arrangement') })
        const rows = offeredRows(deps.layouts.arrangements)
        rows.forEach((row, ri) => {
          const line = h('div', { class: 'qc-layout-row' }, h('span', { class: 'qc-layout-count qc-muted' }, numbers().format(Number(row.label))))
          const tiles = h('span', { class: 'qc-layout-tiles' })
          for (const code of row.codes) {
            const tile = h('button', { type: 'button', class: 'qc-button qc-layout-tile', role: 'radio', 'aria-checked': String(code === current), 'aria-label': arrangementName(t(), code, arrangementOf(code)?.label ?? code), 'data-qc-item': '', tabindex: '-1', 'data-arrangement': code })
            tile.appendChild(arrangementGlyph(code, deps.icons))
            if (!deps.commands.available('widget.layout.setArrangement')) {
              tile.disabled = true
              tile.setAttribute('aria-disabled', 'true')
            }
            tile.addEventListener('click', () => {
              handle.close()
              deps.commands.execute('widget.layout.setArrangement', code)
            })
            tiles.appendChild(tile)
            built.tiles.push(tile)
          }
          line.appendChild(tiles)
          grid.appendChild(line)
          if (ri < rows.length - 1) grid.appendChild(h('div', { class: 'qc-separator', role: 'separator' }))
        })
        // One offered arrangement is nothing to choose, so the grid is left out and the menu holds
        // the switches alone.
        if (drawn.grid) body.appendChild(grid)
        const syncRows = drawn.switches ? SYNC_ROWS.filter((row) => deps.layouts.sync.includes(row.key)) : []
        if (syncRows.length > 0) body.appendChild(menuHeading(t()('layouts.syncInLayout')))
        const flags = projected.sync
        const syncAvailable = deps.commands.available('widget.layout.setSync')
        for (const row of syncRows) {
          const switchLine = switchRow({
            label: t()(row.label),
            hint: t()(row.tip),
            checked: flags[row.key],
            disabled: !syncAvailable,
            onChange: (on) => deps.commands.execute('widget.layout.setSync', { [row.key]: on }),
          })
          switchLine.querySelector('.qc-switch-label')?.after(deps.icons.glyph(ICONS.info, { size: 18, className: 'qc-layout-info' }))
          body.appendChild(switchLine)
          const control = switchLine.querySelector<HTMLButtonElement>('[role="switch"]')
          control?.setAttribute('aria-label', t()(row.toggle))
          if (control) built.switches.push({ key: row.key, control })
        }
        live = built
      },
      onClose: () => {
        menu = null
        live = null
      },
    })
  }

  const sync = (state?: LayoutModelState): void => {
    projected = state ? { arrangement: state.arrangement, sync: { ...state.sync } } : { arrangement: deps.widget.layout.arrangement(), sync: deps.widget.layout.sync() }
    const code = projected.arrangement
    trigger.querySelector('.qc-arrangement')?.replaceWith(arrangementGlyph(code, deps.icons))
    name(trigger, `${t()('layouts.setup')}: ${arrangementName(t(), code, arrangementOf(code)?.label ?? code)}`)
    const drawn = parts()
    trigger.hidden = !drawn.grid && !drawn.switches
    if (trigger.hidden) menu?.close()
    if (live && live.tag === deps.i18n.tag() && live.parts === partsKey()) {
      const arrangeable = deps.commands.available('widget.layout.setArrangement')
      for (const tile of live.tiles) {
        tile.setAttribute('aria-checked', String(tile.dataset.arrangement === code))
        setDisabled(tile, !arrangeable)
      }
      const syncAvailable = deps.commands.available('widget.layout.setSync')
      for (const { key, control } of live.switches) {
        control.setAttribute('aria-checked', String(projected.sync[key]))
        setDisabled(control, !syncAvailable)
      }
      return
    }
    // A new language rewrites every word, and a policy that moved changes which parts are drawn, so
    // the menu is built again, keeping the reader's place.
    const controls = menu ? [...menu.element.querySelectorAll<HTMLElement>('[data-qc-item], [role="switch"]')] : []
    const focused = menu?.element.contains(document.activeElement) ? controls.indexOf(document.activeElement as HTMLElement) : -1
    const scrollBody = menu?.element.querySelector<HTMLElement>('.qc-menu-body')
    const scrollTop = scrollBody?.scrollTop ?? 0
    const scrollLeft = scrollBody?.scrollLeft ?? 0
    menu?.refresh()
    const body = menu?.element.querySelector<HTMLElement>('.qc-menu-body')
    if (focused >= 0 && (document.activeElement === document.body || document.activeElement === null)) {
      menu?.element.querySelectorAll<HTMLElement>('[data-qc-item], [role="switch"]')[focused]?.focus({ preventScroll: true })
    }
    if (body) {
      body.scrollTop = scrollTop
      body.scrollLeft = scrollLeft
    }
  }
  sync()
  return {
    element: trigger,
    sync,
    destroy() {
      menu?.close()
      trigger.remove()
    },
  }
}

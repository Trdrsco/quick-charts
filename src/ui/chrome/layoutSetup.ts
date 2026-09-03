// The layout setup menu: a button wearing the active arrangement's glyph, opening the thirteen-row
// grid of the 55 arrangements (rows labeled by chart count, radio semantics) over the five sync
// switches. It edits a code and five flags through the widget's layout commands; the layout owns
// what they do.
import { arrangementName } from '../../i18n'
import type { ChartMessageKey } from '../../i18n'
import { arrangementOf, LAYOUT_MENU_ROWS } from '../../layoutGrid'
import type { LayoutSyncFlags } from '../../widget/layout'
import { ARRANGEMENT_ICONS } from './arrangementGlyphs'
import type { ChromeContext } from './context'
import { switchRow } from './dialog'
import { button, h, name } from './dom'
import { openMenu, menuHeading, type MenuHandle } from './menu'

/** One arrangement glyph at its native 21 by 19. A mirror matrix on the body is hoisted onto the
 *  element, where CSS gives the flip a center origin; the same matrix on an inner group would run
 *  in user space and throw the art outside the view box. */
export function arrangementGlyph(code: string): HTMLElement {
  const icon = ARRANGEMENT_ICONS[code]
  const span = h('span', { class: 'qc-icon qc-arrangement', 'aria-hidden': 'true' })
  if (!icon) return span
  const mirrored = /^<g transform="(matrix\([^"]+\))">([\s\S]*)<\/g>$/.exec(icon.body)
  span.innerHTML = `<svg viewBox="${icon.viewBox}" width="21" height="19" aria-hidden="true"${mirrored ? ` style="transform: ${mirrored[1]}"` : ''}>${mirrored ? mirrored[2] : icon.body}</svg>`
  return span
}

/** The five sync rows: the flag, the row's word, its tooltip, and the switch's own name. */
const SYNC_ROWS: readonly { key: keyof LayoutSyncFlags; label: ChartMessageKey; tip: ChartMessageKey; toggle: ChartMessageKey }[] = [
  { key: 'symbol', label: 'layouts.syncSymbol', tip: 'layouts.syncSymbolTip', toggle: 'layouts.syncSymbolToggle' },
  { key: 'interval', label: 'layouts.syncInterval', tip: 'layouts.syncIntervalTip', toggle: 'layouts.syncIntervalToggle' },
  { key: 'crosshair', label: 'layouts.syncCrosshair', tip: 'layouts.syncCrosshairTip', toggle: 'layouts.syncCrosshairToggle' },
  { key: 'time', label: 'layouts.syncTime', tip: 'layouts.syncTimeTip', toggle: 'layouts.syncTimeToggle' },
  { key: 'dateRange', label: 'layouts.syncDateRange', tip: 'layouts.syncDateRangeTip', toggle: 'layouts.syncDateRangeToggle' },
]

export interface LayoutSetupHandle {
  element: HTMLButtonElement
  sync(): void
  destroy(): void
}

export function mountLayoutSetup(deps: ChromeContext): LayoutSetupHandle {
  const t = (): ChromeContext['i18n']['t'] => deps.i18n.t
  let menu: MenuHandle | null = null
  const trigger = button({ label: t()('layouts.setup'), className: 'qc-toolbar-button', onClick: () => open() })
  trigger.appendChild(arrangementGlyph(deps.widget.layout.arrangement()))
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
      width: 428,
      build(body, handle) {
        const current = deps.widget.layout.arrangement()
        const grid = h('div', { class: 'qc-layout-grid', role: 'radiogroup', 'aria-label': t()('layouts.arrangement') })
        LAYOUT_MENU_ROWS.forEach((row, ri) => {
          const line = h('div', { class: 'qc-layout-row' }, h('span', { class: 'qc-layout-count qc-muted' }, numbers().format(Number(row.label))))
          const tiles = h('span', { class: 'qc-layout-tiles' })
          for (const code of row.codes) {
            const tile = h('button', { type: 'button', class: 'qc-button qc-layout-tile', role: 'radio', 'aria-checked': String(code === current), 'aria-label': arrangementName(t(), code, arrangementOf(code)?.label ?? code), 'data-qc-item': '', tabindex: '-1', 'data-arrangement': code })
            tile.appendChild(arrangementGlyph(code))
            if (!deps.commands.available('widget.layout.setArrangement')) {
              tile.disabled = true
              tile.setAttribute('aria-disabled', 'true')
            }
            tile.addEventListener('click', () => {
              handle.close()
              deps.commands.execute('widget.layout.setArrangement', code)
            })
            tiles.appendChild(tile)
          }
          line.appendChild(tiles)
          grid.appendChild(line)
          if (ri < LAYOUT_MENU_ROWS.length - 1) grid.appendChild(h('div', { class: 'qc-separator', role: 'separator' }))
        })
        body.appendChild(grid)
        body.appendChild(menuHeading(t()('layouts.syncInLayout')))
        const flags = deps.widget.layout.sync()
        const syncAvailable = deps.commands.available('widget.layout.setSync')
        for (const row of SYNC_ROWS) {
          body.appendChild(
            switchRow({
              label: t()(row.label),
              hint: t()(row.tip),
              checked: flags[row.key],
              disabled: !syncAvailable,
              onChange: (on) => deps.commands.execute('widget.layout.setSync', { [row.key]: on }),
            }),
          )
          const control = body.lastElementChild?.querySelector('[role="switch"]')
          control?.setAttribute('aria-label', t()(row.toggle))
        }
      },
      onClose: () => {
        menu = null
      },
    })
  }

  const sync = (): void => {
    const code = deps.widget.layout.arrangement()
    trigger.querySelector('.qc-arrangement')?.replaceWith(arrangementGlyph(code))
    name(trigger, `${t()('layouts.setup')}: ${arrangementName(t(), code, arrangementOf(code)?.label ?? code)}`)
    menu?.refresh()
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

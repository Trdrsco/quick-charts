// The bottom bar: the nine range presets as chips, the live clock in the display zone, the
// timezone picker (UTC and the exchange choice pinned first, then every zone by offset), and the
// session-view picker, offered only for a symbol that trades outside regular hours. Every chip and
// row is a command, so a preset deeper than the feed's history is disabled rather than sent.
import { RANGE_PRESETS, rangePresetTip } from '../../ranges'
import { DEFAULT_SUBSESSION } from '../../sessionModel'
import { EXCHANGE_TIMEZONE, formatClock, timezoneListing, tzOffsetLabel } from '../../timezones'
import { activeChart, commandLabel, type ChromeContext } from './context'
import { button, h, name, replace, setDisabled, stopPointer } from './dom'
import { menuHeading, menuItem, openMenu, type MenuHandle } from './menu'

export interface BottomBarHandle {
  element: HTMLElement
  sync(): void
  destroy(): void
}

/** The command a timezone row runs: the exchange choice's own, or the zone's. */
export const timezoneCommand = (id: string): string => (id === EXCHANGE_TIMEZONE ? 'chart.timezone.exchange' : `chart.timezone.${id}`)

export function mountBottomBar(deps: ChromeContext): BottomBarHandle {
  const t = (): ChromeContext['i18n']['t'] => deps.i18n.t
  const element = h('div', { class: 'qc-bottombar', role: 'toolbar', 'aria-label': t()('chrome.bottomBar') })
  stopPointer(element)
  const ranges = h('div', { class: 'qc-ranges', role: 'group', 'aria-label': t()('command.rangeSet') })
  const clock = h('span', { class: 'qc-clock' })
  const offset = h('span', { class: 'qc-clock-offset' })
  const tzTrigger = button({ label: t()('timezone.title'), className: 'qc-toolbar-button qc-tz-trigger', onClick: () => openTimezones() })
  tzTrigger.append(clock, offset)
  tzTrigger.setAttribute('aria-haspopup', 'listbox')
  tzTrigger.setAttribute('aria-expanded', 'false')
  const sessionTrigger = button({ label: t()('chrome.session'), text: '', className: 'qc-toolbar-button qc-session-trigger', onClick: () => openSessions() })
  sessionTrigger.setAttribute('aria-haspopup', 'menu')
  sessionTrigger.setAttribute('aria-expanded', 'false')
  element.append(ranges, h('div', { class: 'qc-bottombar-end' }, tzTrigger, sessionTrigger))
  let tzMenu: MenuHandle | null = null
  let sessionMenu: MenuHandle | null = null

  const zone = (): string | null => activeChart(deps).displayTimezone()
  const tick = (): void => {
    const z = zone()
    clock.textContent = z ? formatClock(deps.i18n.tag(), z) : ''
    offset.textContent = z ? tzOffsetLabel(z) : '--'
  }
  const timer = setInterval(tick, 1000)

  const openTimezones = (): void => {
    const rows = timezoneListing(t(), { withExchange: true })
    const current = activeChart(deps).timezone()
    tzMenu = openMenu({
      host: deps.overlays,
      anchor: tzTrigger,
      label: t()('timezone.title'),
      role: 'listbox',
      className: 'qc-tz-menu',
      width: 240,
      align: 'end',
      placement: 'up',
      initialIndex: Math.max(0, rows.findIndex((r) => r.id === current)),
      build(body, handle) {
        const active = activeChart(deps).timezone()
        for (const row of rows) {
          const id = timezoneCommand(row.id)
          body.appendChild(
            menuItem({
              text: row.label,
              role: 'option',
              checked: row.id === active,
              disabled: row.id !== active && !deps.commands.available(id),
              onSelect: () => {
                handle.close()
                deps.commands.execute(id)
              },
            }),
          )
        }
      },
      onClose: () => {
        tzMenu = null
      },
    })
  }

  const openSessions = (): void => {
    sessionMenu = openMenu({
      host: deps.overlays,
      anchor: sessionTrigger,
      label: t()('chrome.session'),
      className: 'qc-session-menu',
      width: 200,
      align: 'end',
      placement: 'up',
      build(body, handle) {
        const active = activeChart(deps).subsession()
        body.appendChild(menuHeading(t()('chrome.sessionsHeading')))
        for (const option of [{ id: 'extended', command: 'chart.subsession.extended' }, { id: 'regular', command: 'chart.subsession.regular' }] as const) {
          body.appendChild(
            menuItem({
              text: commandLabel(deps, option.command),
              role: 'menuitemradio',
              checked: option.id === active,
              disabled: option.id !== active && !deps.commands.available(option.command),
              onSelect: () => {
                handle.close()
                deps.commands.execute(option.command)
              },
            }),
          )
        }
      },
      onClose: () => {
        sessionMenu = null
      },
    })
  }

  const sync = (): void => {
    const chart = activeChart(deps)
    replace(
      ranges,
      ...RANGE_PRESETS.map((preset) => {
        const id = `chart.range.${preset.key}`
        const chip = button({ label: rangePresetTip(t(), preset), text: preset.key, className: 'qc-toolbar-button qc-range-chip', onClick: () => deps.commands.execute(id) })
        setDisabled(chip, !deps.commands.available(id))
        return chip
      }),
    )
    ranges.setAttribute('aria-label', t()('command.rangeSet'))
    element.setAttribute('aria-label', t()('chrome.bottomBar'))
    name(tzTrigger, t()('timezone.title'))
    tick()
    const extended = chart.hasExtendedHours()
    sessionTrigger.hidden = !extended
    if (extended) {
      const sub = chart.subsession()
      const label = commandLabel(deps, sub === DEFAULT_SUBSESSION ? 'chart.subsession.extended' : 'chart.subsession.regular')
      name(sessionTrigger, `${t()('chrome.session')}: ${label}`)
      const text = sessionTrigger.querySelector('.qc-button-text')
      if (text) text.textContent = label
    }
    tzMenu?.refresh()
    sessionMenu?.refresh()
  }

  const offStrings = deps.i18n.onChange(sync)
  sync()
  return {
    element,
    sync,
    destroy() {
      clearInterval(timer)
      offStrings()
      tzMenu?.close()
      sessionMenu?.close()
      element.remove()
    },
  }
}

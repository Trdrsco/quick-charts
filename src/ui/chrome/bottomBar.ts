// The bottom bar: the range presets the widget offers as chips, the live clock in the display zone,
// the timezone picker (UTC and the exchange choice pinned first, then every zone by offset, each
// one the widget offers), and the session-view picker, offered only for a symbol that has trading
// hours to choose, with the choices and the words its own session facts give it. Every chip and row
// is a command, so a preset deeper than the feed's history is disabled rather than sent. With one
// timezone offered there is nothing to choose: the clock reads that zone with no picker behind it.
import { RANGE_PRESETS, rangePresetTip } from '../../ranges'
import { parseSessionModel, tradingHoursOption, tradingHoursOptions, type SessionModel, type TradingHoursOption } from '../../sessionModel'
import type { SymbolInfo } from '../../symbology'
import { rangeTimeframe } from '../../widget/timeframes'
import { offersTimezone } from '../../widget/offeredTimezones'
import { EXCHANGE_TIMEZONE, formatClock, timezoneListing, tzOffsetLabel } from '../../timezones'
import { activeChart, shows, type ChromeContext } from './context'
import { button, h, name, replace, setDisabled, stopPointer } from './dom'
import { FLYOUT_WIDTH } from './flyoutGeometry'
import { ICONS } from '../controls/icons'
import { menuHeading, menuItem, openMenu, toggleMenu, type MenuHandle } from './menu'

export interface BottomBarHandle {
  element: HTMLElement
  sync(): void
  destroy(): void
}

/** The command a timezone row runs: the exchange choice's own, or the zone's. */
export const timezoneCommand = (id: string): string => (id === EXCHANGE_TIMEZONE ? 'chart.timezone.exchange' : `chart.timezone.${id}`)

/** The session model a resolved symbol's own facts build, or null with no symbol and for one that
 *  states no zone or session string to read. */
export const symbolSessionModel = (info: SymbolInfo | null): SessionModel | null =>
  info && typeof info.timezone === 'string' && typeof info.session === 'string' ? parseSessionModel(info) : null

/** The command a trading-hours choice runs and its argument: the subsession's own, or the settings
 *  write that names 24 hours, which no subsession stands for. */
export const tradingHoursCommand = (option: TradingHoursOption): { id: string; arg?: unknown } =>
  option.hours === 'allHours' ? { id: 'chart.settings.apply', arg: { settings: { symbol: { session: 'allHours' } } } } : { id: `chart.subsession.${option.hours}` }

export function mountBottomBar(deps: ChromeContext): BottomBarHandle {
  const t = (): ChromeContext['i18n']['t'] => deps.i18n.t
  const element = h('div', { class: 'qc-bottombar', role: 'toolbar', 'aria-label': t()('chrome.bottomBar') })
  stopPointer(element)
  const ranges = h('div', { class: 'qc-ranges', role: 'group', 'aria-label': t()('command.rangeSet') })
  const clock = h('span', { class: 'qc-clock' })
  const offset = h('span', { class: 'qc-clock-offset' })
  const tzTrigger = button({ label: t()('timezone.title'), className: 'qc-toolbar-button qc-tz-trigger', onClick: () => toggleMenu(tzTrigger, openTimezones) })
  tzTrigger.setAttribute('aria-haspopup', 'listbox')
  tzTrigger.setAttribute('aria-expanded', 'false')
  const zones = deps.timezones ?? null
  const offeredRanges = deps.ranges ?? RANGE_PRESETS
  // One offered zone leaves nothing to choose, so the clock stands on its own instead of opening a
  // picker of one row.
  const fixedZone = zones !== null && zones.length === 1
  const clockFace = fixedZone ? h('span', { class: 'qc-tz-clock' }, clock, offset) : tzTrigger
  if (!fixedZone) tzTrigger.append(clock, offset)
  const sessionTrigger = button({ label: t()('chrome.session'), text: '', className: 'qc-toolbar-button qc-session-trigger', onClick: () => toggleMenu(sessionTrigger, openSessions) })
  sessionTrigger.setAttribute('aria-haspopup', 'menu')
  sessionTrigger.setAttribute('aria-expanded', 'false')
  element.append(ranges, h('div', { class: 'qc-bottombar-end' }, clockFace, sessionTrigger))
  let tzMenu: MenuHandle | null = null
  let sessionMenu: MenuHandle | null = null

  const zone = (): string | null => activeChart(deps).displayTimezone()
  /** The trading-hours choices the active chart's symbol offers, read from its own session facts,
   *  and the one its trading-hours setting stands for. */
  const tradingHours = (): { options: readonly TradingHoursOption[]; active: TradingHoursOption | null } => {
    const chart = activeChart(deps)
    const options = tradingHoursOptions(symbolSessionModel(chart.symbolInfo()))
    const hours = chart.subsession() === 'regular' ? 'regular' : chart.settings().symbol.session === 'allHours' ? 'allHours' : 'extended'
    return { options, active: tradingHoursOption(options, hours) }
  }
  const tick = (): void => {
    const z = zone()
    clock.textContent = z ? formatClock(deps.i18n.tag(), z) : ''
    offset.textContent = z ? tzOffsetLabel(z) : '--'
  }
  // The clock runs only while the widget can be seen: the document hidden, or the bar scrolled out
  // of view, stops it, and coming back restarts it on a fresh reading.
  let timer: ReturnType<typeof setInterval> | null = null
  let inView = true
  const start = (): void => {
    if (timer || document.visibilityState === 'hidden' || !inView) return
    tick()
    timer = setInterval(tick, 1000)
  }
  const stop = (): void => {
    if (!timer) return
    clearInterval(timer)
    timer = null
  }
  const onVisibility = (): void => (document.visibilityState === 'hidden' ? stop() : start())
  document.addEventListener('visibilitychange', onVisibility)
  const observer =
    typeof IntersectionObserver === 'function'
      ? new IntersectionObserver((entries) => {
          inView = entries.some((entry) => entry.isIntersecting)
          if (inView) start()
          else stop()
        })
      : null
  observer?.observe(element)
  start()

  const openTimezones = (): void => {
    const rows = timezoneListing(t(), { withExchange: offersTimezone(zones, EXCHANGE_TIMEZONE) }).filter((row) => offersTimezone(zones, row.id))
    const current = activeChart(deps).timezone()
    tzMenu = openMenu({
      host: deps.overlays,
      anchor: tzTrigger,
      label: t()('timezone.title'),
      role: 'listbox',
      className: 'qc-tz-menu',
      width: FLYOUT_WIDTH.timezone,
      align: 'end',
      placement: 'up',
      initialIndex: Math.max(0, rows.findIndex((r) => r.id === current)),
      build(body, handle) {
        const active = activeChart(deps).timezone()
        for (const row of rows) {
          const id = timezoneCommand(row.id)
          if (row.id !== active && !shows(deps, id)) continue
          body.appendChild(
            menuItem({
              text: row.label,
              role: 'option',
              checked: row.id === active,
              ...(row.id === active ? { icon: deps.icons.glyph(ICONS.check, { size: 28 }) } : {}),
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
      align: 'end',
      placement: 'up',
      build(body, handle) {
        const { options, active } = tradingHours()
        body.appendChild(menuHeading(t()('chrome.sessionsHeading')))
        for (const option of options) {
          const run = tradingHoursCommand(option)
          const chosen = option.hours === active?.hours
          if (!chosen && !shows(deps, run.id)) continue
          body.appendChild(
            menuItem({
              text: t()(option.label),
              role: 'menuitemradio',
              checked: chosen,
              disabled: !chosen && !deps.commands.available(run.id),
              onSelect: () => {
                handle.close()
                deps.commands.execute(run.id, run.arg)
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
      ...offeredRanges.filter((preset) => shows(deps, `chart.range.${preset.key}`)).map((preset) => {
        const id = `chart.range.${preset.key}`
        const chip = button({ label: rangePresetTip(t(), { ...preset, tf: rangeTimeframe(preset.tf, deps.timeframes) }), text: preset.key, className: 'qc-toolbar-button qc-range-chip', pressed: chart.rangePreset() === preset.key, onClick: () => deps.commands.execute(id) })
        setDisabled(chip, !deps.commands.available(id))
        return chip
      }),
    )
    ranges.setAttribute('aria-label', t()('command.rangeSet'))
    element.setAttribute('aria-label', t()('chrome.bottomBar'))
    name(tzTrigger, t()('timezone.title'))
    tick()
    // The trigger names the trading hours shown in their short form; its accessible name spells them.
    const hours = tradingHours()
    sessionTrigger.hidden = hours.options.length === 0
    if (hours.active) {
      name(sessionTrigger, `${t()('chrome.session')}: ${t()(hours.active.label)}`)
      const text = sessionTrigger.querySelector('.qc-button-text')
      if (text) text.textContent = t()(hours.active.short)
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
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
      observer?.disconnect()
      offStrings()
      tzMenu?.close()
      sessionMenu?.close()
      element.remove()
    },
  }
}

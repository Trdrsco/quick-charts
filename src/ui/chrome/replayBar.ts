// The bar-replay transport: the starting-point split button (select a bar on the chart, select a
// date, a random bar), step back, play or pause, step forward, the speed menu, the update-interval
// menu, go live, the bar counter, and exit. Mounted once in the widget's reserved row while its
// presentation owner is replaying; every control states an intent by that chart's command id, so a
// host that forbids a replay verb cannot reach it by clicking the bar.
import type { ChartI18n } from '../../i18n'
import type { CommandExecutor } from '../../widget/commands'
import type { ChartHandle } from '../../widget/chart'
import type { FeedBar } from '../../datafeed'
import { REPLAY_SPEEDS, tfSeconds } from '../../replay'
import { parseTimeframe, timeframeChipLabel, timeframeGroupUnit, timeframeLabel } from '../../timeframe'
import { openDatePicker } from './datePicker'
import { button, h, name, reglyph, retext, setDisabled, stopPointer } from './dom'
import { FLYOUT_WIDTH } from './flyoutGeometry'
import { ICONS, type Glyph } from '../controls/icons'
import { menuHeading, menuItem, menuSeparator, openMenu, toggleMenu } from './menu'
import { switchRow } from './dialog'
import type { Closable } from '../controls/overlays'
import type { IconResolver } from '../icons/resolver'

export interface ReplayTransportDeps {
  /** The overlay layer this row's pickers and the date dialog open into, and the bounds they are
   *  measured against. The row itself is NOT mounted here: the caller places the returned element
   *  in the widget's own flow, so the transport can never float over a pane or its time axis. */
  chrome: HTMLElement
  i18n: ChartI18n
  /** Draws every glyph: the host's drawing for its icon, or the chart's own. */
  icons: IconResolver
  commands: CommandExecutor
  handle: ChartHandle
  /** The chart's loaded bars: the window a starting point is picked from. */
  bars(): readonly FeedBar[]
  intraday(): boolean
}

export interface ReplayTransportHandle {
  element: HTMLElement
  /** Play the entrance after the host has placed the detached row in its final slot. */
  enter(): void
  /** Re-read the replay state and repaint every control. */
  sync(): void
  /** Tear down immediately during widget disposal; ordinary replay exits keep the last frame long
   *  enough to run the short closing motion. */
  destroy(options?: { animate?: boolean }): void
}

/** How a speed reads in words: updates per second at 1x and above, seconds per update below. */
export function speedWords(t: ChartI18n['t'], speed: number): string {
  return speed >= 1 ? t('replay.updatesPerSecond', { count: speed }) : t('replay.oneUpdatePerSeconds', { count: Math.round(1 / speed) })
}

/** A finer interval's name: whole days, hours or minutes, by its nominal seconds. */
export function intervalWords(t: ChartI18n['t'], token: string): string {
  const sec = tfSeconds(token)
  if (sec === 0) return token
  return timeframeLabel(t, token)
}

export function mountReplayTransport(deps: ReplayTransportDeps): ReplayTransportHandle {
  const { commands, handle, i18n } = deps
  const t = (): ChartI18n['t'] => i18n.t
  const bar = h('div', { class: 'qc-replay', role: 'toolbar', 'aria-label': t()('chrome.replay') })
  stopPointer(bar)

  /** The starting-point mode the split button wears: it remembers the last one used. */
  let startMode: 'bar' | 'date' = 'bar'
  /** The subscription while the chart waits for a bar to be clicked, else null. */
  let picking: (() => void) | null = null
  /** The menus and the date dialog this bar has open, so destroy closes them. */
  const open = new Set<Closable>()
  const hold = <T extends Closable>(handle: T): T => {
    open.add(handle)
    return handle
  }

  /** Begin, or move the cursor, at a chosen moment. ONE command: the session owns the transition,
   *  so choosing a different bar never leaves replay and never takes this row down with it. */
  const startAt = (atSec: number): void => {
    commands.execute('chart.replay.start', atSec)
  }
  /** Release the plot subscription without saying anything about the session. Used when this row is
   *  going away, where the session has already moved on. */
  const releasePicking = (): void => {
    picking?.()
    picking = null
    document.removeEventListener('keydown', onPickKey, true)
  }
  /** Draw, and wire, exactly what the SESSION says. Select bar's held state IS the arming phase, so
   *  the plot subscription, the Escape key and the control's own pressed state all come from that
   *  one answer rather than from a private flag this row keeps. Picking a bar answers the question,
   *  which un-arms the session, which releases the click and lets the control go up: the same path
   *  a date pick, a random pick, Escape and Exit all take. */
  const reconcilePicking = (): void => {
    const armed = handle.replay.phase() === 'arming'
    if (armed && !picking) {
      picking = handle.sync.onTimeClick((time) => startAt(time))
      document.addEventListener('keydown', onPickKey, true)
    } else if (!armed && picking) {
      releasePicking()
    }
    startButton.setAttribute('aria-pressed', String(armed))
  }
  const onPickKey = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      handle.replay.disarm()
    }
  }
  const armPick = (): void => {
    if (handle.replay.phase() === 'arming') handle.replay.disarm()
    else handle.replay.arm()
  }
  const pickDate = (): void => {
    // The question moves into the dialog, so the plot stops taking it: two live ways to answer the
    // same question would leave a stray click starting replay behind an open dialog.
    handle.replay.disarm()
    const bars = deps.bars()
    const first = bars[0]
    const last = bars[bars.length - 1]
    if (!first || !last) return
    const dialog: Closable = hold(openDatePicker({ host: deps.chrome, i18n, icons: deps.icons, minSec: first.t, maxSec: last.t, withTime: deps.intraday(), onSelect: startAt, onClose: () => open.delete(dialog) }))
  }
  const pickRandom = (): void => {
    const bars = deps.bars()
    if (bars.length < 3) return
    const index = 2 + Math.floor(Math.random() * (bars.length - 2))
    startAt(bars[index]!.t)
  }
  const startAction = (): void => {
    if (startMode === 'bar') armPick()
    else pickDate()
  }

  const startButton = button({ label: t()('replay.selectBar'), text: t()('replay.selectBar'), icon: deps.icons.glyph(ICONS.selectBar), className: 'qc-toolbar-button qc-replay-start', pressed: false, onClick: startAction })
  const startMenuButton = button({ label: t()('replay.selectStartingPoint'), icon: deps.icons.glyph(ICONS.menuArrowWide, { size: 8, height: 4, className: 'qc-caret' }), className: 'qc-toolbar-button qc-replay-caret', onClick: () => toggleMenu(startMenuButton, openStartMenu) })
  startMenuButton.setAttribute('aria-haspopup', 'menu')

  const openStartMenu = (): void => {
    const menu: Closable = hold(openMenu({
      host: deps.chrome,
      anchor: startMenuButton,
      label: t()('replay.selectStartingPoint'),
      className: 'qc-replay-menu',
      width: FLYOUT_WIDTH.replayStart,
      placement: 'up',
      onClose: () => open.delete(menu),
      build(body, menu) {
        body.append(
          menuHeading(t()('replay.selectStartingPoint')),
          menuItem({
            text: t()('replay.startBar'),
            icon: deps.icons.glyph(ICONS.selectBar),
            role: 'menuitemradio',
            checked: startMode === 'bar',
            onSelect: () => {
              startMode = 'bar'
              menu.close()
              paintStart()
              // Choosing the mode ARMS it rather than toggling: picking "Bar" from the menu while
              // the plot is already live would otherwise put the picker away.
              handle.replay.arm()
            },
          }),
          menuItem({
            text: t()('replay.startDate'),
            icon: deps.icons.glyph(ICONS.calendar),
            role: 'menuitemradio',
            checked: startMode === 'date',
            onSelect: () => {
              startMode = 'date'
              menu.close()
              paintStart()
              pickDate()
            },
          }),
          // The oldest bar the feed serves: the chart walks back to it and starts there.
          menuItem({
            text: t()('replay.startFirst'),
            icon: deps.icons.glyph(ICONS.firstAvailable),
            disabled: !commands.available('chart.replay.startFirst'),
            onSelect: () => {
              menu.close()
              commands.execute('chart.replay.startFirst')
            },
          }),
          menuItem({
            text: t()('replay.startRandom'),
            icon: deps.icons.glyph(ICONS.randomBar),
            onSelect: () => {
              menu.close()
              pickRandom()
            },
          }),
        )
      },
    }))
  }
  const paintStart = (): void => {
    const label = startMode === 'bar' ? t()('replay.selectBar') : t()('replay.selectDate')
    retext(startButton, label, label)
    reglyph(startButton, deps.icons, startMode === 'bar' ? ICONS.selectBar : ICONS.calendar)
  }

  const command = (id: string, label: string, icon: Glyph): HTMLButtonElement => {
    const b = button({ label, icon: deps.icons.glyph(icon), className: 'qc-toolbar-button', onClick: () => commands.execute(id) })
    return b
  }
  const stepBack = command('chart.replay.stepBack', t()('replay.stepBack'), ICONS.stepBack)
  const playPause = button({
    label: t()('replay.play'),
    icon: deps.icons.glyph(ICONS.play),
    className: 'qc-toolbar-button',
    onClick: () => commands.execute(handle.replay.state().playing ? 'chart.replay.pause' : 'chart.replay.play'),})
  const stepForward = command('chart.replay.stepForward', t()('replay.stepForward'), ICONS.stepForward)

  const speedButton = button({ label: t()('replay.speed'), text: '', className: 'qc-toolbar-button qc-replay-speed', onClick: () => toggleMenu(speedButton, openSpeedMenu) })
  speedButton.setAttribute('aria-haspopup', 'menu')
  const openSpeedMenu = (): void => {
    const menu: Closable = hold(openMenu({
      host: deps.chrome,
      anchor: speedButton,
      label: t()('replay.speed'),
      className: 'qc-replay-menu qc-replay-speed-menu',
      placement: 'up',
      onClose: () => open.delete(menu),
      initialIndex: Math.max(0, (REPLAY_SPEEDS as readonly number[]).indexOf(handle.replay.state().speed)),
      build(body, menu) {
        body.appendChild(menuHeading(t()('replay.speed')))
        for (const speed of REPLAY_SPEEDS) {
          body.appendChild(
            menuItem({
              text: `${speed}x`,
              hint: speedWords(t(), speed),
              role: 'menuitemradio',
              checked: handle.replay.state().speed === speed,
              onSelect: () => {
                menu.close()
                commands.execute('chart.replay.setSpeed', speed)
              },
            }),
          )
        }
      },
    }))
  }

  const intervalButton = button({ label: t()('replay.interval'), text: '', className: 'qc-toolbar-button qc-replay-interval', onClick: () => toggleMenu(intervalButton, openIntervalMenu) })
  intervalButton.setAttribute('aria-haspopup', 'menu')
  const openIntervalMenu = (): void => {
    const menu: Closable = hold(openMenu({
      host: deps.chrome,
      anchor: intervalButton,
      label: t()('replay.interval'),
      role: 'dialog',
      className: 'qc-replay-menu',
      width: FLYOUT_WIDTH.replayInterval,
      placement: 'up',
      onClose: () => open.delete(menu),
      build(body, menu) {
        const heading = menuHeading(t()('replay.interval'))
        heading.title = t()('replay.intervalHelp')
        body.appendChild(heading)
        const current = handle.replay.interval()
        const rows: { token: string; row: HTMLButtonElement }[] = []
        // A rule between UNIT groups, as the timeframe picker draws one: seconds, minutes, hours and
        // days are different orders of magnitude, and a flat run of them reads as one list where the
        // jump from 30 minutes to 1 hour is the same size as the jump from 3 to 5.
        let previousUnit: string | null = null
        for (const token of handle.replay.subIntervals()) {
          const unit = timeframeGroupUnit(parseTimeframe(token)?.unit ?? 'd')
          if (previousUnit !== null && unit !== previousUnit) body.appendChild(menuSeparator())
          previousUnit = unit
          const row = menuItem({
            text: intervalWords(t(), token),
            role: 'menuitemradio',
            checked: current === token,
            onSelect: () => {
              menu.close()
              commands.execute('chart.replay.setInterval', token)
            },
          })
          rows.push({ token, row })
          body.appendChild(row)
        }
        body.appendChild(menuSeparator())
        body.appendChild(
          switchRow({
            label: t()('replay.autoSelectInterval'),
            checked: current === 'auto',
            onChange: (on) => {
              // Switching auto off keeps the grain auto would have chosen, as the first explicit
              // one, so the menu never claims a grain replay is not using.
              const first = handle.replay.subIntervals()[0]
              commands.execute('chart.replay.setInterval', on ? 'auto' : (first ?? 'auto'))
              // The rows take the new choice in place: a rebuild would swap the switch just pressed
              // for a new one already at its end, and the knob would jump, not slide.
              const now = handle.replay.interval()
              for (const entry of rows) entry.row.setAttribute('aria-checked', String(now === entry.token))
            },
          }),
        )
      },
    }))
  }

  const goLive = button({ label: t()('replay.goLiveTitle'), icon: deps.icons.glyph(ICONS.goLive), className: 'qc-toolbar-button', onClick: () => commands.execute('chart.replay.goLive') })
  const exit = button({ label: t()('replay.exit'), icon: deps.icons.glyph(ICONS.closeThin, { size: 17 }), className: 'qc-toolbar-button qc-replay-exit', onClick: () => commands.execute('chart.replay.exit') })

  const rule = (): HTMLElement => h('span', { class: 'qc-separator qc-separator--vertical', role: 'separator' })
  const controls = h('span', { class: 'qc-replay-controls' },
    h('span', { class: 'qc-replay-group' }, startButton, startMenuButton),
    rule(),
    stepBack, playPause, stepForward, speedButton, intervalButton,
    rule(),
    goLive,
  )
  bar.append(h('span', { class: 'qc-replay-command-strip' }, controls, exit))

  const sync = (): void => {
    const state = handle.replay.state()
    const atLive = state.cursor >= state.total
    const playing = state.playing
    retext(playPause, t()(playing ? 'replay.pause' : 'replay.play'))
    // Only when it CHANGES. This row syncs on every replay step, and swapping the mark under the
    // pointer between a press and its release is what loses the press: the control a viewer reaches
    // for most while replay runs is this one, and pausing has to answer on the first click.
    reglyph(playPause, deps.icons, playing ? ICONS.pause : ICONS.play)
    setDisabled(stepBack, !commands.available('chart.replay.stepBack') || state.cursor <= 2)
    setDisabled(playPause, !commands.available(playing ? 'chart.replay.pause' : 'chart.replay.play') || (!playing && atLive))
    setDisabled(stepForward, !commands.available('chart.replay.stepForward') || atLive)
    setDisabled(goLive, !commands.available('chart.replay.goLive') || atLive)
    setDisabled(speedButton, !commands.available('chart.replay.setSpeed'))
    const intervals = handle.replay.subIntervals()
    const noGrain = intervals.length === 0
    setDisabled(intervalButton, noGrain || !commands.available('chart.replay.setInterval'))
    retext(speedButton, t()('replay.speed'), `${state.speed}x`)
    // The control wears the interval REPLAY IS USING, resolving `auto` to the grain it picked. A
    // control reading "Auto" says which mode it is in and leaves the viewer to guess what that
    // chose; the token answers both at once. It is written as the toolbar's own chip writes an
    // interval, and the menu spells each one out. With no grain at all the name says why, because
    // a greyed control with no reason reads as broken rather than as inapplicable here.
    const resolved = handle.replay.resolvedInterval()
    retext(intervalButton, noGrain ? t()('replay.intervalNone') : t()('replay.interval'), noGrain ? t()('replay.auto') : timeframeChipLabel(resolved))
    setDisabled(exit, !commands.available('chart.replay.exit'))
    reconcilePicking()
    // Labels follow the language: a sync runs on every relabel as well as on every state change.
    bar.setAttribute('aria-label', t()('chrome.replay'))
    paintStart()
    name(startMenuButton, t()('replay.selectStartingPoint'))
    name(stepBack, t()('replay.stepBack'))
    name(stepForward, t()('replay.stepForward'))
    name(goLive, t()('replay.goLiveTitle'))
    name(exit, t()('replay.exit'))
  }

  const offStrings = i18n.onChange(sync)
  // The row opens on a session that is ALREADY arming, because entry is the viewer saying they want
  // to start somewhere and the transport is what asks where. This first sync therefore finds Select
  // bar held and the plot live, without the row arming anything itself.
  sync()
  let destroyed = false
  return {
    element: bar,
    enter() {
      const view = bar.ownerDocument.defaultView
      const reduceMotion = typeof view?.matchMedia === 'function' && view.matchMedia('(prefers-reduced-motion: reduce)').matches
      if (destroyed || !bar.isConnected) return
      if (reduceMotion) {
        bar.dataset.state = 'open'
        return
      }
      // Use the stylesheet's transition rather than Element.animate(): the transport is embedded
      // in hosts (including webviews) that do not all expose the Web Animations API. Committing the
      // collapsed frame before opening makes the actual reserved row grow instead of only moving
      // the controls inside an already-full-height band.
      bar.dataset.state = 'opening'
      bar.getBoundingClientRect()
      bar.dataset.state = 'open'
    },
    sync,
    destroy({ animate = false } = {}) {
      if (destroyed) return
      destroyed = true
      releasePicking()
      for (const handle of [...open]) handle.close()
      offStrings()

      const view = bar.ownerDocument.defaultView
      const reduceMotion = typeof view?.matchMedia === 'function' && view.matchMedia('(prefers-reduced-motion: reduce)').matches
      if (!animate || reduceMotion || !bar.isConnected || !view) {
        bar.remove()
        return
      }

      // It leaves the accessibility tree immediately, but stays in layout for the short collapse.
      // Collapsing the actual in-flow row—not an overlaid copy—is what makes the chart grow back
      // into its space instead of jumping full-height while only the toolbar pixels fade away.
      bar.style.pointerEvents = 'none'
      bar.inert = true
      bar.removeAttribute('role')
      bar.setAttribute('aria-hidden', 'true')
      let timer: ReturnType<typeof setTimeout> | null = null
      const remove = (): void => {
        if (timer !== null) clearTimeout(timer)
        bar.remove()
      }
      const onTransitionEnd = (event: TransitionEvent): void => {
        if (event.target === bar) remove()
      }
      bar.dataset.state = 'closing'
      // A host may omit the package stylesheet. With no authored transition there are no closing
      // pixels to retain and no transitionend to wait for, so finish synchronously.
      const transitionDuration = view.getComputedStyle(bar).transitionDuration
      if (!transitionDuration.split(',').some((value) => Number.parseFloat(value) > 0)) {
        remove()
        return
      }
      bar.addEventListener('transitionend', onTransitionEnd, { once: true })
      timer = setTimeout(remove, 240)
    },
  }
}

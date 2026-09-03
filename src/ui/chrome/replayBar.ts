// The bar-replay transport: the starting-point split button (select a bar on the chart, select a
// date, a random bar), step back, play or pause, step forward, the speed menu, the update-interval
// menu, go live, the bar counter, and exit. Mounted by the chart while replay is on and taken down
// when it leaves; every control states an intent by command id, so a host that forbids a replay
// verb cannot reach it by clicking the bar.
import type { ChartI18n } from '../../i18n'
import type { CommandRegistry } from '../../widget/commands'
import type { ChartHandle } from '../../widget/chart'
import type { FeedBar } from '../../datafeed'
import { REPLAY_SPEEDS, tfSeconds } from '../../replay'
import { timeframeLabel } from '../../timeframe'
import { openDatePicker } from './datePicker'
import { button, glyph, h, name, retext, setDisabled, stopPointer } from './dom'
import { ICONS } from './icons'
import { menuHeading, menuItem, menuSeparator, openMenu } from './menu'
import { switchRow } from './dialog'
import type { Closable } from './overlays'

export interface ReplayTransportDeps {
  /** The chart's chrome subtree. */
  chrome: HTMLElement
  i18n: ChartI18n
  commands: CommandRegistry
  handle: ChartHandle
  /** The chart's loaded bars: the window a starting point is picked from. */
  bars(): readonly FeedBar[]
  intraday(): boolean
}

export interface ReplayTransportHandle {
  /** Re-read the replay state and repaint every control. */
  sync(): void
  destroy(): void
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
  const bar = h('div', { class: 'qc-surface qc-replay', role: 'toolbar', 'aria-label': t()('chrome.replay') })
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

  const restartAt = (atSec: number): void => {
    commands.execute('chart.replay.exit')
    commands.execute('chart.replay.start', atSec)
  }
  const stopPicking = (): void => {
    picking?.()
    picking = null
    startButton.setAttribute('aria-pressed', 'false')
    hint.hidden = true
    document.removeEventListener('keydown', onPickKey, true)
  }
  const onPickKey = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      stopPicking()
    }
  }
  const armPick = (): void => {
    if (picking) {
      stopPicking()
      return
    }
    picking = handle.sync.onTimeClick((time) => {
      stopPicking()
      restartAt(time)
    })
    startButton.setAttribute('aria-pressed', 'true')
    hint.hidden = false
    document.addEventListener('keydown', onPickKey, true)
  }
  const pickDate = (): void => {
    const bars = deps.bars()
    const first = bars[0]
    const last = bars[bars.length - 1]
    if (!first || !last) return
    const dialog: Closable = hold(openDatePicker({ host: deps.chrome, i18n, minSec: first.t, maxSec: last.t, withTime: deps.intraday(), onSelect: restartAt, onClose: () => open.delete(dialog) }))
  }
  const pickRandom = (): void => {
    const bars = deps.bars()
    if (bars.length < 3) return
    const index = 2 + Math.floor(Math.random() * (bars.length - 2))
    restartAt(bars[index]!.t)
  }
  const startAction = (): void => {
    if (startMode === 'bar') armPick()
    else pickDate()
  }

  const startButton = button({ label: t()('replay.selectBar'), text: t()('replay.selectBar'), icon: ICONS.selectBar, className: 'qc-replay-button qc-replay-start', pressed: false, onClick: startAction })
  const startMenuButton = button({ label: t()('replay.selectStartingPoint'), icon: ICONS.chevronDown, iconSize: 18, className: 'qc-replay-button qc-replay-caret', onClick: () => openStartMenu() })
  startMenuButton.setAttribute('aria-haspopup', 'menu')
  const hint = h('span', { class: 'qc-replay-hint qc-secondary', role: 'status', hidden: true }, t()('replay.pickBarHint'))

  const openStartMenu = (): void => {
    const menu: Closable = hold(openMenu({
      host: deps.chrome,
      anchor: startMenuButton,
      label: t()('replay.selectStartingPoint'),
      placement: 'up',
      onClose: () => open.delete(menu),
      build(body, menu) {
        body.append(
          menuHeading(t()('replay.selectStartingPoint')),
          menuItem({
            text: t()('replay.startBar'),
            icon: glyph(ICONS.selectBar, { size: 18 }),
            role: 'menuitemradio',
            checked: startMode === 'bar',
            onSelect: () => {
              startMode = 'bar'
              menu.close()
              paintStart()
              armPick()
            },
          }),
          menuItem({
            text: t()('replay.startDate'),
            icon: glyph(ICONS.calendar, { size: 18 }),
            role: 'menuitemradio',
            checked: startMode === 'date',
            onSelect: () => {
              startMode = 'date'
              menu.close()
              paintStart()
              pickDate()
            },
          }),
          menuItem({
            text: t()('replay.startRandom'),
            icon: glyph(ICONS.randomBar, { size: 18 }),
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
    startButton.querySelector('.qc-icon')?.replaceWith(glyph(startMode === 'bar' ? ICONS.selectBar : ICONS.calendar))
  }

  const command = (id: string, label: string, icon: string): HTMLButtonElement => {
    const b = button({ label, icon, className: 'qc-replay-button', onClick: () => commands.execute(id) })
    return b
  }
  const stepBack = command('chart.replay.stepBack', t()('replay.stepBack'), ICONS.stepBack)
  const playPause = button({
    label: t()('replay.play'),
    icon: ICONS.play,
    className: 'qc-replay-button',
    onClick: () => commands.execute(handle.replay.state().playing ? 'chart.replay.pause' : 'chart.replay.play'),
  })
  const stepForward = command('chart.replay.stepForward', t()('replay.stepForward'), ICONS.stepForward)

  const speedButton = button({ label: t()('replay.speed'), text: '', className: 'qc-replay-button qc-replay-speed', onClick: () => openSpeedMenu() })
  speedButton.setAttribute('aria-haspopup', 'menu')
  const openSpeedMenu = (): void => {
    const menu: Closable = hold(openMenu({
      host: deps.chrome,
      anchor: speedButton,
      label: t()('replay.speed'),
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

  const intervalButton = button({ label: t()('replay.interval'), text: '', className: 'qc-replay-button qc-replay-interval', onClick: () => openIntervalMenu() })
  intervalButton.setAttribute('aria-haspopup', 'menu')
  const openIntervalMenu = (): void => {
    const menu: Closable = hold(openMenu({
      host: deps.chrome,
      anchor: intervalButton,
      label: t()('replay.interval'),
      role: 'dialog',
      placement: 'up',
      onClose: () => open.delete(menu),
      build(body, menu) {
        const heading = menuHeading(t()('replay.interval'))
        heading.title = t()('replay.intervalHelp')
        body.appendChild(heading)
        const current = handle.replay.interval()
        for (const token of handle.replay.subIntervals()) {
          body.appendChild(
            menuItem({
              text: intervalWords(t(), token),
              role: 'menuitemradio',
              checked: current === token,
              onSelect: () => {
                menu.close()
                commands.execute('chart.replay.setInterval', token)
              },
            }),
          )
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
              menu.refresh()
            },
          }),
        )
      },
    }))
  }

  const goLive = button({ label: t()('replay.goLiveTitle'), icon: ICONS.goLive, className: 'qc-replay-button', onClick: () => commands.execute('chart.replay.goLive') })
  const position = h('span', { class: 'qc-replay-position qc-secondary', 'aria-live': 'off' })
  const exit = button({ label: t()('replay.exit'), icon: ICONS.close, iconSize: 18, className: 'qc-replay-button qc-replay-exit', onClick: () => commands.execute('chart.replay.exit') })

  bar.append(
    h('span', { class: 'qc-replay-group' }, startButton, startMenuButton),
    h('span', { class: 'qc-separator qc-separator--vertical', role: 'separator' }),
    stepBack,
    playPause,
    stepForward,
    speedButton,
    intervalButton,
    goLive,
    position,
    hint,
    exit,
  )

  const sync = (): void => {
    const state = handle.replay.state()
    const atLive = state.cursor >= state.total
    const playing = state.playing
    retext(playPause, t()(playing ? 'replay.pause' : 'replay.play'))
    playPause.querySelector('.qc-icon')?.replaceWith(glyph(playing ? ICONS.pause : ICONS.play))
    setDisabled(stepBack, !commands.available('chart.replay.stepBack') || state.cursor <= 2)
    setDisabled(playPause, !commands.available(playing ? 'chart.replay.pause' : 'chart.replay.play') || (!playing && atLive))
    setDisabled(stepForward, !commands.available('chart.replay.stepForward') || atLive)
    setDisabled(goLive, !commands.available('chart.replay.goLive') || atLive)
    setDisabled(speedButton, !commands.available('chart.replay.setSpeed'))
    const intervals = handle.replay.subIntervals()
    setDisabled(intervalButton, intervals.length === 0 || !commands.available('chart.replay.setInterval'))
    retext(speedButton, t()('replay.speed'), `${state.speed}x`)
    const interval = handle.replay.interval()
    retext(intervalButton, t()('replay.interval'), interval === 'auto' ? t()('replay.auto') : interval)
    position.textContent = t()('replay.position', { cursor: state.cursor, total: state.total })
    setDisabled(exit, !commands.available('chart.replay.exit'))
    // Labels follow the language: a sync runs on every relabel as well as on every state change.
    bar.setAttribute('aria-label', t()('chrome.replay'))
    paintStart()
    name(startMenuButton, t()('replay.selectStartingPoint'))
    name(stepBack, t()('replay.stepBack'))
    name(stepForward, t()('replay.stepForward'))
    name(goLive, t()('replay.goLiveTitle'))
    name(exit, t()('replay.exit'))
    hint.textContent = t()('replay.pickBarHint')
  }

  const offStrings = i18n.onChange(sync)
  deps.chrome.appendChild(bar)
  sync()
  return {
    sync,
    destroy() {
      stopPicking()
      for (const handle of [...open]) handle.close()
      offStrings()
      bar.remove()
    },
  }
}

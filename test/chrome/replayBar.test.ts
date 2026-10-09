// @vitest-environment happy-dom
// The replay transport: its controls read the replay state and route every press through a
// command, the starting point arms a chart click, the starting-point menu offers the four starting
// points with the current one marked, a date chosen in the dialog starts replay through the start
// command, and the speed and timeframe menus set through commands.
import { afterEach, describe, expect, it } from 'vitest'
import { timeframeWords, mountReplayTransport, speedWords } from '../../src/ui/chrome/replayBar'
import { buttonNames, fakeChart, fakeWidget, press } from './harness'

let cleanup: (() => void)[] = []
afterEach(() => {
  for (const fn of cleanup.splice(0)) fn()
  document.body.replaceChildren()
})

/** The widget's own shape around the transport: a root column holding the charts grid, the overlay
 *  layer the pickers open into, and the bottom band. The row is placed the way the chrome places
 *  it, after the grid, because the transport does not mount itself anywhere. */
function mount(options: { access?: (id: string) => boolean; entry?: boolean } = {}) {
  const chart = fakeChart()
  const w = fakeWidget({ chart, access: options.access ? { command: options.access } : undefined })
  // A RUNNING session with the picker ARMED on top of it: the transport verbs are the ones a
  // session offers, and Select bar is held because a viewer re-arming to choose a different bar is
  // the state this row spends most of its life in. `entry` is replay just entered instead: the
  // question is open and no session runs yet.
  if (options.entry) {
    chart.handle.replay.start()
  } else {
    chart.handle.replay.start(1_700_000_000)
    chart.handle.replay.arm()
  }
  const root = document.createElement('div')
  root.className = 'qc-root'
  const panes = document.createElement('div')
  panes.className = 'qc-panes'
  const bottom = document.createElement('div')
  bottom.className = 'qc-bottombar'
  const chrome = document.createElement('div')
  chrome.className = 'qc-overlays'
  root.append(panes, bottom, chrome)
  document.body.appendChild(root)
  const bar = mountReplayTransport({ chrome, i18n: w.i18n, icons: w.icons, commands: w.commands, handle: chart.handle, bars: () => chart.bars, intraday: () => true })
  // The widget chrome re-syncs this row on every replay transition. Standing in for that door is
  // what lets a spec press a control and read back what the row draws from the session's answer.
  chart.handle.on('replay', () => bar.sync())
  panes.after(bar.element)
  cleanup.push(() => (bar.destroy(), w.dispose()))
  return { w, chart, root, chrome, bar }
}

describe('the replay bar', () => {
  it.each(['Select starting point', 'Replay speed', 'Update timeframe'])('%s toggles its panel and teardown removes an open panel', (label) => {
    const { root, bar } = mount()
    const trigger = root.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!
    for (let repeat = 0; repeat < 3; repeat++) {
      trigger.click()
      expect(root.querySelectorAll('.qc-menu-panel')).toHaveLength(1)
      expect(trigger.getAttribute('aria-expanded')).toBe('true')
      trigger.click()
      expect(root.querySelectorAll('.qc-menu-panel')).toHaveLength(0)
      expect(trigger.getAttribute('aria-expanded')).toBe('false')
    }
    trigger.click()
    bar.destroy()
    expect(root.querySelectorAll('.qc-menu-panel')).toHaveLength(0)
  })

  it('is a toolbar carrying the starting point, the transport, the menus, the counter and exit', () => {
    const { root } = mount()
    const bar = root.querySelector('.qc-replay')!
    expect(bar.getAttribute('role')).toBe('toolbar')
    expect(bar.classList.contains('qc-surface')).toBe(false)
    expect(buttonNames(bar)).toEqual(['Select bar', 'Select starting point', 'Step back one bar', 'Play', 'Step forward one bar', 'Replay speed', 'Update timeframe', 'Jump to the live edge', 'Exit replay'])
    expect(bar.querySelector('.qc-replay-speed .qc-button-text')!.textContent).toBe('10x')
    // The GRAIN, not the mode: `auto` on the session resolves to a token and the control wears it
    // as the toolbar's chip writes a timeframe, so a viewer reads how far each update moves rather
    // than who chose it.
    expect(bar.querySelector('.qc-replay-timeframe .qc-button-text')!.textContent).toBe('15m')
    const strip = bar.querySelector('.qc-replay-command-strip')!
    expect(strip.querySelector('.qc-replay-controls')).not.toBeNull()
    expect(strip.lastElementChild?.classList.contains('qc-replay-exit')).toBe(true)
  })

  it('keeps long localized control labels inside the scrollable command strip', () => {
    const { root } = mount()
    const start = root.querySelector<HTMLButtonElement>('.qc-replay-start .qc-button-text')!
    start.textContent = 'Select a substantially longer localized replay starting bar'
    expect(start.closest('.qc-replay-controls')).not.toBeNull()
    expect(start.closest('.qc-replay-command-strip')).not.toBeNull()
  })

  it('routes the transport through commands and flips play to pause', () => {
    const { root, chart, bar } = mount()
    const byName = (label: string): HTMLButtonElement => root.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!
    byName('Step forward one bar').click()
    byName('Step back one bar').click()
    byName('Play').click()
    expect(chart.calls).toEqual(expect.arrayContaining(['replay:stepForward', 'replay:stepBack', 'replay:play']))
    bar.sync()
    expect(byName('Pause')).not.toBeNull()
    byName('Pause').click()
    expect(chart.calls).toContain('replay:pause')
    byName('Jump to the live edge').click()
    expect(chart.calls).toContain('replay:goLive')
    bar.sync()
    expect(byName('Jump to the live edge').disabled).toBe(true) // at the live edge
    expect(byName('Step forward one bar').disabled).toBe(true)
    byName('Exit replay').click()
    expect(chart.calls).toContain('replay:exit')
  })

  it('a denied verb renders disabled and does nothing', () => {
    const { root, chart } = mount({ access: (id) => id !== 'chart.replay.stepForward' })
    const step = root.querySelector<HTMLButtonElement>('button[aria-label="Step forward one bar"]')!
    expect(step.disabled).toBe(true)
    step.click()
    expect(chart.calls).not.toContain('replay:stepForward')
  })

  it('opens ALREADY armed, so the first click on the plot picks the bar to start from', () => {
    const { root, chart } = mount()
    const start = root.querySelector<HTMLButtonElement>('button[aria-label="Select bar"]')!
    // Entering replay IS the viewer asking to start somewhere, so the picker is live from the first
    // frame rather than waiting for a press on the control that is already the obvious next step.
    expect(start.getAttribute('aria-pressed')).toBe('true')
    
    // The SESSION holds the arming state, not the toolbar: the legend's mark and the plot's guide
    // read the same answer the button draws.
    expect(chart.calls).toContain('replay:arm')
    chart.clickTime(1_700_000_600)
    // The pick names the bar and NOTHING else. Standing the picker down is the session's own doing
    // inside that start, which is what puts the control back up; the row does not leave replay
    // first, because an exit here would take this very row down inside the click that asked for the
    // new start.
    expect(chart.calls.at(-1)).toBe('replay:start:1700000600')
    expect(chart.calls).not.toContain('replay:exit')
    expect(start.getAttribute('aria-pressed')).toBe('false')
  })

  it('disarms on Escape and re-arms from the control, telling the session each way', () => {
    const { root, chart } = mount()
    const start = root.querySelector<HTMLButtonElement>('button[aria-label="Select bar"]')!
    press(document.body, 'Escape')
    expect(chart.calls).toContain('replay:disarm')
    expect(start.getAttribute('aria-pressed')).toBe('false')

    // A press RE-OPENS the question mid-session, which is the whole point of the control: the plot
    // takes a click again and the mark comes back with it.
    start.click()
    expect(chart.calls.at(-1)).toBe('replay:arm')
    expect(start.getAttribute('aria-pressed')).toBe('true')

    chart.clickTime(1_700_000_600)
    expect(chart.calls.at(-1)).toBe('replay:start:1700000600')
    expect(start.getAttribute('aria-pressed')).toBe('false')
  })

  it('keeps the mark a control already wears across a repaint, so a press on it survives', () => {
    const { root, chart } = mount()
    const playPause = root.querySelector<HTMLButtonElement>('button[aria-label="Play"]')!
    const icon = playPause.querySelector('.qc-icon')
    const startIcon = root.querySelector<HTMLButtonElement>('.qc-replay-start')!.querySelector('.qc-icon')

    // This row repaints on every replay step, ten times a second at 10x. Detaching the mark under
    // the pointer between a press and its release loses the press, which is how a viewer ends up
    // unable to pause: the node they pressed is gone by the time they let go.
    chart.handle.replay.stepForward()
    chart.handle.replay.stepForward()
    expect(playPause.querySelector('.qc-icon')).toBe(icon)
    expect(root.querySelector<HTMLButtonElement>('.qc-replay-start')!.querySelector('.qc-icon')).toBe(startIcon)

    // A mark that genuinely CHANGES is still redrawn.
    chart.handle.replay.play()
    expect(playPause.querySelector('.qc-icon')).not.toBe(icon)
    expect(playPause.getAttribute('aria-label')).toBe('Pause')
  })

  it('takes no click from the plot once the question is answered', () => {
    const { root, chart } = mount()
    const start = root.querySelector<HTMLButtonElement>('button[aria-label="Select bar"]')!
    chart.clickTime(1_700_000_600)
    expect(start.getAttribute('aria-pressed')).toBe('false')

    // A second click on the plot is an ordinary click on a running replay, not another start.
    const before = chart.calls.length
    chart.clickTime(1_700_000_900)
    expect(chart.calls).toHaveLength(before)
  })

  it('the speed menu lists every speed with its words and sets through the command', () => {
    const { root, chart, w } = mount()
    root.querySelector<HTMLButtonElement>('button[aria-label="Replay speed"]')!.click()
    const rows = [...root.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')]
    expect(rows.length).toBe(9)
    expect(rows[0]!.textContent).toContain('10x')
    expect(rows[0]!.getAttribute('aria-checked')).toBe('true')
    rows[4]!.click()
    expect(chart.calls).toContain('replay:speed:1')
    expect(speedWords(w.i18n.t, 3)).toBe('3 updates per second')
    expect(speedWords(w.i18n.t, 0.2)).toBe('1 update per 5 seconds')
  })

  it('the timeframe menu lists the finer grains and the auto switch, each through the command', () => {
    const { root, chart, w } = mount()
    root.querySelector<HTMLButtonElement>('button[aria-label="Update timeframe"]')!.click()
    const panel = root.querySelector<HTMLElement>('.qc-menu-panel')!
    const rows = [...panel.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')]
    expect(rows.map((r) => r.textContent)).toEqual(['1 Second', '1 Minute', '5 Minutes', '15 Minutes', '1 Hour'])
    // A rule between UNIT groups, and the one before the auto switch: seconds | minutes | hours,
    // then the separator that holds the switch off the list.
    const body = rows[0]!.parentElement!
    const marks = [...body.children].map((e) => (e.classList.contains('qc-separator') ? '|' : e.getAttribute('role') === 'menuitemradio' ? e.textContent : 'x'))
    expect(marks).toEqual(['x', '1 Second', '|', '1 Minute', '5 Minutes', '15 Minutes', '|', '1 Hour', '|', 'x'])
    rows[2]!.click()
    expect(chart.calls).toContain('replay:timeframe:5m')
    root.querySelector<HTMLButtonElement>('button[aria-label="Update timeframe"]')!.click()
    const auto = root.querySelector<HTMLButtonElement>('[role="switch"]')!
    expect(auto.getAttribute('aria-checked')).toBe('false')
    auto.click()
    expect(chart.calls).toContain('replay:timeframe:auto')
    expect(timeframeWords(w.i18n.t, '1h')).toBe('1 Hour')
  })

  it('the starting-point menu offers bar, date, the first available date and random; random restarts inside the loaded window', () => {
    const { root, chart } = mount()
    root.querySelector<HTMLButtonElement>('button[aria-label="Select starting point"]')!.click()
    const rows = [...root.querySelectorAll<HTMLButtonElement>('.qc-menu-panel [data-qc-item]')]
    expect(rows.map((r) => r.textContent)).toEqual(['Bar', 'Date…', 'First available date', 'Random bar'])
    rows[3]!.click()
    const last = chart.calls[chart.calls.length - 1]!
    expect(last).toMatch(/^replay:start:\d+$/)
    const at = Number(last.slice('replay:start:'.length))
    expect(at).toBeGreaterThanOrEqual(chart.bars[2]!.t)
    expect(at).toBeLessThanOrEqual(chart.bars[chart.bars.length - 1]!.t)
  })

  it('the starting-point menu asks its question and marks the current starting point, Bar until Date… is chosen', () => {
    const { root } = mount()
    const openStart = (): HTMLElement => {
      root.querySelector<HTMLButtonElement>('button[aria-label="Select starting point"]')!.click()
      return root.querySelector<HTMLElement>('.qc-menu-panel')!
    }
    let panel = openStart()
    expect(panel.classList.contains('qc-replay-start-menu')).toBe(true)
    expect(panel.querySelector('.qc-menu-heading')!.textContent).toBe('Select starting point')
    let rows = [...panel.querySelectorAll<HTMLButtonElement>('[data-qc-item]')]
    // Each starting point wears its mark on the 28 grid; the two that are modes say which is current.
    expect(rows.map((row) => row.querySelector('svg')!.getAttribute('width'))).toEqual(['28', '28', '28', '28'])
    expect(rows.map((row) => row.getAttribute('aria-checked'))).toEqual(['true', 'false', null, null])
    rows[1]!.click()
    expect(root.querySelector<HTMLButtonElement>('.qc-replay-start')!.getAttribute('aria-label')).toBe('Select date')
    root.querySelector<HTMLButtonElement>('[data-role="replay-date"] button[aria-label="Cancel"]')!.click()
    panel = openStart()
    rows = [...panel.querySelectorAll<HTMLButtonElement>('[data-qc-item]')]
    expect(rows.map((row) => row.textContent)).toEqual(['Bar', 'Date…', 'First available date', 'Random bar'])
    expect(rows.map((row) => row.getAttribute('aria-checked'))).toEqual(['false', 'true', null, null])
  })

  it('Date… asks for a moment in the loaded window, and Select starts replay there through the start command', () => {
    const { root, chart } = mount()
    root.querySelector<HTMLButtonElement>('button[aria-label="Select starting point"]')!.click()
    const date = [...root.querySelectorAll<HTMLButtonElement>('.qc-menu-panel [data-qc-item]')].find((row) => row.textContent === 'Date…')!
    date.click()
    // The question stays open while the dialog asks it: its backdrop takes every press meanwhile.
    expect(chart.calls).not.toContain('replay:disarm')
    expect(chart.handle.replay.phase()).toBe('arming')
    const dialog = root.querySelector<HTMLElement>('[data-role="replay-date"]')!
    expect(dialog).not.toBeNull()
    // The loaded window is 120 one-minute bars from 22:13:20 UTC on 14 November 2023, past midnight
    // into the 15th, which the dialog opens on.
    const field = dialog.querySelector<HTMLInputElement>('.qc-date-field')!
    expect(field.value).toBe('2023-11-15')
    const open = [...dialog.querySelectorAll<HTMLButtonElement>('.qc-date-day:not([disabled])')]
    expect(open.map((day) => day.textContent)).toEqual(['14', '15'])
    open[0]!.click()
    const time = dialog.querySelector<HTMLInputElement>('.qc-date-time')!
    time.value = '22:30'
    time.dispatchEvent(new Event('input', { bubbles: true }))
    dialog.querySelector<HTMLButtonElement>('button[aria-label="Select"]')!.click()
    expect(chart.calls.at(-1)).toBe(`replay:start:${Date.UTC(2023, 10, 14, 22, 30) / 1000}`)
    expect(root.querySelector('[data-role="replay-date"]')).toBeNull()
  })

  it('on entry, the date dialog leaves replay asking: Cancel and Escape close the dialog alone, and the next Escape withdraws the question', () => {
    const { root, chart } = mount({ entry: true })
    expect(chart.handle.replay.phase()).toBe('arming')
    const openDate = (): HTMLElement => {
      root.querySelector<HTMLButtonElement>('button[aria-label="Select starting point"]')!.click()
      ;[...root.querySelectorAll<HTMLButtonElement>('.qc-menu-panel [data-qc-item]')].find((row) => row.textContent === 'Date…')!.click()
      return root.querySelector<HTMLElement>('[data-role="replay-date"]')!
    }
    // The session never leaves the question while the dialog is up, so the chrome keeps the row.
    openDate().querySelector<HTMLButtonElement>('button[aria-label="Cancel"]')!.click()
    expect(root.querySelector('[data-role="replay-date"]')).toBeNull()
    expect(chart.handle.replay.phase()).toBe('arming')
    expect(chart.calls).not.toContain('replay:disarm')
    // Escape answers the dialog over the plot first.
    openDate()
    press(document.activeElement ?? document.body, 'Escape')
    expect(root.querySelector('[data-role="replay-date"]')).toBeNull()
    expect(chart.handle.replay.phase()).toBe('arming')
    expect(root.querySelector<HTMLButtonElement>('.qc-replay-start')!.getAttribute('aria-pressed')).toBe('true')
    press(document.body, 'Escape')
    expect(chart.calls).toContain('replay:disarm')
  })

  it('the first available date asks the chart to walk back and start there, through its command', () => {
    const { root, chart } = mount()
    root.querySelector<HTMLButtonElement>('button[aria-label="Select starting point"]')!.click()
    const first = [...root.querySelectorAll<HTMLButtonElement>('.qc-menu-panel [data-qc-item]')].find((r) => r.textContent === 'First available date')!
    first.click()
    expect(chart.calls).toContain('replay:first')
    expect(root.querySelector('.qc-menu-panel')).toBeNull()
  })
})

describe('the reserved row', () => {
  it('is placed by its host between the charts grid and the bottom band, never inside the overlay layer', () => {
    const { root, chrome, bar } = mount()
    expect([...root.children].map((node) => node.className)).toEqual(['qc-panes', 'qc-replay', 'qc-bottombar', 'qc-overlays'])
    expect(chrome.querySelector('.qc-replay')).toBeNull()
    expect(bar.element.closest('.qc-panes')).toBeNull()
    expect(bar.element.style.position).toBe('')
    expect(bar.element.getAttribute('style')).toBeNull()
  })

  it('mounts detached, so nothing but its host decides where the transport lives', () => {
    const chart = fakeChart()
    const w = fakeWidget({ chart })
    chart.handle.replay.start()
    const chrome = document.createElement('div')
    document.body.appendChild(chrome)
    const bar = mountReplayTransport({ chrome, i18n: w.i18n, icons: w.icons, commands: w.commands, handle: chart.handle, bars: () => chart.bars, intraday: () => true })
    cleanup.push(() => (bar.destroy(), w.dispose()))
    expect(bar.element.parentNode).toBeNull()
    expect(chrome.querySelector('.qc-replay')).toBeNull()
  })

  it('draws its transport marks on the 28 grid and pins Exit at the strip\'s far edge', () => {
    const { root } = mount()
    const strip = root.querySelector('.qc-replay-command-strip')!
    expect([...strip.children].map((node) => node.className)).toEqual(['qc-replay-controls', 'qc-button qc-toolbar-button qc-replay-exit'])
    // Every control is a toolbar cell, so the row takes the bar's hover, press and rest states.
    expect([...root.querySelectorAll('.qc-replay button')].every((b) => b.classList.contains('qc-toolbar-button'))).toBe(true)
    const sizes = (selector: string): string[] =>
      [...root.querySelectorAll<HTMLElement>(selector)].map((mark) => mark.querySelector('svg')!.getAttribute('width')!)
    expect(sizes('.qc-replay-controls .qc-toolbar-button:not(.qc-replay-caret) .qc-icon')).toEqual(['28', '28', '28', '28', '28'])
    // The caret is the pickers' wide mark at half size on its own 16 by 8 grid, and the close is
    // the hairline cross on its own 17 grid.
    expect(sizes('.qc-replay-caret .qc-icon')).toEqual(['8'])
    expect(root.querySelector('.qc-replay-caret svg')!.getAttribute('viewBox')).toBe('0 0 16 8')
    expect(sizes('.qc-replay-exit .qc-icon')).toEqual(['17'])
    expect(root.querySelector('.qc-replay-exit svg')!.getAttribute('viewBox')).toBe('0 0 17 17')
  })

  it('anchors every flyout to its own control in the overlay layer, above the row', () => {
    const { root, chrome } = mount()
    for (const label of ['Select starting point', 'Replay speed', 'Update timeframe']) {
      const trigger = root.querySelector<HTMLButtonElement>(`.qc-replay button[aria-label="${label}"]`)!
      trigger.click()
      const panel = chrome.querySelector<HTMLElement>('.qc-menu-panel')!
      expect(panel).not.toBeNull()
      expect(panel.closest('.qc-replay')).toBeNull()
      expect(trigger.getAttribute('aria-expanded')).toBe('true')
      expect(trigger.getAttribute('aria-haspopup')).toBe('menu')
      // Placed in the overlay layer's own coordinates against the row's control, so the panel
      // clears the widget's foot rather than being clipped by the row's own scroller.
      expect(panel.parentElement).toBe(chrome)
      expect(panel.style.left).not.toBe('')
      expect(panel.style.top).not.toBe('')
      trigger.click()
    }
  })
})

describe('the transport at teardown', () => {
  it('closes the menus and the date dialog it opened, so nothing survives in the widget subtree', () => {
    const { root, bar } = mount()
    root.querySelector<HTMLButtonElement>('button[aria-label="Replay speed"]')!.click()
    expect(root.querySelector('.qc-menu-panel')).not.toBeNull()
    bar.destroy()
    expect(root.querySelector('.qc-menu-panel')).toBeNull()
    expect(root.querySelector('.qc-replay')).toBeNull()
  })

  it('takes the date dialog with it at once, its time list included', () => {
    const { root, bar } = mount()
    root.querySelector<HTMLButtonElement>('button[aria-label="Select starting point"]')!.click()
    ;[...root.querySelectorAll<HTMLButtonElement>('.qc-menu-panel [data-qc-item]')].find((row) => row.textContent === 'Date…')!.click()
    root.querySelector<HTMLButtonElement>('[data-role="replay-date"] button[aria-label="Choose a time"]')!.click()
    expect(root.querySelector('.qc-date-times')).not.toBeNull()
    bar.destroy({ animate: true })
    expect(root.querySelector('[data-role="replay-date"]')).toBeNull()
    expect(root.querySelector('.qc-date-times')).toBeNull()
  })
})

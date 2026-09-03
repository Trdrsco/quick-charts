// @vitest-environment happy-dom
// The replay transport: its controls read the replay state and route every press through a
// command, the starting point arms a chart click, the speed and interval menus set through
// commands, and the date picker's arithmetic is exact.
import { afterEach, describe, expect, it } from 'vitest'
import { intervalWords, mountReplayTransport, speedWords } from '../../src/ui/chrome/replayBar'
import { openDatePicker, parseTimeOfDay, parseYmd, ymd } from '../../src/ui/chrome/datePicker'
import { buttonNames, fakeChart, fakeWidget, press } from './harness'

let cleanup: (() => void)[] = []
afterEach(() => {
  for (const fn of cleanup.splice(0)) fn()
  document.body.replaceChildren()
})

function mount(options: { access?: (id: string) => boolean } = {}) {
  const chart = fakeChart()
  const w = fakeWidget({ chart, access: options.access ? { command: options.access } : undefined })
  chart.handle.replay.start()
  const chrome = document.createElement('div')
  document.body.appendChild(chrome)
  const bar = mountReplayTransport({ chrome, i18n: w.i18n, commands: w.commands, handle: chart.handle, bars: () => chart.bars, intraday: () => true })
  cleanup.push(() => (bar.destroy(), w.dispose()))
  return { w, chart, chrome, bar }
}

describe('the replay bar', () => {
  it('is a toolbar carrying the starting point, the transport, the menus, the counter and exit', () => {
    const { chrome } = mount()
    const bar = chrome.querySelector('.qc-replay')!
    expect(bar.getAttribute('role')).toBe('toolbar')
    expect(buttonNames(bar)).toEqual(['Select bar', 'Select starting point', 'Step back one bar', 'Play', 'Step forward one bar', 'Replay speed', 'Update interval', 'Jump to the live edge', 'Exit replay'])
    expect(bar.querySelector('.qc-replay-position')!.textContent).toBe('91 of 120')
    expect(bar.querySelector('.qc-replay-speed .qc-button-text')!.textContent).toBe('10x')
    expect(bar.querySelector('.qc-replay-interval .qc-button-text')!.textContent).toBe('Auto')
  })

  it('routes the transport through commands and flips play to pause', () => {
    const { chrome, chart, bar } = mount()
    const byName = (label: string): HTMLButtonElement => chrome.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!
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
    const { chrome, chart } = mount({ access: (id) => id !== 'chart.replay.stepForward' })
    const step = chrome.querySelector<HTMLButtonElement>('button[aria-label="Step forward one bar"]')!
    expect(step.disabled).toBe(true)
    step.click()
    expect(chart.calls).not.toContain('replay:stepForward')
  })

  it('Select bar arms a chart click that restarts replay at the clicked moment; Escape disarms', () => {
    const { chrome, chart } = mount()
    const start = chrome.querySelector<HTMLButtonElement>('button[aria-label="Select bar"]')!
    start.click()
    expect(start.getAttribute('aria-pressed')).toBe('true')
    expect(chrome.querySelector<HTMLElement>('.qc-replay-hint')!.hidden).toBe(false)
    press(document.body, 'Escape')
    expect(start.getAttribute('aria-pressed')).toBe('false')
    start.click()
    chart.clickTime(1_700_000_600)
    expect(chart.calls.slice(-2)).toEqual(['replay:exit', 'replay:start:1700000600'])
  })

  it('the speed menu lists every speed with its words and sets through the command', () => {
    const { chrome, chart, w } = mount()
    chrome.querySelector<HTMLButtonElement>('button[aria-label="Replay speed"]')!.click()
    const rows = [...chrome.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')]
    expect(rows.length).toBe(9)
    expect(rows[0]!.textContent).toContain('10x')
    expect(rows[0]!.getAttribute('aria-checked')).toBe('true')
    rows[4]!.click()
    expect(chart.calls).toContain('replay:speed:1')
    expect(speedWords(w.i18n.t, 3)).toBe('3 updates per second')
    expect(speedWords(w.i18n.t, 0.2)).toBe('1 update per 5 seconds')
  })

  it('the interval menu lists the finer grains and the auto switch, each through the command', () => {
    const { chrome, chart, w } = mount()
    chrome.querySelector<HTMLButtonElement>('button[aria-label="Update interval"]')!.click()
    const panel = chrome.querySelector<HTMLElement>('.qc-menu-panel')!
    const rows = [...panel.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')]
    expect(rows.map((r) => r.textContent)).toEqual(['1 Minute', '5 Minutes', '15 Minutes'])
    rows[1]!.click()
    expect(chart.calls).toContain('replay:interval:5m')
    chrome.querySelector<HTMLButtonElement>('button[aria-label="Update interval"]')!.click()
    const auto = chrome.querySelector<HTMLButtonElement>('[role="switch"]')!
    expect(auto.getAttribute('aria-checked')).toBe('false')
    auto.click()
    expect(chart.calls).toContain('replay:interval:auto')
    expect(intervalWords(w.i18n.t, '1h')).toBe('1 Hour')
  })

  it('the starting-point menu offers bar, date and random; random restarts inside the loaded window', () => {
    const { chrome, chart } = mount()
    chrome.querySelector<HTMLButtonElement>('button[aria-label="Select starting point"]')!.click()
    const rows = [...chrome.querySelectorAll<HTMLButtonElement>('.qc-menu-panel [data-qc-item]')]
    expect(rows.map((r) => r.textContent)).toEqual(['Bar', 'Date', 'Random bar'])
    rows[2]!.click()
    const last = chart.calls[chart.calls.length - 1]!
    expect(last).toMatch(/^replay:start:\d+$/)
    const at = Number(last.slice('replay:start:'.length))
    expect(at).toBeGreaterThanOrEqual(chart.bars[2]!.t)
    expect(at).toBeLessThanOrEqual(chart.bars[chart.bars.length - 1]!.t)
  })
})

describe('the date picker', () => {
  it('reads and writes UTC dates and times exactly', () => {
    expect(ymd(0)).toBe('1970-01-01')
    expect(parseYmd('2026-03-01')).toBe(Date.UTC(2026, 2, 1) / 1000)
    expect(parseYmd('2026-3-1')).toBeNull()
    expect(parseTimeOfDay('09:30')).toBe(34_200)
    expect(parseTimeOfDay('')).toBe(0)
    expect(parseTimeOfDay('25:99')).toBe(1439 * 60)
  })

  it('opens on the last loaded day, disables days outside the window, and selects date plus time', () => {
    const w = fakeWidget()
    cleanup.push(() => w.dispose())
    const picked: number[] = []
    const minSec = Date.UTC(2026, 1, 10) / 1000
    const maxSec = Date.UTC(2026, 1, 20) / 1000
    const dialog = openDatePicker({ host: w.overlays, i18n: w.i18n, minSec, maxSec, withTime: true, onSelect: (at) => picked.push(at) })
    const field = dialog.element.querySelector<HTMLInputElement>('.qc-date-field')!
    expect(field.value).toBe('2026-02-20')
    const days = [...dialog.element.querySelectorAll<HTMLButtonElement>('.qc-date-day')]
    expect(days.length).toBe(28)
    expect(days[0]!.disabled).toBe(true) // the 1st is outside the window
    expect(days[14]!.disabled).toBe(false)
    days[14]!.click()
    expect(field.value).toBe('2026-02-15')
    const time = dialog.element.querySelector<HTMLInputElement>('.qc-date-time')!
    time.value = '09:30'
    time.dispatchEvent(new Event('input'))
    dialog.element.querySelector<HTMLButtonElement>('button[aria-label="Select"]')!.click()
    expect(picked).toEqual([Date.UTC(2026, 1, 15, 9, 30) / 1000])
    expect(dialog.open()).toBe(false)
  })
})

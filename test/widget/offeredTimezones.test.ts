// @vitest-environment happy-dom
// The display timezones a host offers, on a widget mounted the way a host mounts it. A host that
// names no list gets every zone and the exchange choice; a list it names is the whole set its charts
// can display in, so a choice left out has no command, the setters ignore it, and the picker lists
// no row for it. A stored or preferred choice outside the list opens on the first listed and stays
// stored until the viewer chooses. One choice leaves no picker, and the clock still reads that zone.
// The exported registry is never filtered. A list the host got wrong is a setup error.
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ChartDatafeed, FeedBar } from '../../src/datafeed'
import { createChartI18n } from '../../src/i18n'
import { memoryChartStorage } from '../../src/storage'
import { EXCHANGE_TIMEZONE, isTimezoneChoice, timezoneListing, TIMEZONES } from '../../src/timezones'
import { createChart, type ChartWidget } from '../../src/widget/create'
import type { ChartWidgetOptions } from '../../src/widget/options'

vi.mock('lightweight-charts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('lightweight-charts')>()
  const { createFakeChart } = await import('./rendererFake')
  return { ...actual, createChart: createFakeChart }
})

const bars: FeedBar[] = Array.from({ length: 40 }, (_, index) => ({ t: 1_700_000_000 + index * 60, o: 100 + index, h: 101 + index, l: 99 + index, c: 100 + index, v: 10 }))
const datafeed: ChartDatafeed = {
  search: async () => ({ hits: [], hasMore: false }),
  resolve: async () => null,
  history: async () => ({ bars, noData: false }),
  subscribeBars: () => () => undefined,
}

const mounted: ChartWidget[] = []
afterEach(() => {
  for (const widget of mounted.splice(0)) widget.dispose()
  document.body.replaceChildren()
})

const settle = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0))
}

function mount(options: Partial<ChartWidgetOptions> = {}) {
  const container = document.body.appendChild(document.createElement('div'))
  const widget = createChart({ container, datafeed, symbol: 'ES', timeframe: '1m', features: { sessions: false, compare: false }, ...options })
  mounted.push(widget)
  return { widget, container }
}

const TIMEZONE_KEY = 'quickcharts.timezone.v1'
const zoneCommands = (widget: ChartWidget): string[] =>
  widget.commands.list().map((spec) => spec.id).filter((id) => id.startsWith('chart.timezone.') && id !== 'chart.timezone.set')
/** Open the timezone picker and read its rows, then close it. */
function pickerRows(container: HTMLElement): string[] {
  const trigger = container.querySelector<HTMLButtonElement>('.qc-bottombar .qc-tz-trigger')!
  trigger.click()
  const rows = [...document.querySelectorAll<HTMLElement>('.qc-tz-menu [role="option"]')].map((row) => row.textContent ?? '')
  trigger.click()
  return rows
}
const pick = (container: HTMLElement, text: string): void => {
  container.querySelector<HTMLButtonElement>('.qc-bottombar .qc-tz-trigger')!.click()
  ;[...document.querySelectorAll<HTMLElement>('.qc-tz-menu [role="option"]')].find((row) => row.textContent?.includes(text))!.click()
}

describe('timezones: setup', () => {
  it('is a setup error for a non-list, an empty list, an id that names no zone and a repeated id', () => {
    expect(() => mount({ timezones: 'Etc/UTC' as never })).toThrow(TypeError)
    expect(() => mount({ timezones: [] })).toThrow(/at least one timezone choice/)
    expect(() => mount({ timezones: ['Etc/UTC', 'Mars/Olympus'] })).toThrow(/"Mars\/Olympus", which is not a timezone choice/)
    expect(() => mount({ timezones: ['Exchange'] })).toThrow(/"Exchange"/)
    expect(() => mount({ timezones: [3 as never] })).toThrow(TypeError)
    expect(() => mount({ timezones: ['exchange', 'Asia/Tokyo', 'exchange'] })).toThrow(/"exchange" more than once/)
    expect(() => mount({ timezones: [], ui: { bottomBar: false } })).toThrow(TypeError)
  })

  it('is no setup error for a preferred zone outside the list, which opens on the first listed', async () => {
    const { widget } = mount({ timezones: ['Asia/Tokyo', 'Europe/London'], preferences: { timezone: 'America/Chicago' } })
    await settle()
    expect(widget.activeChart().timezone()).toBe('Asia/Tokyo')
  })

  it('offers every zone and the exchange choice when omitted, as before', async () => {
    const { widget, container } = mount()
    await settle()
    expect(zoneCommands(widget)).toHaveLength(TIMEZONES.length + 1)
    expect(pickerRows(container)).toHaveLength(TIMEZONES.length + 1)
    expect(widget.activeChart().timezone()).toBe('Etc/UTC')
  })
})

describe('the timezones a widget offers', () => {
  it('are the list the host names: commands and picker rows follow it, the picker in its own order', async () => {
    const { widget, container } = mount({ timezones: ['Europe/London', EXCHANGE_TIMEZONE, 'America/New_York'] })
    await settle()
    expect(zoneCommands(widget).sort()).toEqual(['chart.timezone.America/New_York', 'chart.timezone.Europe/London', 'chart.timezone.exchange'])
    const rows = pickerRows(container)
    expect(rows).toHaveLength(3)
    expect(rows[0]).toContain('Exchange')
    expect(rows[1]).toContain('New York')
    expect(rows[2]).toContain('London')
    expect(widget.commands.execute('chart.timezone.Asia/Tokyo').kind).toBe('unknown')
  })

  it('make the setters ignore a choice left out', async () => {
    const { widget } = mount({ timezones: ['America/New_York', 'Europe/London'] })
    await settle()
    const chart = widget.activeChart()
    expect(chart.timezone()).toBe('America/New_York')
    widget.commands.execute('chart.timezone.set', 'Asia/Tokyo')
    chart.setTimezone(EXCHANGE_TIMEZONE)
    chart.setTimezone('Etc/UTC')
    expect(chart.timezone()).toBe('America/New_York')
    expect(widget.commands.execute('chart.timezone.exchange').kind).toBe('unknown')
    widget.commands.execute('chart.timezone.set', 'Europe/London')
    expect(chart.timezone()).toBe('Europe/London')
  })

  it('open a stored choice left out on the first listed, and keep it stored until the viewer chooses', async () => {
    const storage = memoryChartStorage({ [TIMEZONE_KEY]: 'Asia/Tokyo' })
    const { widget, container } = mount({ timezones: ['America/New_York', 'Europe/London'], storage })
    await settle()
    expect(widget.activeChart().timezone()).toBe('America/New_York')
    expect(widget.activeChart().displayTimezone()).toBe('America/New_York')
    expect(storage.get(TIMEZONE_KEY)).toBe('Asia/Tokyo')
    pick(container, 'London')
    expect(widget.activeChart().timezone()).toBe('Europe/London')
    expect(storage.get(TIMEZONE_KEY)).toBe('Europe/London')
  })

  it('open a stored or preferred choice the list offers on that choice', async () => {
    const stored = mount({ timezones: ['America/New_York', 'Europe/London'], storage: memoryChartStorage({ [TIMEZONE_KEY]: 'Europe/London' }) })
    const preferred = mount({ timezones: ['America/New_York', 'Europe/London'], preferences: { timezone: 'Europe/London' } })
    await settle()
    expect(stored.widget.activeChart().timezone()).toBe('Europe/London')
    expect(preferred.widget.activeChart().timezone()).toBe('Europe/London')
  })

  it('leave no picker for one choice, and the clock reads that zone', async () => {
    const { widget, container } = mount({ timezones: ['Asia/Tokyo'] })
    await settle()
    expect(widget.activeChart().timezone()).toBe('Asia/Tokyo')
    expect(container.querySelector('.qc-bottombar .qc-tz-trigger')).toBeNull()
    const face = container.querySelector<HTMLElement>('.qc-bottombar .qc-tz-clock')!
    expect(face).not.toBeNull()
    expect(face.querySelector('.qc-clock-offset')!.textContent).toBe('UTC+9')
    expect(face.querySelector('.qc-clock')!.textContent).toMatch(/^\d\d:\d\d:\d\d$/)
    // The range chips and the commands the one choice has are still there.
    expect(container.querySelectorAll('.qc-range-chip').length).toBeGreaterThan(0)
    expect(zoneCommands(widget)).toEqual(['chart.timezone.Asia/Tokyo'])
  })

  it('keep the picker for two choices', async () => {
    const { container } = mount({ timezones: ['Asia/Tokyo', EXCHANGE_TIMEZONE] })
    await settle()
    expect(container.querySelector('.qc-bottombar .qc-tz-clock')).toBeNull()
    expect(pickerRows(container)).toHaveLength(2)
  })

  it('leave the exported registry unfiltered', async () => {
    mount({ timezones: ['Asia/Tokyo', 'Europe/London'] })
    await settle()
    expect(TIMEZONES).toHaveLength(60)
    expect(isTimezoneChoice('Europe/Paris')).toBe(true)
    expect(timezoneListing(createChartI18n().t)).toHaveLength(TIMEZONES.length + 1)
  })
})

// @vitest-environment happy-dom
// The replay date picker: the Select date dialog's parts and their states, a pick that only moves
// the choice while Select applies it, the chip that moves the choice to the first available moment,
// the heading that turns the days into months and years, the keyboard over the days, the time list,
// the title that carries the dialog, and the exact UTC arithmetic under all of it.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { hhmm, openDatePicker, parseTimeOfDay, parseYmd, ymd } from '../../src/ui/chrome/datePicker'
import { fakeWidget, press } from './harness'

/** Epoch seconds of a UTC moment, its month counted from 1. */
const at = (year: number, month: number, day: number, hour = 0, minute = 0): number => Date.UTC(year, month - 1, day, hour, minute) / 1000

/** The loaded window: from 14 September 2026 at 13:30 to 8 October 2026 at 15:00, so the dialog
 *  opens on October 2026 as the reference's does, on a chart whose first bar is mid-afternoon. */
const FIRST = at(2026, 9, 14, 13, 30)
const LAST = at(2026, 10, 8, 15, 0)

const cleanup: (() => void)[] = []
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(Date.UTC(2026, 9, 8, 19, 39)))
})
afterEach(() => {
  for (const fn of cleanup.splice(0)) fn()
  vi.useRealTimers()
  document.body.replaceChildren()
})

function open(options: { withTime?: boolean } = {}) {
  const w = fakeWidget()
  const picked: number[] = []
  const closed: true[] = []
  const dialog = openDatePicker({ host: w.overlays, i18n: w.i18n, icons: w.icons, minSec: FIRST, maxSec: LAST, withTime: options.withTime ?? true, onSelect: (sec) => picked.push(sec), onClose: () => closed.push(true) })
  cleanup.push(() => {
    dialog.close({ animate: false })
    w.dispose()
  })
  const box = dialog.element
  const named = (label: string): HTMLButtonElement => {
    const found = box.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
    if (!found) throw new Error(`no button named ${label}`)
    return found
  }
  const days = (): HTMLButtonElement[] => [...box.querySelectorAll<HTMLButtonElement>('.qc-date-day')]
  const day = (date: number): HTMLButtonElement => days().find((d) => d.textContent === String(date))!
  const cells = (): HTMLButtonElement[] => [...box.querySelectorAll<HTMLButtonElement>('.qc-date-cell')]
  const dateField = box.querySelector<HTMLInputElement>('.qc-date-field')!
  const timeField = box.querySelector<HTMLInputElement>('.qc-date-time')
  const heading = box.querySelector<HTMLButtonElement>('.qc-date-heading')!
  const band = (): string[] => [...box.querySelectorAll('.qc-date-band > span')].map((s) => s.textContent ?? '')
  const scrim = box.closest<HTMLElement>('.qc-dialog-scrim')!
  const type = (field: HTMLInputElement, value: string): void => {
    field.value = value
    field.dispatchEvent(new Event('input', { bubbles: true }))
  }
  return { w, dialog, box, scrim, picked, closed, named, days, day, cells, dateField, timeField, heading, band, type }
}

describe('the UTC arithmetic', () => {
  it('reads and writes dates and times exactly, and refuses a date the calendar does not have', () => {
    expect(ymd(0)).toBe('1970-01-01')
    expect(ymd(LAST)).toBe('2026-10-08')
    expect(hhmm(FIRST)).toBe('13:30')
    expect(parseYmd('2026-03-01')).toBe(Date.UTC(2026, 2, 1) / 1000)
    expect(parseYmd(' 2026-03-01 ')).toBe(Date.UTC(2026, 2, 1) / 1000)
    expect(parseYmd('2026-3-1')).toBeNull()
    expect(parseYmd('2026-02-30')).toBeNull()
    expect(parseYmd('2026-13-01')).toBeNull()
    expect(parseTimeOfDay('09:30')).toBe(34_200)
    expect(parseTimeOfDay('')).toBe(0)
    expect(parseTimeOfDay('25:99')).toBe(1439 * 60)
  })
})

describe('the Select date dialog', () => {
  it('stands over the undimmed chart at once, titled and closable, with the keyboard in its date field', () => {
    const { box, scrim, named, dateField, timeField } = open()
    expect(scrim.dataset.qcVeil).toBe('none')
    expect(scrim.dataset.state).toBeUndefined()
    expect(box.getAttribute('role')).toBe('dialog')
    expect(box.getAttribute('aria-label')).toBe('Select date')
    expect(box.dataset.role).toBe('replay-date')
    expect(box.style.width).toBe('302px')
    expect(box.querySelector('.qc-date-title')!.textContent).toBe('Select date')
    expect(named('Close').classList.contains('qc-dialog-close')).toBe(true)
    // The date opens on the last available day, focused; the time opens at midnight.
    expect(document.activeElement).toBe(dateField)
    expect(dateField.value).toBe('2026-10-08')
    expect(dateField.placeholder).toBe('YYYY-MM-DD')
    expect(timeField!.value).toBe('00:00')
    expect(timeField!.getAttribute('role')).toBe('combobox')
    expect(timeField!.getAttribute('aria-expanded')).toBe('false')
    expect(named('Choose a time').getAttribute('tabindex')).toBe('-1')
    // The footer: Cancel then Select, after the chip.
    expect(box.querySelector('.qc-date-first')!.textContent).toBe('Select the first available day')
    expect([...box.querySelectorAll('.qc-date-footer button')].map((b) => b.getAttribute('aria-label'))).toEqual(['Cancel', 'Select'])
  })

  it('offers no time on a chart that is not intraday, and applies the chosen day itself', () => {
    const { box, picked, named } = open({ withTime: false })
    expect(box.querySelector('.qc-date-time')).toBeNull()
    expect(box.querySelector('.qc-date-clock')).toBeNull()
    named('Select').click()
    expect(picked).toEqual([at(2026, 10, 8)])
  })

  it('lays out one month with no day of another, the first week against the end and the last against the start', () => {
    const { box, heading, band, days } = open()
    expect(heading.textContent).toBe('October 2026')
    expect(heading.getAttribute('aria-label')).toBe('Switch to months, 2026')
    expect(band()).toEqual(['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'])
    expect(days().map((d) => d.textContent)).toEqual(Array.from({ length: 31 }, (_, i) => String(i + 1)))
    // Every cell of the grid is a day of the month: no padding, no spill from September or November.
    expect(box.querySelectorAll('[role="grid"] [role="gridcell"]')).toHaveLength(31)
    expect([...box.querySelectorAll('.qc-date-week')].map((row) => row.childElementCount)).toEqual([4, 7, 7, 7, 6])
    expect(box.querySelector('.qc-date-week')!.firstElementChild!.getAttribute('aria-label')).toBe('Thursday, October 1, 2026')
  })

  it('enables the days the window covers, marks the chosen day and today, and turns no page past the window', () => {
    const { named, days, day } = open()
    expect(days().filter((d) => !d.disabled).map((d) => d.textContent)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8'])
    expect(day(8).getAttribute('aria-selected')).toBe('true')
    expect(day(8).getAttribute('aria-current')).toBe('date')
    expect(days().filter((d) => d.hasAttribute('aria-current'))).toHaveLength(1)
    expect(named('Next month, November 2026').disabled).toBe(true)
    named('Previous month, September 2026').click()
    // The window opens on the 14th at 13:30, so the 14th is the first day that can be chosen.
    expect(days().filter((d) => !d.disabled).map((d) => d.textContent)).toEqual(Array.from({ length: 17 }, (_, i) => String(i + 14)))
    expect(named('Previous month, August 2026').disabled).toBe(true)
    expect(named('Next month, October 2026').disabled).toBe(false)
  })

  it('picking a day only moves the choice: the dialog stays up and the field follows', () => {
    const { dialog, picked, dateField, day } = open()
    day(5).click()
    expect(dialog.open()).toBe(true)
    expect(picked).toEqual([])
    expect(dateField.value).toBe('2026-10-05')
    expect(day(5).getAttribute('aria-selected')).toBe('true')
    expect(day(8).getAttribute('aria-selected')).toBe('false')
    // Today keeps its mark, and the keyboard stands on the day just picked.
    expect(day(8).getAttribute('aria-current')).toBe('date')
    expect(document.activeElement).toBe(day(5))
    expect(day(5).getAttribute('tabindex')).toBe('0')
  })

  it('Select applies the day and the time and closes; Cancel and the close apply nothing', () => {
    const first = open()
    first.day(5).click()
    first.type(first.timeField!, '09:30')
    first.named('Select').click()
    expect(first.picked).toEqual([at(2026, 10, 5, 9, 30)])
    expect(first.closed).toEqual([true])

    const second = open()
    second.named('Cancel').click()
    expect(second.picked).toEqual([])
    expect(second.closed).toEqual([true])

    const third = open()
    third.named('Close').click()
    expect(third.picked).toEqual([])
    expect(third.closed).toEqual([true])
  })

  it('the chip moves the choice to the first available moment and shows its month, applying nothing', () => {
    const { dialog, picked, dateField, timeField, heading, day, named, box } = open()
    box.querySelector<HTMLButtonElement>('.qc-date-first')!.click()
    expect(dialog.open()).toBe(true)
    expect(picked).toEqual([])
    expect(dateField.value).toBe('2026-09-14')
    expect(timeField!.value).toBe('13:30')
    expect(heading.textContent).toBe('September 2026')
    expect(day(14).getAttribute('aria-selected')).toBe('true')
    expect(named('Previous month, August 2026').disabled).toBe(true)
    named('Select').click()
    expect(picked).toEqual([FIRST])
  })

  it('the heading turns the days into the months of the year, the months into a score of years, and back', () => {
    const { heading, band, cells, named, days } = open()
    heading.click()
    expect(band()).toEqual(['Months'])
    expect(heading.textContent).toBe('2026')
    expect(heading.getAttribute('aria-label')).toBe('Switch to years, 2020 - 2039')
    expect(cells().map((c) => c.textContent)).toEqual(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'])
    expect(cells().filter((c) => c.getAttribute('aria-selected') === 'true').map((c) => c.getAttribute('aria-label'))).toEqual(['October 2026'])
    expect(cells().filter((c) => !c.disabled).map((c) => c.textContent)).toEqual(['Sep', 'Oct'])
    expect(named('Previous year, 2025').disabled).toBe(true)
    expect(named('Next year, 2027').disabled).toBe(true)

    heading.click()
    expect(band()).toEqual(['Years'])
    expect(heading.textContent).toBe('2020 - 2039')
    expect(heading.getAttribute('aria-label')).toBe('Switch to dates, October 2026')
    expect(cells().map((c) => c.textContent)).toEqual(Array.from({ length: 20 }, (_, i) => String(2020 + i)))
    expect(cells().filter((c) => !c.disabled).map((c) => c.textContent)).toEqual(['2026'])
    expect(cells().find((c) => c.textContent === '2026')!.getAttribute('aria-selected')).toBe('true')
    expect(named('Previous years, 2000 - 2019').disabled).toBe(true)
    expect(named('Next years, 2040 - 2059').disabled).toBe(true)

    heading.click()
    expect(heading.textContent).toBe('October 2026')
    expect(days()).toHaveLength(31)

    // A year opens its months, and a month its days, the choice unmoved.
    heading.click()
    heading.click()
    cells().find((c) => c.textContent === '2026')!.click()
    expect(heading.textContent).toBe('2026')
    cells().find((c) => c.textContent === 'Sep')!.click()
    expect(heading.textContent).toBe('September 2026')
    expect(days()).toHaveLength(30)
  })

  it('a date typed in full turns the calendar to it, and Enter in the field applies what the fields say', () => {
    const { dateField, heading, day, named, type, picked } = open()
    type(dateField, '2026-09-20')
    expect(heading.textContent).toBe('September 2026')
    expect(day(20).getAttribute('aria-selected')).toBe('true')
    expect(named('Select').disabled).toBe(false)
    type(dateField, '2026-09-31')
    expect(named('Select').disabled).toBe(true)
    type(dateField, '2026-11-02')
    expect(heading.textContent).toBe('November 2026')
    expect(named('Select').disabled).toBe(true)
    type(dateField, '2026-09-20')
    press(dateField, 'Enter')
    expect(picked).toEqual([at(2026, 9, 20)])
  })
})

describe('the keyboard over the days', () => {
  it('the arrows walk days and weeks across the month, landing only on an available day', () => {
    const { day, heading } = open()
    day(1).focus()
    press(day(1), 'ArrowLeft')
    expect(heading.textContent).toBe('September 2026')
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Wednesday, September 30, 2026')
    press(document.activeElement!, 'ArrowRight')
    expect(heading.textContent).toBe('October 2026')
    expect(document.activeElement).toBe(day(1))
    press(day(1), 'ArrowDown')
    expect(document.activeElement).toBe(day(8))
    // The 15th is past the window, so the walk stops on its last day.
    press(day(8), 'ArrowDown')
    expect(document.activeElement).toBe(day(8))
    press(day(8), 'ArrowUp')
    expect(document.activeElement).toBe(day(1))
  })

  it('Page Up and Page Down turn a month, Home and End reach the ends of the month', () => {
    const { day, heading } = open()
    day(8).focus()
    // A month back is 8 September, before the window opens on the 14th.
    press(day(8), 'PageUp')
    expect(heading.textContent).toBe('September 2026')
    expect(document.activeElement).toBe(day(14))
    press(day(14), 'End')
    expect(document.activeElement).toBe(day(30))
    press(day(30), 'PageDown')
    expect(heading.textContent).toBe('October 2026')
    expect(document.activeElement).toBe(day(8))
    press(day(8), 'Home')
    expect(document.activeElement).toBe(day(1))
    press(day(1), 'End')
    expect(document.activeElement).toBe(day(8))
  })

  it('Enter picks the day the keyboard stands on, and Escape closes the dialog', () => {
    const { day, dateField, dialog, picked } = open()
    day(3).focus()
    press(day(3), 'Enter')
    expect(dateField.value).toBe('2026-10-03')
    expect(day(3).getAttribute('aria-selected')).toBe('true')
    expect(dialog.open()).toBe(true)
    press(document.activeElement!, 'Escape')
    expect(dialog.open()).toBe(false)
    expect(picked).toEqual([])
  })

  it('arrows walk the months and the years too, and Enter opens the one stood on', () => {
    const { heading, cells } = open()
    heading.click()
    const october = cells().find((c) => c.textContent === 'Oct')!
    expect(october.getAttribute('tabindex')).toBe('0')
    october.focus()
    press(october, 'ArrowLeft')
    expect(document.activeElement?.textContent).toBe('Sep')
    // Nothing before September can be chosen, so the walk stays on it.
    press(document.activeElement!, 'ArrowUp')
    expect(document.activeElement?.textContent).toBe('Sep')
    press(document.activeElement!, 'Enter')
    expect(heading.textContent).toBe('September 2026')
  })
})

describe('the time list', () => {
  it('the clock lists the day in quarter hours under the field, the chosen time heading it', () => {
    const { box, scrim, named, timeField } = open()
    named('Choose a time').click()
    const list = scrim.querySelector<HTMLElement>('[role="listbox"]')!
    expect(list).not.toBeNull()
    expect(box.contains(list)).toBe(false)
    expect(list.id).toBe(timeField!.getAttribute('aria-controls'))
    const options = [...list.querySelectorAll('[role="option"]')]
    expect(options).toHaveLength(96)
    expect(options[0]!.textContent).toBe('00:00')
    expect(options[1]!.textContent).toBe('00:15')
    expect(options[95]!.textContent).toBe('23:45')
    expect(options.filter((o) => o.getAttribute('aria-selected') === 'true').map((o) => o.textContent)).toEqual(['00:00'])
    expect(timeField!.getAttribute('aria-expanded')).toBe('true')
    expect(document.activeElement).toBe(timeField)
    // A second press on the clock leaves the list up.
    named('Choose a time').click()
    expect(scrim.querySelectorAll('[role="listbox"]')).toHaveLength(1)
  })

  it('a time pressed in the list fills the field and puts the list away', () => {
    const { scrim, named, timeField, picked, day } = open()
    named('Choose a time').click()
    const option = [...scrim.querySelectorAll<HTMLElement>('[role="option"]')].find((o) => o.textContent === '13:45')!
    option.click()
    expect(timeField!.value).toBe('13:45')
    expect(scrim.querySelector('[role="listbox"]')).toBeNull()
    expect(timeField!.getAttribute('aria-expanded')).toBe('false')
    day(6).click()
    named('Select').click()
    expect(picked).toEqual([at(2026, 10, 6, 13, 45)])
  })

  it('the arrows in the field open and walk the list, and Enter takes the time walked to', () => {
    const { scrim, timeField, type } = open()
    type(timeField!, '13:45')
    timeField!.focus()
    press(timeField!, 'ArrowDown')
    const list = scrim.querySelector<HTMLElement>('[role="listbox"]')!
    const active = (): string | null => list.querySelector(`#${CSS.escape(timeField!.getAttribute('aria-activedescendant') ?? '')}`)?.textContent ?? null
    expect(active()).toBe('13:45')
    press(timeField!, 'ArrowDown')
    press(timeField!, 'ArrowDown')
    expect(active()).toBe('14:15')
    press(timeField!, 'ArrowUp')
    expect(active()).toBe('14:00')
    press(timeField!, 'Enter')
    expect(timeField!.value).toBe('14:00')
    expect(scrim.querySelector('[role="listbox"]')).toBeNull()
  })

  it('Escape puts the list away before it closes the dialog, and a press elsewhere puts it away', () => {
    const { scrim, named, timeField, dialog, box } = open()
    named('Choose a time').click()
    press(timeField!, 'Escape')
    expect(scrim.querySelector('[role="listbox"]')).toBeNull()
    expect(dialog.open()).toBe(true)
    named('Choose a time').click()
    box.querySelector('.qc-date-title')!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }))
    expect(scrim.querySelector('[role="listbox"]')).toBeNull()
    press(timeField!, 'Escape')
    expect(dialog.open()).toBe(false)
  })
})

describe('the title', () => {
  it('carries the dialog, kept inside the viewport', () => {
    const { box } = open()
    const title = box.querySelector<HTMLElement>('.qc-date-title')!
    title.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: 100, clientY: 50 }))
    window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 300, clientY: 200 }))
    // The document lays nothing out here, so the box stands at the origin and the press is its offset.
    expect(box.style.position).toBe('fixed')
    expect(box.style.left).toBe('200px')
    expect(box.style.top).toBe('150px')
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
    window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 500, clientY: 400 }))
    expect(box.style.left).toBe('200px')
    // A move past the viewport's edge stops at it.
    title.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: 0, clientY: 0 }))
    window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: -500, clientY: -500 }))
    expect(box.style.left).toBe('0px')
    expect(box.style.top).toBe('0px')
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
  })
})

// The replay date picker: the dialog that names the moment replay starts from. It stands over the
// chart the viewer is choosing from without dimming it, appears and leaves at once, and its title is
// the handle it is carried by.
//
// Its parts, top to bottom: a date field that opens with the keyboard in it; on an intraday chart a
// time field whose clock lists the day in quarter hours; a calendar of one month whose heading turns
// it into the twelve months of its year and then the twenty years around it; a chip that moves the
// choice to the first available day; and Cancel and Select. Picking a day, a month, a year, a time
// or the first available day only moves the choice and the view: the dialog stays up, and Select is
// what applies it.
//
// A day is available when the loaded window covers any part of it, so the window's first bar is the
// first available moment. Replay starts at the first bar at or after the chosen instant, and a blank
// or unreadable time means the day's first bar. Every instant here is UTC, like the bars, and the
// calendar reads left to right in every language, as a calendar's columns do.
import type { ChartI18n, ChartMessageKey } from '../../i18n'
import { openDialog, type DialogHandle } from './dialog'
import { button, h, setDisabled, stopPointer } from './dom'
import { ICONS } from '../controls/icons'
import { ownsEscape, pushEscapeOwner } from '../controls/escape'
import { dragUntilRelease } from '../drawings/dom'
import type { IconResolver } from '../icons/resolver'

export interface DatePickerDeps {
  host: HTMLElement
  i18n: ChartI18n
  /** Draws every glyph: the host's drawing for its icon, or the chart's own. */
  icons: IconResolver
  /** The loaded window, epoch seconds: its first bar is the first moment replay can start from. */
  minSec: number
  maxSec: number
  /** Offer a time field. */
  withTime: boolean
  onSelect(atSec: number): void
  onClose?(): void
}

const DAY = 86_400
/** The year view shows a score of years: the twenty that hold the shown year. */
const YEAR_SPAN = 20
/** The time list walks the day in quarter hours. */
const TIME_STEP_MINUTES = 15

/** The calendar's column heads, Monday first. */
const WEEKDAYS: readonly ChartMessageKey[] = ['replay.weekdayMon', 'replay.weekdayTue', 'replay.weekdayWed', 'replay.weekdayThu', 'replay.weekdayFri', 'replay.weekdaySat', 'replay.weekdaySun']

/** What the calendar shows: the days of a month, the months of a year, or a score of years. */
type CalendarView = 'days' | 'months' | 'years'

/** Each open picker's time list takes ids of its own. */
let pickers = 0

/** 'YYYY-MM-DD' of a UTC instant. */
export function ymd(sec: number): string {
  const d = new Date(sec * 1000)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

/** 'HH:MM' of a UTC instant's time of day. */
export function hhmm(sec: number): string {
  const d = new Date(sec * 1000)
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

/** The UTC midnight a 'YYYY-MM-DD' names, or null when the text is not a date of the calendar. */
export function parseYmd(text: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text.trim())
  if (!m) return null
  const y = Number(m[1])
  const month = Number(m[2]) - 1
  const day = Number(m[3])
  const at = new Date(Date.UTC(y, month, day))
  if (at.getUTCFullYear() !== y || at.getUTCMonth() !== month || at.getUTCDate() !== day) return null
  return at.getTime() / 1000
}

/** Seconds past midnight from an 'HH:MM' field, or 0 when absent or unreadable. */
export function parseTimeOfDay(text: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(text.trim())
  if (!m) return 0
  return Math.min(1439, +m[1]! * 60 + +m[2]!) * 60
}

/** The UTC midnight of the day an instant falls on. */
const dayOf = (sec: number): number => Math.floor(sec / DAY) * DAY

/** The first instant of a month, the month counted past either end of its year. */
const monthStart = (year: number, month: number): number => Date.UTC(year, month, 1) / 1000

/** How many days a month has. */
const daysIn = (year: number, month: number): number => new Date(Date.UTC(year, month + 1, 0)).getUTCDate()

/** The day `months` months on from `day`, on the same date or its month's last. */
function addMonths(day: number, months: number): number {
  const d = new Date(day * 1000)
  const year = d.getUTCFullYear()
  const month = d.getUTCMonth() + months
  return Date.UTC(year, month, Math.min(d.getUTCDate(), daysIn(year, month))) / 1000
}

/** Arrows over a grid of cells: across by one, up and down by a row, Home and End to the ends,
 *  landing only on a cell that can be chosen. Answers the cell to focus, or null for any other key. */
function gridStep(cells: readonly HTMLButtonElement[], from: number, key: string, columns: number): HTMLButtonElement | null {
  const usable = (i: number): boolean => i >= 0 && i < cells.length && !cells[i]!.disabled
  const walk = (start: number, step: number): number => {
    for (let i = start; i >= 0 && i < cells.length; i += step) if (usable(i)) return i
    return -1
  }
  let to = -1
  if (key === 'ArrowRight') to = walk(from + 1, 1)
  else if (key === 'ArrowLeft') to = walk(from - 1, -1)
  else if (key === 'ArrowDown') to = walk(from + columns, columns)
  else if (key === 'ArrowUp') to = walk(from - columns, -columns)
  else if (key === 'Home') to = walk(0, 1)
  else if (key === 'End') to = walk(cells.length - 1, -1)
  else return null
  return to >= 0 ? cells[to]! : cells[from] ?? null
}

/** Carry the box by its handle: a press on the handle and the moves after it place the box, kept
 *  inside the viewport, until the release. Returns the stop for a drag the dialog's closing
 *  interrupts. */
function carry(handle: HTMLElement, box: HTMLElement, onStart: () => void): () => void {
  let stop: (() => void) | null = null
  handle.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return
    stop?.()
    onStart()
    const rect = box.getBoundingClientRect()
    const dx = event.clientX - rect.left
    const dy = event.clientY - rect.top
    stop = dragUntilRelease(
      (move) => {
        const x = Math.max(0, Math.min(move.clientX - dx, window.innerWidth - box.offsetWidth))
        const y = Math.max(0, Math.min(move.clientY - dy, window.innerHeight - box.offsetHeight))
        box.style.position = 'fixed'
        box.style.left = `${Math.round(x)}px`
        box.style.top = `${Math.round(y)}px`
      },
      () => {
        stop = null
      },
    )
    event.preventDefault()
  })
  return () => {
    stop?.()
    stop = null
  }
}

export function openDatePicker(deps: DatePickerDeps): DialogHandle {
  const t = deps.i18n.t
  const tag = deps.i18n.tag()
  const listId = `qc-date-times-${++pickers}`
  const firstDay = dayOf(deps.minSec)
  const lastDay = dayOf(deps.maxSec)
  const available = (day: number): boolean => day >= firstDay && day <= lastDay
  /** Whether the window covers any part of [from, to). */
  const covers = (from: number, to: number): boolean => from <= lastDay && to > firstDay
  const clampDay = (day: number): number => Math.min(lastDay, Math.max(firstDay, day))

  const numbers = new Intl.NumberFormat(tag, { useGrouping: false })
  const monthAndYear = new Intl.DateTimeFormat(tag, { month: 'long', year: 'numeric', timeZone: 'UTC' })
  const monthShort = new Intl.DateTimeFormat(tag, { month: 'short', timeZone: 'UTC' })
  const fullDate = new Intl.DateTimeFormat(tag, { dateStyle: 'full', timeZone: 'UTC' })
  const yearRange = (from: number): string => t('replay.yearRange', { from: numbers.format(from), to: numbers.format(from + YEAR_SPAN - 1) })
  const monthName = (year: number, month: number): string => monthAndYear.format(monthStart(year, month) * 1000)

  /** What the date field says, and the time field. */
  let text = ymd(deps.maxSec)
  let time = deps.withTime ? '00:00' : ''
  let view: CalendarView = 'days'
  const opening = new Date(deps.maxSec * 1000)
  let shownYear = opening.getUTCFullYear()
  let shownMonth = opening.getUTCMonth()
  /** The day the keyboard stands on in the day grid, which holds the grid's one tab stop. */
  let cursor = lastDay

  // The parts the dialog's closing reaches, filled once the box is built.
  let stopCarry: () => void = () => undefined
  let closeTimes: () => void = () => undefined

  return openDialog({
    host: deps.host,
    label: t('replay.selectDate'),
    className: 'qc-date-dialog',
    role: 'replay-date',
    width: 302,
    veil: false,
    motion: false,
    build(box, dialog) {
      const chosen = (): number | null => parseYmd(text)

      // ── The header: the title the dialog is carried by, and the close.
      const title = h('div', { class: 'qc-date-title' }, h('span', { class: 'qc-date-title-text' }, t('replay.selectDate')))
      const close = h('button', { type: 'button', class: 'qc-button qc-dialog-close', 'aria-label': t('replay.close'), title: t('replay.close') }, deps.icons.glyph(ICONS.dialogClose, { size: 18 }))
      close.addEventListener('click', () => dialog.close())

      // ── The fields: the date, and on an intraday chart the time with its list of the day.
      const dateField = h('input', { type: 'text', class: 'qc-field qc-date-field', 'aria-label': t('replay.startDateField'), placeholder: t('replay.dateMask'), spellcheck: 'false', autocomplete: 'off', value: text })
      const dateBox = h('span', { class: 'qc-date-box' }, dateField, deps.icons.glyph(ICONS.calendarDays, { className: 'qc-date-box-mark' }))
      const timeField = deps.withTime
        ? h('input', { type: 'text', class: 'qc-field qc-date-time', role: 'combobox', 'aria-label': t('replay.startTimeField'), 'aria-haspopup': 'listbox', 'aria-expanded': 'false', 'aria-controls': listId, 'aria-autocomplete': 'none', placeholder: t('replay.timeMask'), spellcheck: 'false', autocomplete: 'off', value: time })
        : null
      const clock = timeField ? h('button', { type: 'button', class: 'qc-date-box-mark qc-date-clock', tabindex: '-1', 'aria-label': t('replay.chooseTime'), title: t('replay.chooseTime') }, deps.icons.glyph(ICONS.clock)) : null
      const timeBox = timeField && clock ? h('span', { class: 'qc-date-box' }, timeField, clock) : null

      // ── The calendar: the stepping arrows around the heading, the band, and the grid of the view.
      const previous = h('button', { type: 'button', class: 'qc-button qc-date-step' }, deps.icons.glyph(ICONS.chevronLeft))
      const heading = h('button', { type: 'button', class: 'qc-button qc-date-heading' })
      const next = h('button', { type: 'button', class: 'qc-button qc-date-step' }, deps.icons.glyph(ICONS.chevronRight))
      const band = h('div', { class: 'qc-date-band', 'aria-hidden': 'true' })
      const grid = h('div', { class: 'qc-date-view' })
      const calendar = h('div', { class: 'qc-date-calendar' }, h('div', { class: 'qc-date-nav' }, previous, heading, next), band, grid)

      const first = h('button', { type: 'button', class: 'qc-button qc-date-first' }, t('replay.firstAvailableDay'))
      const cancel = button({ label: t('replay.cancel'), text: t('replay.cancel'), className: 'qc-date-cancel', onClick: () => dialog.close() })
      const select = button({ label: t('replay.select'), text: t('replay.select'), className: 'qc-button--primary qc-date-select', onClick: () => submit() })

      const submit = (): void => {
        const day = chosen()
        if (day === null || !available(day)) return
        deps.onSelect(day + (timeField ? parseTimeOfDay(time) : 0))
        dialog.close()
      }

      /** Show the month a day falls in. */
      const showDay = (day: number): void => {
        const d = new Date(day * 1000)
        shownYear = d.getUTCFullYear()
        shownMonth = d.getUTCMonth()
        view = 'days'
      }

      /** Choose a day: the field says it, the grid marks it, and the keyboard stands on it. */
      const pickDay = (day: number): void => {
        text = ymd(day)
        dateField.value = text
        cursor = day
        render(true)
      }

      /** A cell of the month or year grid. */
      const cell = (label: string, name: string | null, selected: boolean, usable: boolean, onPick: () => void): HTMLButtonElement => {
        const element = h('button', { type: 'button', class: 'qc-button qc-date-cell', role: 'gridcell', tabindex: '-1', 'aria-selected': String(selected), ...(name ? { 'aria-label': name } : {}) }, label)
        setDisabled(element, !usable)
        element.addEventListener('click', onPick)
        return element
      }

      /** One tab stop for a grid of cells: the chosen one, else the first that can be chosen. */
      const armCells = (cells: readonly HTMLButtonElement[]): HTMLButtonElement | null => {
        const stop = cells.find((c) => c.getAttribute('aria-selected') === 'true' && !c.disabled) ?? cells.find((c) => !c.disabled) ?? null
        for (const c of cells) c.setAttribute('tabindex', c === stop ? '0' : '-1')
        return stop
      }

      /** Arrows over the month or year grid, and Enter on a cell to choose it. */
      const cellKeys = (gridElement: HTMLElement, cells: readonly HTMLButtonElement[], columns: number): void => {
        gridElement.addEventListener('keydown', (event) => {
          const from = cells.indexOf(event.target as HTMLButtonElement)
          if (from < 0) return
          if (event.key === 'Enter') {
            event.preventDefault()
            cells[from]!.click()
            return
          }
          const target = gridStep(cells, from, event.key, columns)
          if (!target) return
          event.preventDefault()
          for (const c of cells) c.setAttribute('tabindex', c === target ? '0' : '-1')
          target.focus()
        })
      }

      const buildDays = (): HTMLElement | null => {
        const start = monthStart(shownYear, shownMonth)
        const count = daysIn(shownYear, shownMonth)
        const lead = (new Date(start * 1000).getUTCDay() + 6) % 7
        const selected = chosen()
        const today = dayOf(Date.now() / 1000)
        const end = start + (count - 1) * DAY
        // The keyboard's place: where it stood when that is in this month, else the chosen day, else the
        // month's first available day.
        const inMonth = (day: number | null): day is number => day !== null && day >= start && day <= end && available(day)
        const stop = inMonth(cursor) ? cursor : inMonth(selected) ? selected : covers(start, end + DAY) ? clampDay(start) : null
        if (stop !== null) cursor = stop
        const weeks = h('div', { class: 'qc-date-weeks', role: 'grid', 'aria-label': monthName(shownYear, shownMonth) })
        let row: HTMLElement | null = null
        let focusCell: HTMLButtonElement | null = null
        for (let date = 1; date <= count; date++) {
          const day = start + (date - 1) * DAY
          if (!row || (lead + date - 1) % 7 === 0) {
            row = h('div', { class: 'qc-date-week', role: 'row' })
            weeks.appendChild(row)
          }
          const element = h('button', { type: 'button', class: 'qc-button qc-date-day', role: 'gridcell', tabindex: day === stop ? '0' : '-1', 'data-qc-day': String(day), 'aria-label': fullDate.format(day * 1000), 'aria-selected': String(day === selected) }, numbers.format(date))
          if (day === today) element.setAttribute('aria-current', 'date')
          setDisabled(element, !available(day))
          element.addEventListener('click', () => pickDay(day))
          if (day === stop) focusCell = element
          row.appendChild(element)
        }
        // Arrows walk days and weeks, Page Up and Page Down months (years with Shift), Home and End
        // the ends of the month; a step past the month turns the page. Only an available day is landed
        // on, and Enter or Space on one chooses it.
        weeks.addEventListener('keydown', (event) => {
          const from = Number((event.target as HTMLElement).dataset.qcDay)
          if (!Number.isFinite(from)) return
          if (event.key === 'Enter') {
            event.preventDefault()
            pickDay(from)
            return
          }
          let to: number
          if (event.key === 'ArrowLeft') to = from - DAY
          else if (event.key === 'ArrowRight') to = from + DAY
          else if (event.key === 'ArrowUp') to = from - 7 * DAY
          else if (event.key === 'ArrowDown') to = from + 7 * DAY
          else if (event.key === 'PageUp') to = addMonths(from, event.shiftKey ? -12 : -1)
          else if (event.key === 'PageDown') to = addMonths(from, event.shiftKey ? 12 : 1)
          else if (event.key === 'Home') to = start
          else if (event.key === 'End') to = end
          else return
          event.preventDefault()
          cursor = clampDay(to)
          showDay(cursor)
          render(true)
        })
        weeks.addEventListener('focusin', (event) => {
          const day = Number((event.target as HTMLElement).dataset.qcDay)
          if (Number.isFinite(day)) cursor = day
        })
        grid.replaceChildren(weeks)
        return focusCell
      }

      const buildMonths = (): HTMLElement | null => {
        const selected = chosen()
        const at = selected === null ? null : new Date(selected * 1000)
        const months = h('div', { class: 'qc-date-months', role: 'grid', 'aria-label': numbers.format(shownYear) })
        const cells: HTMLButtonElement[] = []
        for (let r = 0; r < 4; r++) {
          const row = h('div', { class: 'qc-date-row', role: 'row' })
          for (let c = 0; c < 3; c++) {
            const month = r * 3 + c
            const isChosen = at ? at.getUTCFullYear() === shownYear && at.getUTCMonth() === month : month === shownMonth
            const element = cell(monthShort.format(monthStart(shownYear, month) * 1000), monthName(shownYear, month), isChosen, covers(monthStart(shownYear, month), monthStart(shownYear, month + 1)), () => {
              shownMonth = month
              view = 'days'
              render(true)
            })
            cells.push(element)
            row.appendChild(element)
          }
          months.appendChild(row)
        }
        cellKeys(months, cells, 3)
        grid.replaceChildren(months)
        return armCells(cells)
      }

      const buildYears = (): HTMLElement | null => {
        const selected = chosen()
        const chosenYear = selected === null ? shownYear : new Date(selected * 1000).getUTCFullYear()
        const from = Math.floor(shownYear / YEAR_SPAN) * YEAR_SPAN
        const years = h('div', { class: 'qc-date-years', role: 'grid', 'aria-label': yearRange(from) })
        const cells: HTMLButtonElement[] = []
        for (let r = 0; r < YEAR_SPAN / 4; r++) {
          const row = h('div', { class: 'qc-date-row', role: 'row' })
          for (let c = 0; c < 4; c++) {
            const year = from + r * 4 + c
            const element = cell(numbers.format(year), null, year === chosenYear, covers(monthStart(year, 0), monthStart(year + 1, 0)), () => {
              shownYear = year
              view = 'months'
              render(true)
            })
            cells.push(element)
            row.appendChild(element)
          }
          years.appendChild(row)
        }
        cellKeys(years, cells, 4)
        grid.replaceChildren(years)
        return armCells(cells)
      }

      /** Redraw the calendar for the view and the choice, and keep Select honest. With `focus`, the
       *  keyboard lands on the grid's tab stop, which is how a pick, a turned page or a changed view
       *  keeps the keyboard in the calendar. */
      const render = (focus = false): void => {
        let stop: HTMLElement | null
        let back: { label: string; usable: boolean }
        let forward: { label: string; usable: boolean }
        if (view === 'days') {
          heading.textContent = monthName(shownYear, shownMonth)
          heading.setAttribute('aria-label', t('replay.showMonths', { year: numbers.format(shownYear) }))
          band.replaceChildren(...WEEKDAYS.map((key) => h('span', {}, t(key))))
          back = { label: t('replay.previousMonth', { month: monthName(shownYear, shownMonth - 1) }), usable: covers(monthStart(shownYear, shownMonth - 1), monthStart(shownYear, shownMonth)) }
          forward = { label: t('replay.nextMonth', { month: monthName(shownYear, shownMonth + 1) }), usable: covers(monthStart(shownYear, shownMonth + 1), monthStart(shownYear, shownMonth + 2)) }
          stop = buildDays()
        } else if (view === 'months') {
          const from = Math.floor(shownYear / YEAR_SPAN) * YEAR_SPAN
          heading.textContent = numbers.format(shownYear)
          heading.setAttribute('aria-label', t('replay.showYears', { years: yearRange(from) }))
          band.replaceChildren(h('span', {}, t('replay.months')))
          back = { label: t('replay.previousYear', { year: numbers.format(shownYear - 1) }), usable: covers(monthStart(shownYear - 1, 0), monthStart(shownYear, 0)) }
          forward = { label: t('replay.nextYear', { year: numbers.format(shownYear + 1) }), usable: covers(monthStart(shownYear + 1, 0), monthStart(shownYear + 2, 0)) }
          stop = buildMonths()
        } else {
          const from = Math.floor(shownYear / YEAR_SPAN) * YEAR_SPAN
          heading.textContent = yearRange(from)
          heading.setAttribute('aria-label', t('replay.showDates', { month: monthName(shownYear, shownMonth) }))
          band.replaceChildren(h('span', {}, t('replay.years')))
          back = { label: t('replay.previousYears', { years: yearRange(from - YEAR_SPAN) }), usable: covers(monthStart(from - YEAR_SPAN, 0), monthStart(from, 0)) }
          forward = { label: t('replay.nextYears', { years: yearRange(from + YEAR_SPAN) }), usable: covers(monthStart(from + YEAR_SPAN, 0), monthStart(from + 2 * YEAR_SPAN, 0)) }
          stop = buildYears()
        }
        previous.setAttribute('aria-label', back.label)
        next.setAttribute('aria-label', forward.label)
        setDisabled(previous, !back.usable)
        setDisabled(next, !forward.usable)
        const day = chosen()
        setDisabled(select, day === null || !available(day))
        if (focus) stop?.focus()
      }

      // The heading turns the days into their year's months, the months into their score of years,
      // and the years back to the shown month's days. The arrows turn a month, a year or a score.
      heading.addEventListener('click', () => {
        view = view === 'days' ? 'months' : view === 'months' ? 'years' : 'days'
        render()
      })
      const turn = (direction: -1 | 1): void => {
        if (view === 'days') {
          const at = new Date(monthStart(shownYear, shownMonth + direction) * 1000)
          shownYear = at.getUTCFullYear()
          shownMonth = at.getUTCMonth()
        } else {
          shownYear += direction * (view === 'months' ? 1 : YEAR_SPAN)
        }
        render()
      }
      previous.addEventListener('click', () => turn(-1))
      next.addEventListener('click', () => turn(1))

      // The chip moves the choice to the window's first bar, its day and on an intraday chart its time,
      // and shows that month. Nothing applies until Select.
      first.addEventListener('click', () => {
        text = ymd(deps.minSec)
        dateField.value = text
        if (timeField) {
          time = hhmm(deps.minSec)
          timeField.value = time
        }
        cursor = firstDay
        showDay(firstDay)
        render()
      })

      // A date typed in full turns the calendar to it; Enter applies what the fields say.
      dateField.addEventListener('input', () => {
        text = dateField.value
        const day = chosen()
        if (day !== null) {
          showDay(day)
          if (available(day)) cursor = day
        }
        render()
      })
      dateField.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return
        event.preventDefault()
        submit()
      })

      // ── The time list: the day in quarter hours, standing on the dialog's backdrop directly under
      // the field so the dialog never clips it. The keyboard stays in the field: the arrows walk the
      // list, Enter takes the time walked to, and Escape puts the list away before it closes the
      // dialog. The clock opens it, a second press leaves it open, and a press anywhere but the list
      // or the field puts it away.
      if (timeField && clock && timeBox) {
        const options: HTMLElement[] = []
        const rows = h('div', { class: 'qc-date-times-rows' })
        const scroller = h('div', { class: 'qc-menu-body qc-date-times-body' }, rows)
        const list = h('div', { class: 'qc-overlay qc-date-times', role: 'listbox', id: listId, 'aria-label': t('replay.startTimeField') }, scroller)
        stopPointer(list)
        for (let minutes = 0; minutes < 1440; minutes += TIME_STEP_MINUTES) {
          const label = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
          const option = h('div', { class: 'qc-date-time-option', role: 'option', id: `${listId}-${minutes}`, 'aria-selected': 'false' }, label)
          // The press keeps the keyboard in the field, so the field stays ringed while it is answered.
          option.addEventListener('mousedown', (event) => event.preventDefault())
          option.addEventListener('click', () => takeTime(label))
          options.push(option)
          rows.appendChild(option)
        }
        let active = -1
        let escape: { token: object; release(): void } | null = null
        const isOpen = (): boolean => escape !== null
        /** Bring an option into the list's view, scrolling as little as it takes and keeping the
         *  list's own inset around it. The scroller is the options' offset parent, so an option's
         *  offset is its place in the list. */
        const reveal = (option: HTMLElement): void => {
          const inset = options[0]!.offsetTop
          const top = option.offsetTop - inset
          const bottom = option.offsetTop + option.offsetHeight + inset
          if (top < scroller.scrollTop) scroller.scrollTop = top
          else if (bottom > scroller.scrollTop + scroller.clientHeight) scroller.scrollTop = bottom - scroller.clientHeight
        }
        const walkTo = (index: number): void => {
          active = Math.max(0, Math.min(options.length - 1, index))
          options.forEach((option, i) => {
            if (i === active) option.dataset.qcActive = 'true'
            else delete option.dataset.qcActive
          })
          timeField.setAttribute('aria-activedescendant', options[active]!.id)
          reveal(options[active]!)
        }
        /** Mark the option the field holds. Answers where the keyboard starts: that option, else the
         *  quarter hour the field's time falls in. */
        const markTimes = (): number => {
          const at = options.findIndex((option) => option.textContent === timeField.value.trim())
          options.forEach((option, i) => option.setAttribute('aria-selected', String(i === at)))
          return at >= 0 ? at : Math.floor(parseTimeOfDay(timeField.value) / 60 / TIME_STEP_MINUTES)
        }
        const place = (): void => {
          const layer = list.parentElement
          if (!layer) return
          const field = timeBox.getBoundingClientRect()
          const ground = layer.getBoundingClientRect()
          list.style.left = `${Math.round(field.left - ground.left)}px`
          list.style.top = `${Math.round(field.bottom - ground.top)}px`
          list.style.width = `${Math.round(field.width)}px`
        }
        const onOutside = (event: PointerEvent): void => {
          const target = event.target as Node | null
          if (target && (list.contains(target) || timeBox.contains(target))) return
          closeTimes()
        }
        const onEscape = (event: KeyboardEvent): void => {
          if (event.key !== 'Escape' || !escape || !ownsEscape(escape.token)) return
          event.stopPropagation()
          event.preventDefault()
          closeTimes()
        }
        const openTimes = (): void => {
          if (isOpen()) return
          const layer = box.parentElement
          if (!layer) return
          escape = pushEscapeOwner()
          layer.appendChild(list)
          place()
          timeField.setAttribute('aria-expanded', 'true')
          const start = markTimes()
          // The chosen time heads the list as it opens.
          scroller.scrollTop = options[start]!.offsetTop - options[0]!.offsetTop
          walkTo(start)
          document.addEventListener('pointerdown', onOutside, true)
          document.addEventListener('keydown', onEscape, true)
          window.addEventListener('resize', closeTimes)
        }
        closeTimes = (): void => {
          if (!escape) return
          escape.release()
          escape = null
          active = -1
          list.remove()
          timeField.setAttribute('aria-expanded', 'false')
          timeField.removeAttribute('aria-activedescendant')
          document.removeEventListener('pointerdown', onOutside, true)
          document.removeEventListener('keydown', onEscape, true)
          window.removeEventListener('resize', closeTimes)
        }
        const takeTime = (label: string): void => {
          time = label
          timeField.value = label
          closeTimes()
          timeField.focus()
        }
        clock.addEventListener('mousedown', (event) => event.preventDefault())
        clock.addEventListener('click', () => {
          timeField.focus()
          timeField.select()
          openTimes()
        })
        timeField.addEventListener('input', () => {
          time = timeField.value
          if (isOpen()) markTimes()
        })
        timeField.addEventListener('keydown', (event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            if (!isOpen()) openTimes()
            else walkTo(active + (event.key === 'ArrowDown' ? 1 : -1))
          } else if (event.key === 'Enter') {
            event.preventDefault()
            if (isOpen() && active >= 0) takeTime(options[active]!.textContent ?? '')
            else submit()
          } else if (event.key === 'Tab') {
            closeTimes()
          }
        })
      }

      stopCarry = carry(title, box, () => closeTimes())
      box.append(
        h('div', { class: 'qc-date-header' }, title, close),
        h(
          'div',
          { class: 'qc-dialog-body qc-date-content' },
          h('div', { class: 'qc-date-fields' }, dateBox, timeBox),
          calendar,
          h('div', { class: 'qc-date-first-row' }, first),
        ),
        h('div', { class: 'qc-date-footer' }, cancel, select),
      )
      render()
    },
    initialFocus: (box) => box.querySelector<HTMLElement>('.qc-date-field'),
    onClosing: () => {
      stopCarry()
      closeTimes()
    },
    onClose: deps.onClose,
  })
}

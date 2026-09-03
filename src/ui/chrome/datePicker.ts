// The replay date picker: a date field over a month calendar, days outside the loaded window
// disabled, and a time field on intraday charts because "start on Tuesday" is not a useful anchor
// on a one-minute chart. Replay starts at the first bar at or after the chosen instant; a blank or
// unreadable time means the day's first bar. Every instant here is UTC, like the bars.
import type { ChartI18n, ChartMessageKey } from '../../i18n'
import { openDialog, dialogTitle, type DialogHandle } from './dialog'
import { armRoving, button, h, items, setDisabled } from './dom'
import { ICONS } from './icons'

export interface DatePickerDeps {
  host: HTMLElement
  i18n: ChartI18n
  /** The loaded window, epoch seconds. */
  minSec: number
  maxSec: number
  /** Offer a time field. */
  withTime: boolean
  onSelect(atSec: number): void
  onClose?(): void
}

const DAY = 86_400

/** The calendar's column heads, Monday first. */
const WEEKDAYS: readonly ChartMessageKey[] = ['replay.weekdayMon', 'replay.weekdayTue', 'replay.weekdayWed', 'replay.weekdayThu', 'replay.weekdayFri', 'replay.weekdaySat', 'replay.weekdaySun']

/** 'YYYY-MM-DD' of a UTC instant. */
export function ymd(sec: number): string {
  const d = new Date(sec * 1000)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

/** The UTC midnight a 'YYYY-MM-DD' names, or null when the text is not a date. */
export function parseYmd(text: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null
  const sec = Date.UTC(+text.slice(0, 4), +text.slice(5, 7) - 1, +text.slice(8, 10)) / 1000
  return Number.isFinite(sec) ? sec : null
}

/** Seconds past midnight from an 'HH:MM' field, or 0 when absent or unreadable. */
export function parseTimeOfDay(text: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(text.trim())
  if (!m) return 0
  return Math.min(1439, +m[1]! * 60 + +m[2]!) * 60
}

export function openDatePicker(deps: DatePickerDeps): DialogHandle {
  const t = deps.i18n.t
  const tag = deps.i18n.tag()
  const inRange = (sec: number): boolean => sec >= deps.minSec - DAY && sec <= deps.maxSec + DAY
  let text = ymd(deps.maxSec)
  let time = ''
  const last = new Date(deps.maxSec * 1000)
  let view = { y: last.getUTCFullYear(), m: last.getUTCMonth() }

  return openDialog({
    host: deps.host,
    label: t('replay.selectDate'),
    className: 'qc-date-dialog',
    width: 320,
    build(box, dialog) {
      const dateField = h('input', { type: 'text', class: 'qc-field qc-date-field', 'aria-label': t('replay.startDateField'), placeholder: t('replay.dateMask'), spellcheck: 'false', value: text })
      const timeField = deps.withTime ? h('input', { type: 'text', class: 'qc-field qc-date-time', 'aria-label': t('replay.startTimeField'), placeholder: t('replay.timeMask'), spellcheck: 'false' }) : null
      const grid = h('div', { class: 'qc-date-grid', role: 'grid', 'aria-label': t('replay.selectDate') })
      const monthLabel = h('span', { class: 'qc-date-month', 'aria-live': 'polite' })
      const select = button({ label: t('replay.select'), text: t('replay.select'), className: 'qc-button--primary', onClick: () => submit() })

      const chosen = (): number | null => parseYmd(text)
      const submit = (): void => {
        const day = chosen()
        if (day === null || !inRange(day)) return
        deps.onSelect(day + (timeField ? parseTimeOfDay(time) : 0))
        dialog.close()
      }
      const render = (): void => {
        const first = Date.UTC(view.y, view.m, 1)
        monthLabel.textContent = new Intl.DateTimeFormat(tag, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(first)
        grid.replaceChildren()
        const heads = h('div', { class: 'qc-date-row', role: 'row' })
        for (const key of WEEKDAYS) heads.appendChild(h('span', { class: 'qc-date-head qc-muted', role: 'columnheader' }, t(key)))
        grid.appendChild(heads)
        const startWeekday = (new Date(first).getUTCDay() + 6) % 7
        const daysInMonth = new Date(Date.UTC(view.y, view.m + 1, 0)).getUTCDate()
        const dayFormat = new Intl.DateTimeFormat(tag, { dateStyle: 'full', timeZone: 'UTC' })
        let row = h('div', { class: 'qc-date-row', role: 'row' })
        for (let i = 0; i < startWeekday; i++) row.appendChild(h('span', { class: 'qc-date-pad', role: 'gridcell' }))
        const selected = chosen()
        for (let d = 1; d <= daysInMonth; d++) {
          const sec = Date.UTC(view.y, view.m, d) / 1000
          const ok = inRange(sec)
          const cell = h('button', { type: 'button', class: 'qc-button qc-date-day', role: 'gridcell', 'data-qc-item': '', tabindex: '-1', 'aria-label': dayFormat.format(sec * 1000), 'aria-selected': String(selected === sec) }, String(d))
          setDisabled(cell, !ok)
          cell.addEventListener('click', () => {
            text = ymd(sec)
            dateField.value = text
            render()
          })
          row.appendChild(cell)
          if (row.childElementCount === 7) {
            grid.appendChild(row)
            row = h('div', { class: 'qc-date-row', role: 'row' })
          }
        }
        if (row.childElementCount > 0) grid.appendChild(row)
        const day = chosen()
        setDisabled(select, day === null || !inRange(day))
        // One tab stop for the whole grid: the selected day, else the first enabled one.
        const cells = items(grid)
        const start = Math.max(0, cells.findIndex((c) => c.getAttribute('aria-selected') === 'true'))
        armRoving(grid, start)
      }
      // Arrows move by a day and by a week, Home and End to the ends, over the enabled days only.
      grid.addEventListener('keydown', (e) => {
        const cells = items(grid)
        const at = cells.indexOf(document.activeElement as HTMLElement)
        if (at < 0) return
        const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowDown' ? 7 : e.key === 'ArrowUp' ? -7 : 0
        let target = -1
        if (step !== 0) target = Math.max(0, Math.min(cells.length - 1, at + step))
        else if (e.key === 'Home') target = 0
        else if (e.key === 'End') target = cells.length - 1
        if (target < 0) return
        e.preventDefault()
        cells.forEach((c, i) => c.setAttribute('tabindex', i === target ? '0' : '-1'))
        cells[target]?.focus()
      })
      dateField.addEventListener('input', () => {
        text = dateField.value
        const day = chosen()
        if (day !== null) {
          const d = new Date(day * 1000)
          view = { y: d.getUTCFullYear(), m: d.getUTCMonth() }
        }
        render()
      })
      dateField.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') submit()
      })
      timeField?.addEventListener('input', () => {
        time = timeField.value
      })
      const previous = button({
        label: t('replay.previousMonth'),
        icon: ICONS.chevronLeft,
        iconSize: 18,
        onClick: () => {
          view = view.m === 0 ? { y: view.y - 1, m: 11 } : { y: view.y, m: view.m - 1 }
          render()
        },
      })
      const next = button({
        label: t('replay.nextMonth'),
        icon: ICONS.chevronRight,
        iconSize: 18,
        onClick: () => {
          view = view.m === 11 ? { y: view.y + 1, m: 0 } : { y: view.y, m: view.m + 1 }
          render()
        },
      })
      box.append(
        dialogTitle(t('replay.selectDate'), t('replay.cancel'), () => dialog.close()),
        h('div', { class: 'qc-dialog-body' }, h('div', { class: 'qc-date-fields' }, dateField, timeField), h('div', { class: 'qc-date-nav' }, previous, monthLabel, next), grid),
        h('div', { class: 'qc-dialog-actions' }, button({ label: t('replay.cancel'), text: t('replay.cancel'), onClick: () => dialog.close() }), select),
      )
      render()
    },
    initialFocus: (box) => box.querySelector<HTMLElement>('.qc-date-field'),
    onClose: deps.onClose,
  })
}

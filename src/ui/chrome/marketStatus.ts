// The market-status popup the legend's marks open. One section per mark, the market's first: its
// badge, the phase's title, what the phase means with the countdown to the next transition in bold,
// the exchange-local day's timeline with a now marker and the times of the stretch now stands in,
// and the exchange timezone. A feed that is not a live stream adds a section of its own under a
// rule. Times read in the EXCHANGE zone, the session's own clock, whatever the chart displays in.
// Everything is the chart's own status model over the symbol's own session facts; an unknown model
// gets one honest line and never a fabricated timeline.
import type { ChartI18n } from '../../i18n'
import {
  dataStatusNotice,
  exchangeTimezoneText,
  marketStatusCountdown,
  marketStatusSentence,
  marketStatusTitle,
  sessionTimeline,
  type MarketStatus,
  type SessionModel,
  type SessionTimeline,
} from '../../sessionModel'
import { STATUS_GLYPH, type LegendStatusKind } from '../../chartLegend'
import type { IconResolver } from '../icons/resolver'
import { h } from './dom'
import { openMenu, type MenuHandle } from './menu'

export interface MarketStatusDeps {
  host: HTMLElement
  i18n: ChartI18n
  /** Draws the sections' badges: the host's drawing for each mark, or the chart's own. */
  icons: IconResolver
  model(): SessionModel | null
  status(nowSecs: number): MarketStatus | null
  onClose?(): void
}

/** The popup's width, in CSS pixels. */
const POPUP_WIDTH = 344

const MINUTES_PER_DAY = 1440

/** "09:30" from exchange-local minutes; the day's end reads "24:00". */
const clock = (mins: number): string => (mins >= MINUTES_PER_DAY ? '24:00' : `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`)

/** The time marks under the timeline: the start and the end of the stretch now stands in, each at
 *  its edge. An edge at the day's start or end is left off when the stretch continues past the day,
 *  unless the stretch is the whole day. */
export function timelineMarks(tl: Pick<SessionTimeline, 'segments' | 'nowMins' | 'before' | 'after'>): { mins: number; text: string }[] {
  const stretch = tl.segments.find((s) => tl.nowMins >= s.start && tl.nowMins < s.end) ?? tl.segments[tl.segments.length - 1]
  if (!stretch) return []
  const whole = stretch.start <= 0 && stretch.end >= MINUTES_PER_DAY
  const marks: { mins: number; text: string }[] = []
  if (whole || stretch.start > 0 || tl.before !== stretch.state) marks.push({ mins: stretch.start, text: clock(stretch.start) })
  if (whole || stretch.end < MINUTES_PER_DAY || tl.after !== stretch.state) marks.push({ mins: stretch.end, text: clock(stretch.end) })
  return marks
}

export function openMarketStatus(anchor: HTMLElement, deps: MarketStatusDeps): MenuHandle {
  const t = deps.i18n.t
  const now = (): number => Math.floor(Date.now() / 1000)
  let timer: ReturnType<typeof setInterval> | null = null
  let offLocale = (): void => undefined
  const stopUpdates = (): void => {
    if (timer) clearInterval(timer)
    timer = null
    offLocale()
    offLocale = () => undefined
  }

  /** One section: the badge, the title in the mark's ink, and the words under it. */
  const section = (kind: LegendStatusKind, title: string, ...content: HTMLElement[]): HTMLElement => {
    const badge = h('span', { class: 'qc-status-mark qc-status-badge', 'data-qc-mark': kind }, deps.icons.glyph(STATUS_GLYPH[kind], { size: 18 }))
    return h('section', { class: 'qc-status-section', 'data-qc-mark': kind }, badge, h('div', { class: 'qc-status-content' }, h('div', { class: 'qc-status-title' }, title), ...content))
  }

  /** The sentence, and the countdown in bold where there is one. `status.textPair` orders the two
   *  and decides what stands between them. */
  const words = (sentence: string, countdown: string | null): HTMLElement => {
    const text = h('p', { class: 'qc-status-text' })
    if (!countdown) {
      text.textContent = sentence
      return text
    }
    const joined = t('status.textPair', { sentence, countdown })
    const at = joined.lastIndexOf(countdown)
    if (at < 0) {
      text.append(sentence, ' ', h('strong', { class: 'qc-status-countdown' }, countdown))
      return text
    }
    text.append(joined.slice(0, at), h('strong', { class: 'qc-status-countdown' }, countdown), joined.slice(at + countdown.length))
    return text
  }

  /** The exchange-local day: its name, the track of its stretches with the now marker, and the times
   *  of the stretch now stands in. */
  const timeline = (model: SessionModel, nowSecs: number): HTMLElement[] => {
    // The language decides the day's name; the exchange's zone decides which day it is.
    const tl = sessionTimeline(model, nowSecs, deps.i18n.tag())
    const bar = h('div', { class: 'qc-status-bar', 'aria-hidden': 'true' })
    for (const s of tl.segments) {
      const segment = h('div', { class: 'qc-status-segment', 'data-qc-session': s.state })
      segment.style.flexGrow = String(s.end - s.start)
      bar.appendChild(segment)
    }
    const marker = h('div', { class: 'qc-status-now' })
    marker.style.insetInlineStart = `${(tl.nowMins / MINUTES_PER_DAY) * 100}%`
    const track = h('div', { class: 'qc-status-track' }, bar, marker)
    const day = h('span', { class: 'qc-status-day', 'data-qc-active': 'true' }, tl.dayLabel)
    const marks = h('div', { class: 'qc-status-marks', 'aria-hidden': 'true' })
    for (const mark of timelineMarks(tl)) {
      const label = h('span', { class: 'qc-status-time' }, mark.text)
      label.style.setProperty('--qcd-at', `${(mark.mins / MINUTES_PER_DAY) * 100}%`)
      marks.appendChild(label)
    }
    return [
      h('div', { class: 'qc-status-timeline' }, day, track),
      marks,
      h('div', { class: 'qc-status-footer' }, exchangeTimezoneText(t, tl.timezone, new Date(nowSecs * 1000))),
    ]
  }

  const menu = openMenu({
    host: deps.host,
    anchor,
    label: t('status.title'),
    role: 'dialog',
    className: 'qc-status-popup',
    width: POPUP_WIDTH,
    build(body) {
      const model = deps.model()
      const nowSecs = now()
      const status = model ? deps.status(nowSecs) : null
      if (!model || !status) {
        body.append(section('unknown', t('status.unknownTitle'), words(t('status.unknown'), null)))
        return
      }
      body.append(section(status.phase, marketStatusTitle(t, status), words(marketStatusSentence(t, status), marketStatusCountdown(t, status, nowSecs)), ...timeline(model, nowSecs)))
      const data = dataStatusNotice(t, status.dataStatus)
      if (data) body.append(section(status.dataStatus === 'endofday' ? 'endOfDay' : 'delayed', data.title, words(data.text, null)))
    },
    onClose() {
      stopUpdates()
      deps.onClose?.()
    },
  })
  // The countdown and the now marker stay honest while the popup is up, without the closed popup
  // doing any work.
  timer = setInterval(() => menu.refresh(), 60_000)
  offLocale = deps.i18n.onChange(() => menu.refresh())
  // A newer opening may have displaced this one from a reentrant close callback before this
  // function received its handle. Do not admit timer or locale work after that terminal close.
  if (!menu.open()) stopUpdates()
  return menu
}

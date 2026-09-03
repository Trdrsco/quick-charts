// The market-status popup the legend's dot opens: the session's title and sentence, the
// exchange-local day's timeline with a now marker and the transition times, and the exchange
// timezone. Times read in the EXCHANGE zone, the session's own clock, whatever the chart displays
// in. Everything is the chart's own status model over the symbol's own session facts; an unknown
// model gets one honest line and never a fabricated timeline.
import type { ChartI18n } from '../../i18n'
import { exchangeTimezoneText, marketStatusText, marketStatusTitle, sessionStateAt, sessionTimeline, type MarketStatus, type SessionModel, type SessionState } from '../../sessionModel'
import { h } from './dom'
import { openMenu, type MenuHandle } from './menu'

export interface MarketStatusDeps {
  host: HTMLElement
  i18n: ChartI18n
  model(): SessionModel | null
  status(nowSecs: number): MarketStatus | null
  onClose?(): void
}

/** "09:30" from exchange-local minutes, wrapping at midnight. */
const clock = (mins: number): string => `${String(Math.floor(mins / 60) % 24).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`

/** The transition labels along the timeline: every stretch start inside the day. Two closer than
 *  ninety minutes (a maintenance break) merge into one ranged label between them, so labels never
 *  collide on the bar. */
export function timelineLabels(starts: readonly number[]): { mins: number; text: string }[] {
  const sorted = [...new Set(starts.filter((m) => m > 0))].sort((a, b) => a - b)
  const out: { mins: number; text: string }[] = []
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i]!
    const b = sorted[i + 1]
    if (b !== undefined && b - a <= 90) {
      out.push({ mins: (a + b) / 2, text: `${clock(a)} ${clock(b)}` })
      i++
    } else out.push({ mins: a, text: clock(a) })
  }
  return out
}

export function openMarketStatus(anchor: HTMLElement, deps: MarketStatusDeps): MenuHandle {
  const t = deps.i18n.t
  const now = (): number => Math.floor(Date.now() / 1000)
  let timer: ReturnType<typeof setInterval> | null = null

  const titleRow = (state: SessionState | null, text: string): HTMLElement => {
    const dot = h('span', { class: 'qc-session-dot qc-status-dot', ...(state ? { 'data-qc-session': state } : {}) })
    return h('div', { class: 'qc-status-title' }, dot, h('span', { class: 'qc-title' }, text))
  }

  const menu = openMenu({
    host: deps.host,
    anchor,
    label: t('status.title'),
    role: 'dialog',
    className: 'qc-status-popup',
    width: 300,
    build(body) {
      const model = deps.model()
      const nowSecs = now()
      const status = model ? deps.status(nowSecs) : null
      if (!model || !status) {
        body.append(titleRow(null, t('status.unknownTitle')), h('p', { class: 'qc-status-text qc-secondary' }, t('status.unknown')))
        return
      }
      body.append(titleRow(sessionStateAt(model, nowSecs), marketStatusTitle(t, status)), h('p', { class: 'qc-status-text qc-secondary' }, marketStatusText(t, status, nowSecs)))
      // The language decides the day's name; the exchange's zone decides which day it is.
      const tl = sessionTimeline(model, nowSecs, deps.i18n.tag())
      const bar = h('div', { class: 'qc-status-bar', 'aria-hidden': 'true' })
      for (const s of tl.segments) {
        const segment = h('div', { class: 'qc-status-segment', 'data-qc-session': s.state })
        segment.style.width = `${((s.end - s.start) / 1440) * 100}%`
        bar.appendChild(segment)
      }
      const marker = h('div', { class: 'qc-status-now' })
      marker.style.insetInlineStart = `${(tl.nowMins / 1440) * 100}%`
      const track = h('div', { class: 'qc-status-track' }, bar, marker)
      body.appendChild(h('div', { class: 'qc-status-timeline' }, h('span', { class: 'qc-status-day qc-muted' }, tl.dayLabel), track))
      const labels = timelineLabels(tl.segments.map((s) => s.start))
      if (labels.length > 0) {
        const row = h('div', { class: 'qc-status-labels', 'aria-hidden': 'true' })
        for (const l of labels) {
          const label = h('span', { class: 'qc-status-label qc-muted' }, l.text)
          label.style.insetInlineStart = `${(l.mins / 1440) * 100}%`
          row.appendChild(label)
        }
        body.appendChild(row)
      }
      body.appendChild(h('div', { class: 'qc-status-footer qc-muted' }, exchangeTimezoneText(t, tl.timezone, new Date(nowSecs * 1000))))
    },
    onClose() {
      if (timer) clearInterval(timer)
      timer = null
      deps.onClose?.()
    },
  })
  // The countdown and the now marker stay honest while the popup is up, without the closed popup
  // doing any work.
  timer = setInterval(() => menu.refresh(), 60_000)
  return menu
}

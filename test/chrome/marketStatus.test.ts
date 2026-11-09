// @vitest-environment happy-dom
// The market-status popup: an honest line for an unknown session, and for a known one a section per
// status mark, the market's first: its badge, title, sentence and bold countdown, the exchange day's
// timeline with the times of the stretch now stands in, and the exchange zone; then a section for a
// feed that is not a live stream. Everything is read off the symbol's own session model.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openMarketStatus, timelineMarks } from '../../src/ui/chrome/marketStatus'
import { marketStatus, parseSessionModel, type SessionModel } from '../../src/sessionModel'
import type { DataStatus } from '../../src/symbology'
import { createChartI18n } from '../../src/i18n'
import { button } from '../../src/ui/chrome/dom'
import { ownIcons } from '../ownIcons'

// The popup reads the wall clock, so the exchange day it draws depends on the day the test runs:
// a weekend is one closed segment. Every test here runs on a Wednesday at 11:00 New York time.
beforeEach(() => {
  vi.useFakeTimers({ now: Date.UTC(2026, 8, 2, 15, 0, 0), toFake: ['Date'] })
})
afterEach(() => {
  vi.useRealTimers()
  document.body.replaceChildren()
})

const i18n = createChartI18n()
const icons = ownIcons()
const model = parseSessionModel({ timezone: 'America/New_York', session: '0930-1600', subsessions: [{ id: 'premarket', session: '0400-0930' }, { id: 'postmarket', session: '1600-2000' }] })!

/** Open the popup for a model and a feed liveness, anchored on a fresh button. */
const open = (m: SessionModel | null, data: DataStatus = 'streaming') => {
  const host = document.createElement('div')
  const anchor = button({ label: 'Market status' })
  document.body.append(host, anchor)
  const popup = openMarketStatus(anchor, { host, i18n, icons, model: () => m, status: (now) => (m ? marketStatus(m, data, now) : null) })
  return { popup, anchor, host }
}

describe('the timeline marks', () => {
  it('mark the start and the end of the stretch now stands in', () => {
    const segments = [
      { start: 0, end: 240, state: 'closed' as const },
      { start: 240, end: 570, state: 'pre' as const },
      { start: 570, end: 960, state: 'open' as const },
      { start: 960, end: 1440, state: 'closed' as const },
    ]
    expect(timelineMarks({ segments, nowMins: 600, before: 'closed', after: 'closed' })).toEqual([
      { mins: 570, text: '09:30' },
      { mins: 960, text: '16:00' },
    ])
  })

  it('leave off an edge at the day’s start or end where the stretch runs on past it, unless it fills the day', () => {
    const overnight = [
      { start: 0, end: 960, state: 'open' as const },
      { start: 960, end: 1020, state: 'closed' as const },
      { start: 1020, end: 1440, state: 'open' as const },
    ]
    expect(timelineMarks({ segments: overnight, nowMins: 600, before: 'open', after: 'open' })).toEqual([{ mins: 960, text: '16:00' }])
    expect(timelineMarks({ segments: overnight, nowMins: 1100, before: 'open', after: 'open' })).toEqual([{ mins: 1020, text: '17:00' }])
    expect(timelineMarks({ segments: overnight, nowMins: 600, before: 'closed', after: 'open' })).toEqual([
      { mins: 0, text: '00:00' },
      { mins: 960, text: '16:00' },
    ])
    const whole = [{ start: 0, end: 1440, state: 'open' as const }]
    expect(timelineMarks({ segments: whole, nowMins: 600, before: 'open', after: 'open' })).toEqual([
      { mins: 0, text: '00:00' },
      { mins: 1440, text: '24:00' },
    ])
  })
})

describe('the popup', () => {
  it('does not admit timer work after a reentrant opener displaced it before return', () => {
    vi.useRealTimers()
    vi.useFakeTimers()
    const host = document.createElement('div')
    const anchor = button({ label: 'Market status' })
    document.body.append(host, anchor)
    const deps = { host, i18n, icons, model: () => null, status: () => null }
    let newest: ReturnType<typeof openMarketStatus> | undefined
    const first = openMarketStatus(anchor, {
      ...deps,
      onClose: () => {
        newest = openMarketStatus(anchor, deps)
      },
    })

    const displaced = openMarketStatus(anchor, deps)

    expect(first.open()).toBe(false)
    expect(displaced.open()).toBe(false)
    expect(newest?.open()).toBe(true)
    expect(host.querySelectorAll('.qc-status-popup')).toHaveLength(1)
    expect(vi.getTimerCount()).toBe(1)
    newest?.close()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('retires a replaced popup lifetime including its timer', () => {
    vi.useFakeTimers()
    const host = document.createElement('div')
    const anchor = button({ label: 'Market status' })
    document.body.append(host, anchor)
    const deps = { host, i18n, icons, model: () => null, status: () => null }
    const first = openMarketStatus(anchor, deps)
    const second = openMarketStatus(anchor, deps)
    expect(first.open()).toBe(false)
    expect(second.open()).toBe(true)
    expect(host.querySelectorAll('.qc-status-popup')).toHaveLength(1)
    second.close()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('says the session is unknown when no model has resolved', () => {
    const { popup } = open(null)
    expect(popup.element.getAttribute('role')).toBe('dialog')
    const sections = popup.element.querySelectorAll<HTMLElement>('.qc-status-section')
    expect(sections).toHaveLength(1)
    expect(sections[0]!.dataset.qcMark).toBe('unknown')
    expect(popup.element.textContent).toContain('Session unknown')
    expect(popup.element.querySelector('.qc-status-bar')).toBeNull()
    popup.close()
  })

  it('draws the market section: the badge, the title, the sentence with its bold countdown, the day, the marks and the zone', () => {
    const { popup, anchor } = open(model)
    expect(popup.element.style.width).toBe('344px')
    const sections = [...popup.element.querySelectorAll<HTMLElement>('.qc-status-section')]
    expect(sections).toHaveLength(1)
    const market = sections[0]!
    expect(market.dataset.qcMark).toBe('open')
    const badge = market.querySelector<HTMLElement>('.qc-status-badge')!
    expect(badge.dataset.qcMark).toBe('open')
    expect(badge.querySelector('path')?.getAttribute('d')).toBe('M9 5a4 4 0 1 1 0 8 4 4 0 0 1 0-8')
    expect(market.querySelector('.qc-status-title')?.textContent).toBe('Market open')
    const text = market.querySelector<HTMLElement>('.qc-status-text')!
    expect(text.textContent).toBe("All's well, market is open. It'll go to post-market trading in 5 hours.")
    expect(text.querySelector('.qc-status-countdown')?.tagName).toBe('STRONG')
    expect(text.querySelector('.qc-status-countdown')?.textContent).toBe("It'll go to post-market trading in 5 hours.")
    const segments = [...market.querySelectorAll<HTMLElement>('.qc-status-segment')]
    expect(segments.map((s) => s.dataset.qcSession)).toEqual(['closed', 'pre', 'open', 'after', 'closed'])
    expect(segments.map((s) => Number(s.style.flexGrow))).toEqual([240, 330, 390, 240, 240])
    expect(market.querySelector<HTMLElement>('.qc-status-now')!.style.insetInlineStart).toBe(`${(660 / 1440) * 100}%`)
    expect(market.querySelector<HTMLElement>('.qc-status-day')!.textContent).toBe('WED')
    const marks = [...market.querySelectorAll<HTMLElement>('.qc-status-time')]
    expect(marks.map((m) => m.textContent)).toEqual(['09:30', '16:00'])
    expect(marks.map((m) => m.style.getPropertyValue('--qcd-at'))).toEqual([`${(570 / 1440) * 100}%`, `${(960 / 1440) * 100}%`])
    expect(market.querySelector('.qc-status-footer')?.textContent).toContain('Exchange timezone: New York')
    expect(anchor.getAttribute('aria-expanded')).toBe('true')
    popup.close()
    expect(anchor.getAttribute('aria-expanded')).toBe('false')
  })

  it('adds a data section under the market for a delayed or end-of-day feed, and none for a live stream', () => {
    const delayed = open(model, 'delayed_streaming').popup
    const sections = [...delayed.element.querySelectorAll<HTMLElement>('.qc-status-section')]
    expect(sections.map((s) => s.dataset.qcMark)).toEqual(['open', 'delayed'])
    expect(sections[1]!.querySelector('.qc-status-title')?.textContent).toBe('Data is delayed')
    expect(sections[1]!.querySelector('.qc-status-text')?.textContent).toBe("This symbol's prices are delayed.")
    expect(sections[1]!.querySelector('.qc-status-bar')).toBeNull()
    delayed.close()
    const eod = open(model, 'endofday').popup
    const eodSections = [...eod.element.querySelectorAll<HTMLElement>('.qc-status-section')]
    expect(eodSections.map((s) => s.dataset.qcMark)).toEqual(['open', 'endOfDay'])
    expect(eodSections[1]!.querySelector('.qc-status-title')?.textContent).toBe('End-of-day data')
    expect(eodSections[1]!.querySelector('.qc-status-badge path')?.getAttribute('d')).toContain('M12.25 4q.23.01.3.22')
    eod.close()
  })

  it('draws a continuous market as one open stretch from 00:00 to 24:00, with no countdown', () => {
    const perp = parseSessionModel({ timezone: 'Etc/UTC', session: '24x7' })!
    const { popup } = open(perp)
    expect(popup.element.querySelector('.qc-status-text')?.textContent).toBe("All's well, market is open.")
    expect(popup.element.querySelector('.qc-status-countdown')).toBeNull()
    expect([...popup.element.querySelectorAll<HTMLElement>('.qc-status-segment')].map((s) => s.dataset.qcSession)).toEqual(['open'])
    expect([...popup.element.querySelectorAll('.qc-status-time')].map((m) => m.textContent)).toEqual(['00:00', '24:00'])
    popup.close()
  })

  it('reads an electronic day as open, its time marks the stretch now stands in', () => {
    const es = parseSessionModel({
      timezone: 'America/Chicago',
      session: '1700-1600:23456',
      subsessions: [
        { id: 'regular', session: '0830-1515' },
        { id: 'extended', session: '1700-1600' },
      ],
    })!
    const { popup } = open(es)
    expect(popup.element.querySelector('.qc-status-title')?.textContent).toBe('Market open')
    expect(popup.element.querySelector('.qc-status-countdown')?.textContent).toBe("It'll close in 6 hours.")
    expect([...popup.element.querySelectorAll<HTMLElement>('.qc-status-segment')].map((s) => s.dataset.qcSession)).toEqual(['open', 'closed', 'open'])
    expect([...popup.element.querySelectorAll('.qc-status-time')].map((m) => m.textContent)).toEqual(['16:00'])
    popup.close()
  })
})

// @vitest-environment happy-dom
// The market-status popup: an honest line for an unknown session, and the title, sentence,
// timeline, transition labels and exchange zone for a known one, all read off the symbol's own
// session model.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openMarketStatus, timelineLabels } from '../../src/ui/chrome/marketStatus'
import { marketStatus, parseSessionModel } from '../../src/sessionModel'
import { createChartI18n } from '../../src/i18n'
import { button } from '../../src/ui/chrome/dom'

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
const model = parseSessionModel({ timezone: 'America/New_York', session: '0930-1600', subsessions: [{ id: 'premarket', session: '0400-0930' }, { id: 'postmarket', session: '1600-2000' }] })!

describe('the timeline labels', () => {
  it('labels every transition and merges two closer than ninety minutes into one ranged label', () => {
    expect(timelineLabels([0, 240, 570, 960, 1200])).toEqual([
      { mins: 240, text: '04:00' },
      { mins: 570, text: '09:30' },
      { mins: 960, text: '16:00' },
      { mins: 1200, text: '20:00' },
    ])
    expect(timelineLabels([1020, 1080])).toEqual([{ mins: 1050, text: '17:00 18:00' }])
  })
})

describe('the popup', () => {
  it('says the session is unknown when no model has resolved', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const anchor = button({ label: 'Market status' })
    document.body.appendChild(anchor)
    const popup = openMarketStatus(anchor, { host, i18n, model: () => null, status: () => null })
    expect(popup.element.getAttribute('role')).toBe('dialog')
    expect(popup.element.textContent).toContain('Session unknown')
    expect(popup.element.querySelector('.qc-status-bar')).toBeNull()
    popup.close()
  })

  it('draws the exchange day for a known model: the title, the sentence, the segments, the marker and the zone', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const anchor = button({ label: 'Market status' })
    document.body.appendChild(anchor)
    const popup = openMarketStatus(anchor, { host, i18n, model: () => model, status: (now) => marketStatus(model, 'streaming', now) })
    const text = popup.element.textContent ?? ''
    expect(text).toMatch(/Market (is )?(open|closed)|Pre-market|After-hours/)
    const segments = [...popup.element.querySelectorAll<HTMLElement>('.qc-status-segment')]
    expect(segments.length).toBeGreaterThan(2)
    expect(segments.map((s) => s.dataset.qcSession)).toContain('open')
    expect(segments.reduce((sum, s) => sum + Number.parseFloat(s.style.width), 0)).toBeCloseTo(100, 0)
    expect(popup.element.querySelector('.qc-status-now')).not.toBeNull()
    expect(text).toContain('Exchange timezone: New York')
    expect(anchor.getAttribute('aria-expanded')).toBe('true')
    popup.close()
    expect(anchor.getAttribute('aria-expanded')).toBe('false')
  })
})

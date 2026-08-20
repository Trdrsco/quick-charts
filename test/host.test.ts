import { describe, expect, it } from 'vitest'
import { applyBar, resolveInitialTf, resolveTheme } from '../src/host'
import type { FeedBar } from '../src/datafeed'
import hostSrc from '../src/host.ts?raw'

const bar = (t: number, c = 1): FeedBar => ({ t, o: 1, h: 2, l: 0.5, c, v: 10 })

describe('resolveTheme', () => {
  it('defaults to the dark palette and lets a partial override tint only what it names', () => {
    const dark = resolveTheme()
    expect(dark.background).toBe('#0f0f0f')
    const tinted = resolveTheme({ upColor: '#0f0' })
    expect(tinted.upColor).toBe('#0f0')
    expect(tinted.background).toBe(dark.background)
  })

  it('light mode swaps the base palette', () => {
    const light = resolveTheme({ mode: 'light' })
    expect(light.background).toBe('#ffffff')
    expect(light.textColor).not.toBe(resolveTheme().textColor)
  })
})

describe('applyBar', () => {
  it('appends a newer bar', () => {
    const next = applyBar([bar(100)], bar(160))
    expect(next!.map((b) => b.t)).toEqual([100, 160])
  })

  it('mutates the last bar on the same bucket time', () => {
    const next = applyBar([bar(100, 1), bar(160, 2)], bar(160, 3))
    expect(next!.length).toBe(2)
    expect(next![1]!.c).toBe(3)
  })

  it('drops a stale update older than the last bar (never splices history)', () => {
    expect(applyBar([bar(100), bar(160)], bar(100, 9))).toBeNull()
  })

  it('seeds an empty series', () => {
    expect(applyBar([], bar(100))!.map((b) => b.t)).toEqual([100])
  })
})

describe('resolveInitialTf — the capability-declaring feed’s initial-timeframe rule (B2B-5)', () => {
  it('keeps the sticky tf when the feed declares nothing', () => {
    expect(resolveInitialTf('1m', undefined)).toBe('1m')
    expect(resolveInitialTf('1m', [])).toBe('1m')
  })

  it('keeps the sticky tf when the feed declares it', () => {
    expect(resolveInitialTf('4h', ['1m', '4h', '1d'])).toBe('4h')
  })

  it('falls to the feed’s FIRST declared resolution when the sticky tf is unservable', () => {
    expect(resolveInitialTf('3m', ['1m', '4h', '1d'])).toBe('1m')
  })

  it('the widget never adjusts the stored preference, only the opening ask', () => {
    // The initial load resolves tf via this rule WITHOUT writing storage or firing
    // onTimeframeChange — capability is the feed's property, preference is the viewer's, so a
    // later feed that serves the preferred tf gets it back. Pinned in source because losing it
    // (a well-meaning storage.set next to the resolution) is invisible at runtime.
    expect(hostSrc).toContain('tf = resolveInitialTf(tf, cfg.resolutions)')
    expect(hostSrc).not.toMatch(/resolveInitialTf[\s\S]{0,120}storage\.set/)
  })
})

describe('attribution', () => {
  it('the widget disables the on-chart logo (attribution ships on the licenses page instead)', () => {
    // The Apache-2.0 attribution for lightweight-charts lives on the product's licenses page, not
    // the chart canvas — an owner decision this pins, because turning the logo back on (or losing
    // the page) is invisible at runtime.
    expect(hostSrc).toContain('attributionLogo: false')
  })
})

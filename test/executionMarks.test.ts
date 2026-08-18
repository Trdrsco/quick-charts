import { describe, expect, it } from 'vitest'
import {
  attachExecutionMarks,
  executionHitAt,
  executionPriceDecimals,
  groupExecutionsByBar,
  type ArrowHit,
  type ChartExecution,
} from '../src/executionMarks'
import type { IChartApi, ISeriesApi, SeriesType } from 'lightweight-charts'

const fill = (over: Partial<ChartExecution>): ChartExecution => ({
  id: over.id ?? 'f',
  side: over.side ?? 'buy',
  qty: over.qty ?? 1,
  price: over.price ?? 100,
  timeSecs: over.timeSecs ?? 0,
  ...over,
})

describe('groupExecutionsByBar', () => {
  const barTimes = [60, 120, 180, 240] // 1m bars

  it('attaches each fill to the containing bar (greatest bar time ≤ fill time)', () => {
    const groups = groupExecutionsByBar([fill({ id: 'a', timeSecs: 125 }), fill({ id: 'b', timeSecs: 60 })], barTimes)
    expect(groups.map((g) => g.barTime)).toEqual([60, 120])
  })

  it('groups same-bar same-side fills into one arrow with summed qty and volume-weighted avg', () => {
    const groups = groupExecutionsByBar(
      [
        fill({ id: 'a', timeSecs: 121, qty: 2, price: 100 }),
        fill({ id: 'b', timeSecs: 130, qty: 1, price: 106 }),
        fill({ id: 'c', timeSecs: 179, qty: 1, price: 103 }),
      ],
      barTimes,
    )
    expect(groups).toHaveLength(1)
    expect(groups[0]!.qty).toBe(4)
    expect(groups[0]!.avgPrice).toBeCloseTo((2 * 100 + 106 + 103) / 4, 10)
    expect(groups[0]!.fills.map((f) => f.id)).toEqual(['a', 'b', 'c']) // oldest first
  })

  it('keeps buy and sell on the same bar as SEPARATE groups (two arrows)', () => {
    const groups = groupExecutionsByBar(
      [fill({ id: 'a', timeSecs: 121, side: 'buy' }), fill({ id: 'b', timeSecs: 122, side: 'sell' })],
      barTimes,
    )
    expect(groups).toHaveLength(2)
    expect(new Set(groups.map((g) => g.side))).toEqual(new Set(['buy', 'sell']))
  })

  it('drops fills before the loaded window instead of clamping to the first bar', () => {
    expect(groupExecutionsByBar([fill({ timeSecs: 59 })], barTimes)).toEqual([])
  })

  it('drops fills past the forming edge (last bar + last span) instead of clamping to the last bar', () => {
    expect(groupExecutionsByBar([fill({ timeSecs: 300 })], barTimes)).toEqual([])
    // Inside the forming last bar is fine:
    expect(groupExecutionsByBar([fill({ timeSecs: 299 })], barTimes).map((g) => g.barTime)).toEqual([240])
  })

  it('handles irregular spacing (session gaps): the pre-gap bar contains the gap span', () => {
    // A Friday close → Sunday reopen gap: fills can only exist inside real sessions, but the
    // containment rule itself must not misfile across the gap boundary.
    const gapped = [60, 120, 100_000, 100_060]
    const groups = groupExecutionsByBar([fill({ timeSecs: 100_030 })], gapped)
    expect(groups.map((g) => g.barTime)).toEqual([100_000])
  })

  it('returns nothing with no bars, and ignores non-finite or non-positive fills', () => {
    expect(groupExecutionsByBar([fill({})], [])).toEqual([])
    expect(
      groupExecutionsByBar(
        [fill({ qty: 0 }), fill({ qty: -1 }), fill({ price: Number.NaN, timeSecs: 61 }), fill({ timeSecs: Number.NaN })],
        [60, 120],
      ),
    ).toEqual([])
  })

  it('sorts groups by bar time', () => {
    const groups = groupExecutionsByBar([fill({ timeSecs: 241 }), fill({ timeSecs: 61 })], barTimes)
    expect(groups.map((g) => g.barTime)).toEqual([60, 240])
  })
})

describe('executionHitAt', () => {
  const hit = (x: number, y: number): ArrowHit => ({ group: groupExecutionsByBar([fill({ timeSecs: 60 })], [60])[0]!, x, y, w: 18, h: 16 })

  it('hits inside the box inclusively, misses outside', () => {
    const hits = [hit(10, 20)]
    expect(executionHitAt(hits, 10, 20)).not.toBeNull()
    expect(executionHitAt(hits, 28, 36)).not.toBeNull()
    expect(executionHitAt(hits, 29, 20)).toBeNull()
    expect(executionHitAt(hits, 10, 37)).toBeNull()
  })

  it('later-drawn wins on overlap (matches paint order)', () => {
    const a = hit(10, 20)
    const b = hit(12, 22)
    expect(executionHitAt([a, b], 15, 25)).toBe(b)
  })
})

describe('executionPriceDecimals', () => {
  it('scales decimals to magnitude', () => {
    expect(executionPriceDecimals(5000)).toBe(2)
    expect(executionPriceDecimals(1)).toBe(2)
    expect(executionPriceDecimals(0.5)).toBe(4)
    expect(executionPriceDecimals(0.0002)).toBe(6)
  })
})

// ── The attachment's scope isolation, proven through a faked chart/series/bitmap target — the
// owner-level requirement: replay fills NEVER draw in live mode, live fills NEVER draw in replay. ──

function harness() {
  const bars = [
    { time: 60, open: 1, high: 2, low: 0.5, close: 1.5 },
    { time: 120, open: 1.5, high: 2.5, low: 1, close: 2 },
  ]
  let primitive: { paneViews(): { renderer(): { draw(t: unknown): void } }[]; attached(p: { requestUpdate?: () => void }): void } | null = null
  let updates = 0
  const subs = { click: 0, move: 0 }
  const chart = {
    timeScale: () => ({ timeToCoordinate: (t: number) => (t === 60 ? 100 : t === 120 ? 110 : null) }),
    subscribeClick: () => {
      subs.click++
    },
    unsubscribeClick: () => {
      subs.click--
    },
    subscribeCrosshairMove: () => {
      subs.move++
    },
    unsubscribeCrosshairMove: () => {
      subs.move--
    },
  } as unknown as IChartApi
  const series = {
    data: () => bars,
    priceToCoordinate: () => 50,
    attachPrimitive: (p: never) => {
      primitive = p
    },
    detachPrimitive: () => {
      primitive = null
    },
  } as unknown as ISeriesApi<SeriesType>
  const chrome = { style: { cursor: '' } } as unknown as HTMLElement
  const marks = attachExecutionMarks(chart, series, chrome, { buyColor: () => '#0f0', sellColor: () => '#f00' })
  primitive!.attached({ requestUpdate: () => updates++ })
  const drawnColors = (): string[] => {
    const colors: string[] = []
    const ctx = {
      beginPath() {},
      moveTo() {},
      lineTo() {},
      closePath() {},
      fill() {},
      set fillStyle(c: string) {
        colors.push(c)
      },
    }
    primitive!
      .paneViews()[0]!
      .renderer()
      .draw({ useBitmapCoordinateSpace: (fn: (s: unknown) => void) => fn({ context: ctx, horizontalPixelRatio: 1, verticalPixelRatio: 1 }) })
    return colors
  }
  return { marks, drawnColors, updatesCount: () => updates, subs }
}

describe('attachExecutionMarks scope isolation', () => {
  it('draws ONLY the active scope: live by default, replay after the flip, live again after', () => {
    const h = harness()
    h.marks.set('live', [fill({ id: 'L', side: 'buy', timeSecs: 61 })])
    h.marks.set('replay', [fill({ id: 'R1', side: 'sell', timeSecs: 61 }), fill({ id: 'R2', side: 'sell', timeSecs: 121 })])
    expect(h.marks.scope()).toBe('live')
    expect(h.drawnColors()).toEqual(['#0f0']) // one live buy arrow — the two replay fills invisible

    h.marks.setScope('replay')
    expect(h.drawnColors()).toEqual(['#f00', '#f00']) // the replay sells — the live fill invisible

    h.marks.setScope('live')
    expect(h.drawnColors()).toEqual(['#0f0'])
  })

  it('pokes requestUpdate on set/setScope (nothing else invalidates the pane)', () => {
    const h = harness()
    const before = h.updatesCount()
    h.marks.set('live', [fill({ timeSecs: 61 })])
    h.marks.setScope('replay')
    expect(h.updatesCount()).toBe(before + 2)
    h.marks.setScope('replay') // no-op flip must not repaint
    expect(h.updatesCount()).toBe(before + 2)
  })

  it('set on the INACTIVE scope repaints nothing (its history is not drawing)', () => {
    const h = harness()
    const before = h.updatesCount()
    h.marks.set('replay', [fill({ timeSecs: 61 })])
    expect(h.updatesCount()).toBe(before)
  })

  it('destroy unsubscribes the chart hooks and detaches; further calls are inert', () => {
    const h = harness()
    h.marks.destroy()
    expect(h.subs).toEqual({ click: 0, move: 0 })
    h.marks.destroy() // idempotent
    h.marks.set('live', [fill({ timeSecs: 61 })])
    expect(h.marks.scope()).toBe('live')
  })

  it('same-bar fills draw as ONE arrow per side (the grouping is what paints)', () => {
    const h = harness()
    h.marks.set('live', [
      fill({ id: 'a', side: 'buy', timeSecs: 61 }),
      fill({ id: 'b', side: 'buy', timeSecs: 90 }),
      fill({ id: 'c', side: 'sell', timeSecs: 100 }),
    ])
    expect(h.drawnColors()).toEqual(['#0f0', '#f00']) // 3 fills → 2 arrows
  })
})

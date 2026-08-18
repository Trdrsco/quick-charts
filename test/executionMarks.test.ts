import { describe, expect, it } from 'vitest'
import {
  attachExecutionMarks,
  executionHitAt,
  executionPriceDecimals,
  groupExecutionsByBar,
  planExecutionRuns,
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

  it('groups same-bar same-side fills with summed qty and volume-weighted avg (the card aggregation)', () => {
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

  it('keeps buy and sell on the same bar as SEPARATE groups', () => {
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
    expect(groupExecutionsByBar([fill({ timeSecs: 299 })], barTimes).map((g) => g.barTime)).toEqual([240])
  })

  it('handles irregular spacing (session gaps): the pre-gap bar contains the gap span', () => {
    const gapped = [60, 120, 100_000, 100_060]
    expect(groupExecutionsByBar([fill({ timeSecs: 100_030 })], gapped).map((g) => g.barTime)).toEqual([100_000])
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

describe('planExecutionRuns — the reference composite mark', () => {
  it('one fill = one run at its natural anchor with its exact price', () => {
    const runs = planExecutionRuns([{ tipY: 51, qty: 2, price: 77.24 }], 'buy')
    expect(runs).toEqual([{ tips: [51], qty: 2, avgPrice: 77.24 }])
  })

  it('overlapping buy anchors stack chevrons at the measured 4px pitch, extending DOWN (away from price)', () => {
    const runs = planExecutionRuns(
      [
        { tipY: 51, qty: 1, price: 100 },
        { tipY: 51, qty: 1, price: 100 },
        { tipY: 52, qty: 1, price: 100.01 },
      ],
      'buy',
    )
    expect(runs).toHaveLength(1)
    expect(runs[0]!.tips).toEqual([51, 55, 59])
    expect(runs[0]!.qty).toBe(3)
  })

  it('overlapping sell anchors stack UPWARD (away from the price they point down at)', () => {
    const runs = planExecutionRuns(
      [
        { tipY: 49, qty: 1, price: 100 },
        { tipY: 49, qty: 1, price: 100 },
      ],
      'sell',
    )
    expect(runs[0]!.tips).toEqual([49, 45])
  })

  it('anchors clear of the previous mark (tip through shaft end = 13px) start their OWN run with its own label', () => {
    const runs = planExecutionRuns(
      [
        { tipY: 51, qty: 1, price: 100 },
        { tipY: 51 + 13, qty: 2, price: 90 },
      ],
      'buy',
    )
    expect(runs).toHaveLength(2)
    expect(runs[1]!).toEqual({ tips: [64], qty: 2, avgPrice: 90 })
    // 12.9px away still overlaps ⇒ stacks:
    expect(planExecutionRuns([{ tipY: 51, qty: 1, price: 100 }, { tipY: 63.9, qty: 1, price: 90 }], 'buy')).toHaveLength(1)
  })

  it('sorts nearest-to-price first regardless of input order, and volume-weights the run avg', () => {
    const runs = planExecutionRuns(
      [
        { tipY: 55, qty: 1, price: 99 },
        { tipY: 51, qty: 3, price: 100 },
      ],
      'buy',
    )
    expect(runs).toHaveLength(1)
    expect(runs[0]!.tips).toEqual([51, 55])
    expect(runs[0]!.avgPrice).toBeCloseTo((3 * 100 + 99) / 4, 10)
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

// ── The attachment's scope isolation + composite drawing, proven through a faked chart/series/
// bitmap target — the owner-level requirement: replay fills NEVER draw in live mode, live fills
// NEVER draw in replay, and a (bar, side) stack strokes ONE composite mark with ONE label. ──

function harness(over?: { labels?: () => boolean }) {
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
  const marks = attachExecutionMarks(chart, series, chrome, {
    buyColor: () => '#0f0',
    sellColor: () => '#f00',
    textColor: () => '#ccc',
    labels: over?.labels ?? (() => true),
  })
  primitive!.attached({ requestUpdate: () => updates++ })
  /** One paint through a fake bitmap target. `marksDrawn` = the side color per composite mark
   *  (recorded at each run's SHAFT rect — the first fillRect after the run's fillStyle set). */
  const drawn = (): { marksDrawn: string[]; texts: string[] } => {
    const marksDrawn: string[] = []
    const texts: string[] = []
    let cur = ''
    let rectsSinceStyle = 0
    const ctx = {
      fillRect() {
        if (rectsSinceStyle === 0) marksDrawn.push(cur)
        rectsSinceStyle++
      },
      fillText(s: string) {
        texts.push(s)
      },
      measureText: () => ({ width: 40 }),
      font: '',
      textAlign: '',
      textBaseline: '',
      set fillStyle(c: string) {
        cur = c
        rectsSinceStyle = 0
      },
      get fillStyle() {
        return cur
      },
    }
    primitive!
      .paneViews()[0]!
      .renderer()
      .draw({ useBitmapCoordinateSpace: (fn: (s: unknown) => void) => fn({ context: ctx, horizontalPixelRatio: 1, verticalPixelRatio: 1 }) })
    return { marksDrawn, texts }
  }
  return { marks, drawn, updatesCount: () => updates, subs }
}

describe('attachExecutionMarks scope isolation + composite marks', () => {
  it('draws ONLY the active scope: live by default, replay after the flip, live again after', () => {
    const h = harness()
    h.marks.set('live', [fill({ id: 'L', side: 'buy', timeSecs: 61 })])
    h.marks.set('replay', [fill({ id: 'R1', side: 'sell', timeSecs: 61 }), fill({ id: 'R2', side: 'sell', timeSecs: 121 })])
    expect(h.marks.scope()).toBe('live')
    expect(h.drawn()).toEqual({ marksDrawn: ['#0f0'], texts: ['1 @ 100.00'] }) // the two replay fills invisible

    h.marks.setScope('replay')
    expect(h.drawn()).toEqual({ marksDrawn: ['#f00', '#f00'], texts: ['1 @ 100.00', '1 @ 100.00'] }) // the live fill invisible

    h.marks.setScope('live')
    expect(h.drawn().marksDrawn).toEqual(['#0f0'])
  })

  it('a same-bar same-side stack strokes ONE composite mark with ONE label; the opposite side is its own mark', () => {
    const h = harness()
    h.marks.set('live', [
      fill({ id: 'a', side: 'buy', timeSecs: 61, qty: 1 }),
      fill({ id: 'b', side: 'buy', timeSecs: 90, qty: 2 }),
      fill({ id: 'c', side: 'sell', timeSecs: 100, qty: 1 }),
    ])
    const d = h.drawn()
    expect(d.marksDrawn).toEqual(['#0f0', '#f00']) // one composite buy mark (2 barb pairs, 1 shaft) + 1 sell arrow
    expect(d.texts).toEqual(['3 @ 100.00', '1 @ 100.00']) // one label per run: total qty @ avg
  })

  it('labels are OFF unless the getter says true — arrows alone by default', () => {
    const h = harness({ labels: () => false })
    h.marks.set('live', [fill({ side: 'buy', timeSecs: 61 })])
    expect(h.drawn()).toEqual({ marksDrawn: ['#0f0'], texts: [] })
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
})

import { describe, expect, it } from 'vitest'
import { boundBracketPrice } from '../src/broker'
import {
  buildExitParts,
  buildPreviewParts,
  buildOrderParts,
  buildPositionParts,
  formatPnlMoney,
  formatPnlPercent,
  formatPnlTicks,
  hitTestParts,
  layoutParts,
  PART_H,
  TRADE_THEME,
  withAlpha,
  type LayoutNode,
} from '../src/tradeLineParts'

// The reference frame these assertions reproduce: a 1-lot long on a dark 1m chart, average 75.39,
// P&L −0.04 USD, laid out right-aligned against a plot edge at x=1271 with the line at y≈79.59.
// The expected rectangles are the ones the reference renderer itself resolved for that frame.
const RIGHT_EDGE = 1271
const CENTER_Y = 79.5866

// Text advance widths at 13px for the strings in that frame, back-solved from the reference's own
// button widths (a button is its text plus 7px of padding on each side).
const WIDTHS: Record<string, number> = { TP: 17, SL: 15, '1': 7, '− 0.04 USD': 68 }
const measure = (text: string) => WIDTHS[text] ?? text.length * 7

const SURFACE = '#141414' // the chart's own background — what the pill paints on
const POSITION = {
  surface: SURFACE,
  qty: 1,
  avgPrice: 75.39,
  pnlText: '− 0.04 USD',
  pnlSign: 'loss' as const,
  currency: 'USD',
  supportReverse: true,
  supportClose: true,
  supportTakeProfit: true,
  supportStopLoss: true,
  priceText: '75.39',
}

function layout() {
  return layoutParts(buildPositionParts(POSITION), { rightEdge: RIGHT_EDGE, centerY: CENTER_Y, measure })
}

function find(root: LayoutNode, id: string): LayoutNode {
  if (root.id === id) return root
  for (const c of root.children) {
    const hit = find(c, id)
    if (hit !== undefined && hit !== null) return hit
  }
  return undefined as unknown as LayoutNode
}

describe('position line layout', () => {
  it('spans the reference union rect', () => {
    const root = layout()
    expect(root.w).toBe(238)
    expect(root.x).toBe(1033)
    expect(root.x + root.w).toBe(RIGHT_EDGE)
    expect(root.h).toBe(PART_H)
    expect(root.y).toBe(70)
  })

  it('places every control at the reference offset', () => {
    const root = layout()
    const at = (id: string) => {
      const n = find(root, id)
      return { x: n.x, w: n.w }
    }
    expect(at('reverse')).toEqual({ x: 1033, w: 29 })
    expect(at('tp')).toEqual({ x: 1072, w: 31 })
    expect(at('sl')).toEqual({ x: 1102, w: 29 })
    expect(at('pill')).toEqual({ x: 1141, w: 130 })
    expect(at('qty')).toEqual({ x: 1142, w: 21 })
    expect(at('pnl')).toEqual({ x: 1164, w: 82 })
    expect(at('close')).toEqual({ x: 1247, w: 23 })
  })

  it('overlaps TP and SL by one pixel so their borders share a seam', () => {
    const root = layout()
    const tp = find(root, 'tp')
    const sl = find(root, 'sl')
    expect(sl.x).toBe(tp.x + tp.w - 1)
  })

  it('pins the P&L cell so a live number cannot resize the pill', () => {
    const wide = layoutParts(
      buildPositionParts({ ...POSITION, pnlText: '− 12345.67 USD' }),
      { rightEdge: RIGHT_EDGE, centerY: CENTER_Y, measure: (t) => (t === '− 12345.67 USD' ? 96 : measure(t)) },
    )
    // A wider number grows the cell past its floor, but a narrower one never shrinks below it.
    expect(find(wide, 'pnl').w).toBe(110)
    expect(find(layout(), 'pnl').w).toBe(82)
  })

  it('drops the controls a position does not support', () => {
    const root = layoutParts(
      buildPositionParts({ ...POSITION, supportReverse: false, supportTakeProfit: false, supportStopLoss: false }),
      { rightEdge: RIGHT_EDGE, centerY: CENTER_Y, measure },
    )
    expect(find(root, 'reverse')).toBeUndefined()
    expect(find(root, 'tp')).toBeUndefined()
    expect(find(root, 'close').w).toBe(23)
    expect(root.w).toBe(130)
  })

  it('renders a lone handle without the overlap seam', () => {
    const root = layoutParts(
      buildPositionParts({ ...POSITION, supportTakeProfit: false }),
      { rightEdge: RIGHT_EDGE, centerY: CENTER_Y, measure },
    )
    expect(find(root, 'tp')).toBeUndefined()
    // Reverse 29 + gap 10 + SL 29 + gap 10 + pill 130 — no seam, because nothing abuts the handle.
    expect(root.w).toBe(208)
    // Right-aligned, so dropping a handle moves the whole tree right rather than leaving a hole.
    expect(root.x).toBe(RIGHT_EDGE - 208)
    expect(find(root, 'sl').x).toBe(1102)
    expect(find(root, 'pill').x + find(root, 'pill').w).toBe(RIGHT_EDGE)
  })
})

describe('readouts vs controls', () => {
  it('gives a hover wash ONLY to the ✕ — the qty chip and P&L cell are readouts', () => {
    const root = layout()
    expect(find(root, 'qty').spec.fillHover).toBeUndefined()
    expect(find(root, 'pnl').spec.fillHover).toBeUndefined()
    expect(find(root, 'close').spec.fillHover).toBe(TRADE_THEME.closeHover)
  })

  it('keeps readouts free of a hover wash on order and exit lines too', () => {
    const order = layoutParts(buildOrderParts({ surface: SURFACE, qty: 1, label: 'LMT', color: '#2962FF', supportCancel: true, supportModifyQty: false }), {
      rightEdge: RIGHT_EDGE,
      centerY: CENTER_Y,
      measure,
    })
    expect(find(order, 'qty').spec.fillHover).toBeUndefined()
    const ex = layoutParts(buildExitParts({ surface: SURFACE, kind: 'sl', qty: 1, pnlText: null, pnlSign: null, supportCancel: true }), {
      rightEdge: RIGHT_EDGE,
      centerY: CENTER_Y,
      measure,
    })
    expect(find(ex, 'qty').spec.fillHover).toBeUndefined()
  })
})

describe('hit testing', () => {
  const y = CENTER_Y

  it('resolves each control to itself, never to a neighbour', () => {
    const root = layout()
    expect(hitTestParts(root, 1047, y)?.id).toBe('reverse')
    expect(hitTestParts(root, 1087, y)?.id).toBe('tp')
    expect(hitTestParts(root, 1116, y)?.id).toBe('sl')
    expect(hitTestParts(root, 1152, y)?.id).toBe('qty')
    expect(hitTestParts(root, 1200, y)?.id).toBe('pnl')
    expect(hitTestParts(root, 1259, y)?.id).toBe('close')
  })

  it('separates reverse from close — the failure the band model could not express', () => {
    const root = layout()
    const rev = hitTestParts(root, 1047, y)
    const close = hitTestParts(root, 1259, y)
    expect(rev?.role).toBe('reverse')
    expect(close?.role).toBe('close')
    expect(rev?.id).not.toBe(close?.id)
  })

  it('accepts taps in the reverse button overhang', () => {
    const root = layout()
    expect(hitTestParts(root, 1033 - TRADE_THEME.reverseHitPad + 1, y)?.id).toBe('reverse')
    expect(hitTestParts(root, 1033 - TRADE_THEME.reverseHitPad - 6, y)).toBeNull()
  })

  it('lets a tap on structure fall through to the chart', () => {
    const root = layout()
    // The 10px gap between the SL button and the pill belongs to the chart, not to either control.
    expect(hitTestParts(root, 1136, y)).toBeNull()
    expect(hitTestParts(root, 1200, y + PART_H)).toBeNull()
  })

  it('reports the drag role and tooltip the control carries', () => {
    const root = layout()
    expect(hitTestParts(root, 1087, y)?.dragRole).toBe('tpsl')
    expect(hitTestParts(root, 1087, y)?.tooltip).toBe('Drag to add Take profit')
    expect(hitTestParts(root, 1116, y)?.tooltip).toBe('Drag to add Stop loss')
    expect(hitTestParts(root, 1047, y)?.tooltip).toBe('Reverse Position')
    expect(hitTestParts(root, 1259, y)?.tooltip).toBe('Close Position')
    expect(hitTestParts(root, 1200, y)?.tooltip).toBe('Price 75.39')
    expect(hitTestParts(root, 1259, y)?.dragRole).toBeNull()
  })
})

describe('working order line', () => {
  it('cancels rather than closes, and offers a quantity edit', () => {
    const root = layoutParts(
      buildOrderParts({ surface: SURFACE, qty: 2, label: 'LMT', color: '#2962FF', supportCancel: true, supportModifyQty: true }),
      { rightEdge: RIGHT_EDGE, centerY: CENTER_Y, measure },
    )
    expect(find(root, 'close').spec.tooltip).toBe('Cancel order')
    expect(find(root, 'qty').spec.tooltip).toBe('Modify order quantity…')
    expect(find(root, 'qty').spec.text).toBe('2')
  })

  it('omits the ✕ when the order cannot be cancelled', () => {
    const root = layoutParts(
      buildOrderParts({ surface: SURFACE, qty: 1, label: 'STP', color: '#ff9800', supportCancel: false, supportModifyQty: false }),
      { rightEdge: RIGHT_EDGE, centerY: CENTER_Y, measure },
    )
    expect(find(root, 'close')).toBeUndefined()
  })
})

describe('resting exit line (TP / SL)', () => {
  const exit = (kind: 'tp' | 'sl', pnlText: string | null, pnlSign: 'profit' | 'loss' | null = 'profit') =>
    layoutParts(buildExitParts({ surface: SURFACE, kind, qty: 1, pnlText, pnlSign, supportCancel: true }), {
      rightEdge: RIGHT_EDGE,
      centerY: CENTER_Y,
      measure: (t) => (t === '+ 0.89 USD' ? 68 : measure(t)),
    })

  it('shows the POTENTIAL result, never the order type', () => {
    const root = exit('tp', '+ 0.89 USD')
    expect(find(root, 'pnl').spec.text).toBe('+ 0.89 USD')
    // Nothing anywhere restates "SELL LIMIT" — the colour and side already say it.
    const texts: string[] = []
    const walk = (n: LayoutNode) => { if (n.spec.text) texts.push(n.spec.text); n.children.forEach(walk) }
    walk(root)
    expect(texts.join(' ')).not.toMatch(/LIMIT|STOP|SELL|BUY/i)
  })

  it('colours by the LEG, not the side — green target, amber stop', () => {
    expect(find(exit('tp', '+ 0.89 USD'), 'pill').spec.border).toBe(TRADE_THEME.tp)
    expect(find(exit('sl', '− 0.49 USD', 'loss'), 'pill').spec.border).toBe(TRADE_THEME.sl)
    expect(find(exit('tp', '+ 0.89 USD'), 'qty').spec.fill).toBe(TRADE_THEME.tp)
  })

  it('colours the amount by its SIGN, independently of the leg', () => {
    expect(find(exit('sl', '− 0.49 USD', 'loss'), 'pnl').spec.textColor).toBe(TRADE_THEME.loss)
    expect(find(exit('tp', '+ 0.89 USD', 'profit'), 'pnl').spec.textColor).toBe(TRADE_THEME.profit)
  })

  it('omits the cell entirely when the point value is unknown', () => {
    const root = exit('tp', null)
    expect(find(root, 'pnl')).toBeUndefined()
    expect(find(root, 'qty').w).toBe(21)
  })
})

describe('withAlpha', () => {
  it('re-alphas hex and rgb forms so a band tracks its line colour', () => {
    expect(withAlpha('#089981', 0.25)).toBe('rgba(8, 153, 129, 0.25)')
    expect(withAlpha('#ff9800', 0.15)).toBe('rgba(255, 152, 0, 0.15)')
    expect(withAlpha('#fff', 0.5)).toBe('rgba(255, 255, 255, 0.5)')
    expect(withAlpha('rgba(41, 98, 255, 0.9)', 0.3)).toBe('rgba(41, 98, 255, 0.3)')
  })
})

describe('preview (pre-money) line', () => {
  const build = (cancellable: boolean) =>
    layoutParts(buildPreviewParts({ surface: SURFACE, label: 'SL', qty: 2, color: '#ff9800', cancellable }), {
      rightEdge: RIGHT_EDGE,
      centerY: CENTER_Y,
      measure,
    })

  it('hit-tests through the same part tree as a live line', () => {
    const root = build(true)
    const close = find(root, 'close')
    expect(hitTestParts(root, close.x + close.w / 2, CENTER_Y)?.role).toBe('close')
    expect(hitTestParts(root, close.x + close.w / 2, CENTER_Y)?.tooltip).toBe('Discard this level')
  })

  it('marks itself as not yet sent', () => {
    expect(find(build(true), 'label').spec.tooltip).toBe('Pending, not yet sent')
    expect(find(build(true), 'label').spec.text).toBe('SL 2')
  })

  it('gives a grouped leg no ✕ of its own', () => {
    const root = build(false)
    expect(find(root, 'close')).toBeUndefined()
    expect(hitTestParts(root, RIGHT_EDGE - 4, CENTER_Y)?.role).not.toBe('close')
  })

  it('draws dotted so a ghost never reads as resting at the venue', () => {
    expect(find(build(true), 'pill').spec.borderDotted).toBe(true)
    expect(find(layout(), 'pill').spec.borderDotted).toBeUndefined()
  })
})

describe('P&L formatting', () => {
  it('renders money the reference way', () => {
    expect(formatPnlMoney(-0.0399612, 'USD')).toBe('− 0.04 USD')
    expect(formatPnlMoney(12.5, 'USD')).toBe('+ 12.50 USD')
    expect(formatPnlMoney(0, 'USD')).toBe('+ 0.00 USD')
  })

  it('omits the cell entirely when the broker reports no P&L', () => {
    expect(formatPnlMoney(null, 'USD')).toBeNull()
    expect(formatPnlTicks(null)).toBeNull()
    expect(formatPnlPercent(null)).toBeNull()
  })

  it('renders ticks and percent', () => {
    expect(formatPnlTicks(-3.25)).toBe('− 3.3 ticks')
    expect(formatPnlTicks(42)).toBe('+ 42 ticks')
    expect(formatPnlPercent(-0.05305743467303356)).toBe('− 0.05%')
  })
})

describe('bracket level side rule', () => {
  const base = { tick: 0.01, anchor: 75.39, mark: 75.35 } as const

  const priceOf = (r: { price: number } | { error: string }) => ('price' in r ? r.price : NaN)

  it('takes a profit above a long and below a short', () => {
    expect(priceOf(boundBracketPrice(75.4567, { ...base, positionSide: 'long', kind: 'tp' }))).toBeCloseTo(75.46, 6)
    expect(priceOf(boundBracketPrice(75.31, { ...base, positionSide: 'short', kind: 'tp' }))).toBeCloseTo(75.31, 6)
  })

  it('REJECTS a target dropped on the losing side rather than flipping it', () => {
    const long = boundBracketPrice(75.2, { ...base, positionSide: 'long', kind: 'tp' })
    expect(long).toEqual({ error: 'Take profit must be above the entry' })
    const short = boundBracketPrice(75.5, { ...base, positionSide: 'short', kind: 'tp' })
    expect(short).toEqual({ error: 'Take profit must be below the entry' })
  })

  it('treats the entry itself as the wrong side — a zero-gain target is not a target', () => {
    expect(boundBracketPrice(75.39, { ...base, positionSide: 'long', kind: 'tp' })).toEqual({
      error: 'Take profit must be above the entry',
    })
  })

  it('refuses to snap without a tick', () => {
    expect(boundBracketPrice(75.46, { anchor: 75.39, positionSide: 'long', kind: 'tp' })).toEqual({
      error: 'Tick size unknown',
    })
  })

  it('routes a stop through the protective-stop gate', () => {
    expect(priceOf(boundBracketPrice(75.2233, { ...base, positionSide: 'long', kind: 'sl' }))).toBeCloseTo(75.22, 6)
  })
})

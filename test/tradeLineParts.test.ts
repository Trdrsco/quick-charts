import { describe, expect, it } from 'vitest'
import {
  buildOrderParts,
  buildPositionParts,
  formatPnlMoney,
  formatPnlPercent,
  formatPnlTicks,
  hitTestParts,
  layoutParts,
  PART_H,
  TRADE_THEME,
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

const POSITION = {
  qty: 1,
  avgPrice: 75.39,
  pnlText: '− 0.04 USD',
  pnlSign: 'loss' as const,
  currency: 'USD',
  supportReverse: true,
  supportClose: true,
  supportBrackets: true,
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
      buildPositionParts({ ...POSITION, supportReverse: false, supportBrackets: false }),
      { rightEdge: RIGHT_EDGE, centerY: CENTER_Y, measure },
    )
    expect(find(root, 'reverse')).toBeUndefined()
    expect(find(root, 'tp')).toBeUndefined()
    expect(find(root, 'close').w).toBe(23)
    expect(root.w).toBe(130)
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
      buildOrderParts({ qty: 2, label: 'LMT', color: '#2962FF', supportCancel: true, supportModifyQty: true }),
      { rightEdge: RIGHT_EDGE, centerY: CENTER_Y, measure },
    )
    expect(find(root, 'close').spec.tooltip).toBe('Cancel order')
    expect(find(root, 'qty').spec.tooltip).toBe('Modify order quantity…')
    expect(find(root, 'qty').spec.text).toBe('2')
  })

  it('omits the ✕ when the order cannot be cancelled', () => {
    const root = layoutParts(
      buildOrderParts({ qty: 1, label: 'STP', color: '#ff9800', supportCancel: false, supportModifyQty: false }),
      { rightEdge: RIGHT_EDGE, centerY: CENTER_Y, measure },
    )
    expect(find(root, 'close')).toBeUndefined()
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

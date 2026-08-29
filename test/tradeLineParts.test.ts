import { describe, expect, it } from 'vitest'
import { boundBracketPrice } from '../src/gesturePlan'
import {
  buildExitParts,
  buildDraftParts,
  buildOrderParts,
  buildPositionParts,
  formatPnlMoney,
  formatPnlPercent,
  formatPnlTicks,
  findPart,
  hitTestParts,
  layoutParts,
  PART_H,
  TOUCH_SLOP_PX,
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
  accent: TRADE_THEME.accent,
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

describe('the pill wears the line colour', () => {
  const short = layoutParts(buildPositionParts({ ...POSITION, qty: -1, accent: TRADE_THEME.loss }), {
    rightEdge: RIGHT_EDGE,
    centerY: CENTER_Y,
    measure,
  })

  it('accents a short in the line colour, not a fixed blue', () => {
    expect(find(short, 'qty').spec.fill).toBe(TRADE_THEME.loss)
    expect(find(short, 'pill').spec.border).toBe(TRADE_THEME.loss)
    expect(find(short, 'reverse').spec.border).toBe(TRADE_THEME.loss)
    expect(find(short, 'close').spec.iconColor).toBe(TRADE_THEME.loss)
  })

  it('derives the dividers and the ✕ hover from that same colour', () => {
    expect(find(short, 'div-qty').spec.fill).toBe(TRADE_THEME.loss)
    expect(find(short, 'div-close').spec.fill).toBe(withAlpha(TRADE_THEME.loss, 0.45))
    expect(find(short, 'close').spec.fillHover).toBe(withAlpha(TRADE_THEME.loss, 0.15))
  })

  it('still shows the bare magnitude for a short', () => {
    expect(find(short, 'qty').spec.text).toBe('1')
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

describe('draft (order ticket) line', () => {
  const draft = (over: Partial<Parameters<typeof buildDraftParts>[0]> = {}) =>
    layoutParts(
      buildDraftParts({
        surface: SURFACE,
        accent: TRADE_THEME.accent,
        sideLabel: 'Buy',
        qty: 1,
        orderType: 'Market',
        supportTakeProfit: true,
        supportStopLoss: true,
        supportCancel: true,
        ...over,
      }),
      { rightEdge: RIGHT_EDGE, centerY: CENTER_Y, measure },
    )

  it('states the side and the ORDER TYPE where a live line shows money', () => {
    const root = draft()
    expect(find(root, 'side').spec.text).toBe('Buy')
    expect(find(root, 'orderType').spec.text).toBe('Market')
    expect(find(root, 'qty').spec.text).toBe('1')
  })

  it('carries the same TP/SL handles as a live position', () => {
    const root = draft()
    expect(find(root, 'tp').spec.dragRole).toBe('tpsl')
    expect(find(root, 'sl').spec.dragRole).toBe('tpsl')
    expect(hitTestParts(root, find(root, 'tp').x + 4, CENTER_Y)?.role).toBe('tp')
  })

  it('retires a handle once that leg is already drafted', () => {
    const root = draft({ supportTakeProfit: false })
    expect(find(root, 'tp')).toBeUndefined()
    expect(find(root, 'sl')).toBeDefined()
  })

  it('works for every order type the ticket can send', () => {
    for (const type of ['Market', 'Limit', 'Stop', 'Stop Limit']) {
      expect(find(draft({ orderType: type }), 'orderType').spec.text).toBe(type)
    }
  })

  it('makes the side chip a submit button, not a readout', () => {
    const root = draft()
    const side = find(root, 'side')
    expect(side.role).toBe('submit')
    expect(hitTestParts(root, side.x + 4, CENTER_Y)?.role).toBe('submit')
    // It is filled solid with the accent, so its hover has to lift from above rather than tint.
    expect(side.spec.fillHover).toBe(TRADE_THEME.onAccentHover)
  })

  it('keeps the size chip and the send chip apart', () => {
    const root = draft()
    const qty = find(root, 'qty')
    const side = find(root, 'side')
    expect(hitTestParts(root, qty.x + 4, CENTER_Y)?.role).toBe('qty')
    expect(hitTestParts(root, side.x + 4, CENTER_Y)?.role).toBe('submit')
    expect(side.x + side.w).toBeLessThan(qty.x)
  })

  it('says why the chip cannot send when it cannot', () => {
    expect(find(draft({ submitTooltip: 'Trading is locked for this account' }), 'side').spec.tooltip).toBe('Trading is locked for this account')
  })

  it('makes the order-type cell a control, not the readout a live line puts there', () => {
    const root = draft()
    const cell = find(root, 'orderType')
    expect(cell.role).toBe('orderType')
    expect(hitTestParts(root, cell.x + 4, CENTER_Y)?.role).toBe('orderType')
    // Separate hit targets, so tapping the size never opens the type menu.
    expect(hitTestParts(root, find(root, 'qty').x + 4, CENTER_Y)?.role).toBe('qty')
  })

  it('carries the ✕ that stands the ticket down', () => {
    expect(hitTestParts(draft(), find(draft(), 'close').x + 4, CENTER_Y)?.role).toBe('close')
    expect(find(draft({ supportCancel: false }), 'close')).toBeUndefined()
  })

  it('locates a chip by role on a line that has moved', () => {
    const root = draft()
    // findPart answers "where is that part now" — the release path uses it because a market draft
    // rides the mark, so the chip is rarely on the pixel it was pressed on.
    expect(findPart(root, 'qty')).toBe(find(root, 'qty'))
    expect(findPart(root, 'submit')).toBe(find(root, 'side'))
    expect(findPart(root, 'reverse')).toBeNull()
  })

  // PHONE. The desktop line is drawn for a chart a few times wider than a phone's, and it was
  // right-aligned, so what ran off the screen was its LEADING part — the side chip. Owner report
  // 2026-08-27: "I can't see the buy/sell thing either".
  describe('on a phone', () => {
    it('drops the side chip, which the phone already carries twice', () => {
      const root = draft({ compact: true })
      // Gone from the tree, not merely hidden: a submit target painted nowhere is worse than none.
      expect(find(root, 'side')).toBeUndefined()
      expect(findPart(root, 'submit')).toBeNull()
    })

    it('keeps every control the phone chrome does NOT already carry', () => {
      const root = draft({ compact: true })
      for (const id of ['qty', 'orderType', 'close', 'tp', 'sl']) expect(find(root, id)).toBeDefined()
    })

    it('stops holding the type cell open at its desktop width', () => {
      // The 82px floor keeps the four types from jostling as you cycle them. On a phone that fixed
      // width is most of the pill, and the jostle is the cheaper of the two costs.
      expect(find(draft({ compact: true }), 'orderType').w).toBeLessThan(find(draft(), 'orderType').w)
    })

    it('fits a 390px phone with room to spare, where the desktop line does not', () => {
      // The real geometry: a 390px screen less a ~56px price scale, less the compact right margin.
      const phone = (over: Partial<Parameters<typeof buildDraftParts>[0]>) =>
        layoutParts(buildDraftParts({ surface: SURFACE, accent: TRADE_THEME.accent, sideLabel: 'Buy', qty: 1, orderType: 'Stop Limit', supportTakeProfit: true, supportStopLoss: true, supportCancel: true, ...over }), {
          rightEdge: 390 - 56 - 12,
          centerY: CENTER_Y,
          measure,
        })
      // The widest type on the narrowest screen — the worst case, and the one that used to hang off.
      expect(phone({ compact: true }).x).toBeGreaterThan(40)
      expect(phone({}).x).toBeLessThan(phone({ compact: true }).x)
    })

    it('never lays a line out off the left edge, however wide it gets', () => {
      // The clamp is the backstop behind the tightening: a tree that outgrows its chart touches the
      // left edge instead of hanging past it, so its first control stays on screen and tappable.
      const squeezed = layoutParts(
        buildDraftParts({ surface: SURFACE, accent: TRADE_THEME.accent, sideLabel: 'Buy', qty: 1, orderType: 'Stop Limit', supportTakeProfit: true, supportStopLoss: true, supportCancel: true }),
        { rightEdge: 80, centerY: CENTER_Y, measure },
      )
      expect(squeezed.x).toBeGreaterThanOrEqual(0)
      expect(find(squeezed, 'qty').x).toBeGreaterThanOrEqual(0)
    })
  })
})

// A part is PART_H tall because that is what the reference draws and what a MOUSE needs. A thumb
// needs about 44, and on a phone these chips are the money path: the send button, the size, the ✕
// that stands a ticket down. So the hit box takes the slop and the paint keeps its 19px.
describe('a control under a thumb', () => {
  const draft = () =>
    layoutParts(
      buildDraftParts({
        surface: SURFACE,
        accent: TRADE_THEME.accent,
        sideLabel: 'Buy',
        qty: 1,
        orderType: 'Market',
        supportTakeProfit: true,
        supportStopLoss: true,
        supportCancel: true,
      }),
      { rightEdge: RIGHT_EDGE, centerY: CENTER_Y, measure },
    )
  const CHIPS: readonly [string, string][] = [
    ['side', 'submit'],
    ['qty', 'qty'],
    ['orderType', 'orderType'],
    ['close', 'close'],
    ['tp', 'tp'],
    ['sl', 'sl'],
  ]

  it('puts a 19px part on a target a thumb can hit', () => {
    expect(PART_H + TOUCH_SLOP_PX * 2).toBeGreaterThanOrEqual(44)
  })

  it('answers a press that lands past an edge the finger is covering', () => {
    const root = draft()
    const side = find(root, 'side')
    const belowTheRow = side.y + PART_H + 8
    expect(hitTestParts(root, side.x + 4, belowTheRow)).toBeNull()
    expect(hitTestParts(root, side.x + 4, belowTheRow, TOUCH_SLOP_PX)?.role).toBe('submit')
  })

  it('never lets a widened control swallow the one beside it', () => {
    const root = draft()
    // Every chip sits within a slop of its neighbours once the boxes grow, so each of these points
    // is inside SEVERAL hit boxes. The one the finger is actually on has to win, or widening the ✕
    // would quietly turn a tap on the size chip into standing the ticket down.
    for (const [id, role] of CHIPS) {
      const n = find(root, id)
      expect(hitTestParts(root, n.x + n.w / 2, CENTER_Y, TOUCH_SLOP_PX)?.role, id).toBe(role)
    }
  })

  it('changes nothing about a press that already landed on its control', () => {
    const root = draft()
    for (const [id] of CHIPS) {
      const n = find(root, id)
      const x = n.x + n.w / 2
      expect(hitTestParts(root, x, CENTER_Y, TOUCH_SLOP_PX)?.id, id).toBe(hitTestParts(root, x, CENTER_Y)?.id)
    }
  })

  it('still falls through to the chart well clear of the row', () => {
    const root = draft()
    expect(hitTestParts(root, find(root, 'side').x + 4, CENTER_Y + 120, TOUCH_SLOP_PX)).toBeNull()
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

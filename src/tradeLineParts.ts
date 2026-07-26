// The trade-line part tree — the layout, hit-test and paint model behind the position/order pills.
//
// A trade line's controls are a tree of parts with resolved rectangles, not glyphs inside a label.
// That distinction is load-bearing: paint and hit-test both derive from ONE resolved rect, so a
// button can never render in a place that doesn't answer a tap. `hitPad` widens the hit box beyond
// the painted box on purpose — a 29px button that only accepts taps inside 29px feels broken at the
// edges.
//
// Everything here is pure apart from `drawParts`: layout takes an injected text-measure function so
// the geometry can be computed (and tested) without a canvas.

/** What a part does when tapped or dragged. `tpsl` parts are dragged OFF the line to set a level. */
export type PartRole =
  | 'reverse'
  | 'tp'
  | 'sl'
  | 'qty'
  | 'pnl'
  | 'close'
  | 'divider'
  | 'spacer'
  | 'group'

export type DragRole = 'tpsl' | null

/** A part's paint + behaviour description. Widths are resolved at layout time: `width` fixed,
 *  `FLEX` stretches, and text parts measure themselves. */
export interface PartSpec {
  id: string
  role: PartRole
  /** Fixed width in px, omitted ⇒ measured from `text` + padding. A NEGATIVE width pulls the next
   *  sibling back over this one, which is how two outlined buttons share a single border seam
   *  instead of drawing two abutting 1px strokes. */
  width?: number
  /** Floor for a measured width, so a live number can't shrink the pill under itself. */
  minWidth?: number
  text?: string
  textColor?: string
  fill?: string
  fillHover?: string
  border?: string
  borderWidth?: number
  borderRadius?: number
  /** Border painted as a 1-on/3-off hairline rather than a solid stroke. */
  borderDotted?: boolean
  paddingX?: number
  font?: string
  /** Hover/press affordance widening, applied to the hit box on both sides. */
  hitPad?: number
  tooltip?: string
  dragRole?: DragRole
  /** An icon glyph drawn centred instead of text (the ✕ and ⇄ marks). */
  icon?: 'close' | 'reverse'
  iconColor?: string
  children?: PartSpec[]
}

export interface LayoutNode {
  id: string
  role: PartRole
  spec: PartSpec
  x: number
  y: number
  w: number
  h: number
  children: LayoutNode[]
}

export interface LayoutCtx {
  /** Right edge the tree is aligned against (the plot's right edge, price scale excluded). */
  rightEdge: number
  /** Vertical centre of the line. */
  centerY: number
  measure: (text: string, font: string) => number
}

// Captured from the reference renderer: every part is 19px tall, controls are 13px system text, and
// the pill's blue is the same blue the line is drawn in.
export const PART_H = 19
export const TRADE_FONT =
  "normal 13px -apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif"

export const TRADE_THEME = {
  line: '#2962FF',
  surface: '#0F0F0F',
  accent: '#2962FF',
  accentPressed: '#1E53E5',
  /** The divider between the P&L cell and the ✕ — deliberately dimmer than the pill border. */
  dividerDim: '#142E61',
  closeHover: 'rgba(41, 98, 255, 0.15)',
  onAccent: '#ffffff',
  profit: '#089981',
  loss: '#F23645',
  tp: '#089981',
  sl: '#ff9800',
  radius: 4,
  paddingX: 7,
  /** The reverse button accepts taps 10px beyond its paint on each side. */
  reverseHitPad: 10,
  /** Gap between the reverse button and the pill, and between the SL button and the pill. */
  gap: 10,
} as const

/** A position's P&L rendered the way the reference does: a true minus sign, the absolute value, and
 *  the account currency as a word. `null` P&L renders nothing rather than a fabricated zero, and an
 *  unknown currency renders the number bare rather than labelling it with a guessed one. */
export function formatPnlMoney(pnl: number | null, currency: string | null): string | null {
  if (pnl == null || !Number.isFinite(pnl)) return null
  const sign = pnl < 0 ? '−' : '+'
  const amount = `${sign} ${Math.abs(pnl).toFixed(2)}`
  return currency ? `${amount} ${currency}` : amount
}

export function formatPnlTicks(ticks: number | null): string | null {
  if (ticks == null || !Number.isFinite(ticks)) return null
  const sign = ticks < 0 ? '−' : '+'
  const a = Math.abs(ticks)
  return `${sign} ${a.toFixed(a < 10 ? 1 : 0)} ticks`
}

export function formatPnlPercent(pct: number | null): string | null {
  if (pct == null || !Number.isFinite(pct)) return null
  const sign = pct < 0 ? '−' : '+'
  return `${sign} ${Math.abs(pct).toFixed(2)}%`
}

export interface PositionPartsInput {
  /** Signed quantity — the badge shows its magnitude, the sign only picks the P&L basis. */
  qty: number
  avgPrice: number | null
  /** Pre-formatted P&L text, or null to omit the cell entirely. */
  pnlText: string | null
  /** Sign of the P&L for colouring; null ⇒ neutral. */
  pnlSign: 'profit' | 'loss' | null
  currency: string
  supportReverse: boolean
  supportClose: boolean
  /** Each handle renders only when the broker can actually act on it — a venue may offer one and
   *  not the other. */
  supportTakeProfit: boolean
  supportStopLoss: boolean
  /** Formats the average price for the P&L cell's tooltip. */
  priceText?: string | null
}

/** The position line's controls: `[⇄] [TP][SL] [qty|P&L|✕]`.
 *  Reverse sits outside the pill; TP/SL are drag handles; the pill carries identity and the close. */
export function buildPositionParts(input: PositionPartsInput): PartSpec {
  const children: PartSpec[] = []

  if (input.supportReverse) {
    children.push({
      id: 'reverse',
      role: 'reverse',
      width: 29,
      icon: 'reverse',
      iconColor: TRADE_THEME.accent,
      fill: TRADE_THEME.surface,
      border: TRADE_THEME.accent,
      borderWidth: 1,
      borderRadius: TRADE_THEME.radius,
      hitPad: TRADE_THEME.reverseHitPad,
      tooltip: 'Reverse Position',
    })
    children.push({ id: 'gap-reverse', role: 'spacer', width: TRADE_THEME.gap })
  }

  const handles: PartSpec[] = []
  if (input.supportTakeProfit) handles.push(bracketButton('tp', 'TP', TRADE_THEME.tp, 'Drag to add Take profit'))
  if (input.supportStopLoss) handles.push(bracketButton('sl', 'SL', TRADE_THEME.sl, 'Drag to add Stop loss'))
  if (handles.length) {
    children.push(handles[0]!)
    // Adjacent handles overlap by a pixel so their borders form one seam rather than two strokes.
    for (const h of handles.slice(1)) {
      children.push({ id: `seam-${h.id}`, role: 'spacer', width: -1 })
      children.push(h)
    }
    children.push({ id: 'gap-handles', role: 'spacer', width: TRADE_THEME.gap })
  }

  const pill: PartSpec[] = [
    // The pill's own 1px border occupies the first column; children start inside it.
    { id: 'pill-inset', role: 'spacer', width: 1 },
    {
      id: 'qty',
      role: 'qty',
      text: String(Math.abs(input.qty)),
      textColor: TRADE_THEME.onAccent,
      fill: TRADE_THEME.accent,
      fillHover: TRADE_THEME.accentPressed,
      paddingX: TRADE_THEME.paddingX,
      font: TRADE_FONT,
      tooltip: '',
    },
  ]

  if (input.pnlText) {
    pill.push({ id: 'div-qty', role: 'divider', width: 1, fill: TRADE_THEME.accent })
    pill.push({
      id: 'pnl',
      role: 'pnl',
      text: input.pnlText,
      textColor:
        input.pnlSign === 'loss'
          ? TRADE_THEME.loss
          : input.pnlSign === 'profit'
            ? TRADE_THEME.profit
            : TRADE_THEME.onAccent,
      fill: TRADE_THEME.surface,
      fillHover: TRADE_THEME.accentPressed,
      paddingX: TRADE_THEME.paddingX,
      // Pinned so a live number can't resize the pill and walk the ✕ out from under the pointer.
      minWidth: 82,
      font: TRADE_FONT,
      tooltip: input.priceText ? `Price ${input.priceText}` : '',
    })
  }

  if (input.supportClose) {
    pill.push({ id: 'div-close', role: 'divider', width: 1, fill: TRADE_THEME.dividerDim })
    pill.push({
      id: 'close',
      role: 'close',
      width: 23,
      icon: 'close',
      iconColor: TRADE_THEME.accent,
      fill: TRADE_THEME.surface,
      fillHover: TRADE_THEME.closeHover,
      borderRadius: 2,
      tooltip: 'Close Position',
    })
  }

  pill.push({ id: 'pill-inset-r', role: 'spacer', width: 1 })

  children.push({
    id: 'pill',
    role: 'group',
    border: TRADE_THEME.accent,
    borderWidth: 1,
    borderRadius: TRADE_THEME.radius,
    children: pill,
  })

  return { id: 'root', role: 'group', children }
}

export interface OrderPartsInput {
  qty: number
  /** Shown in the pill next to the quantity (order type / side wording is the host's call). */
  label: string
  color: string
  supportCancel: boolean
  supportModifyQty: boolean
}

/** A working order's controls: `[qty|label|✕]`. An order's ✕ CANCELS (it does not close a position),
 *  and its quantity badge opens a quantity edit rather than doing nothing. */
export function buildOrderParts(input: OrderPartsInput): PartSpec {
  const pill: PartSpec[] = [
    { id: 'pill-inset', role: 'spacer', width: 1 },
    {
      id: 'qty',
      role: 'qty',
      text: String(Math.abs(input.qty)),
      textColor: TRADE_THEME.onAccent,
      fill: input.color,
      fillHover: TRADE_THEME.accentPressed,
      paddingX: TRADE_THEME.paddingX,
      font: TRADE_FONT,
      tooltip: input.supportModifyQty ? 'Modify order quantity…' : '',
    },
    { id: 'div-qty', role: 'divider', width: 1, fill: input.color },
    {
      id: 'label',
      role: 'pnl',
      text: input.label,
      textColor: input.color,
      fill: TRADE_THEME.surface,
      paddingX: TRADE_THEME.paddingX,
      font: TRADE_FONT,
      tooltip: '',
    },
  ]

  if (input.supportCancel) {
    pill.push({ id: 'div-close', role: 'divider', width: 1, fill: TRADE_THEME.dividerDim })
    pill.push({
      id: 'close',
      role: 'close',
      width: 23,
      icon: 'close',
      iconColor: input.color,
      fill: TRADE_THEME.surface,
      fillHover: TRADE_THEME.closeHover,
      borderRadius: 2,
      tooltip: 'Cancel order',
    })
  }

  pill.push({ id: 'pill-inset-r', role: 'spacer', width: 1 })

  return {
    id: 'root',
    role: 'group',
    children: [
      {
        id: 'pill',
        role: 'group',
        border: input.color,
        borderWidth: 1,
        borderRadius: TRADE_THEME.radius,
        children: pill,
      },
    ],
  }
}

function bracketButton(id: 'tp' | 'sl', text: string, color: string, tooltip: string): PartSpec {
  return {
    id,
    role: id,
    text,
    textColor: color,
    fill: TRADE_THEME.surface,
    border: color,
    borderWidth: 1,
    borderRadius: TRADE_THEME.radius,
    borderDotted: true,
    paddingX: TRADE_THEME.paddingX,
    font: TRADE_FONT,
    dragRole: 'tpsl',
    tooltip,
  }
}

/** Resolve a spec tree to absolute rects, right-aligned so the tree ends at `rightEdge`. */
export function layoutParts(root: PartSpec, ctx: LayoutCtx): LayoutNode {
  const width = measureSpec(root, ctx)
  const x = ctx.rightEdge - width
  const y = Math.round(ctx.centerY - PART_H / 2)
  return place(root, x, y, width, ctx)
}

function measureSpec(spec: PartSpec, ctx: LayoutCtx): number {
  if (spec.children && spec.children.length) {
    return spec.children.reduce((sum, c) => sum + measureSpec(c, ctx), 0)
  }
  if (spec.width != null) return spec.width
  const pad = (spec.paddingX ?? 0) * 2
  const w = spec.text ? ctx.measure(spec.text, spec.font ?? TRADE_FONT) + pad : pad
  return Math.max(w, spec.minWidth ?? 0)
}

function place(spec: PartSpec, x: number, y: number, w: number, ctx: LayoutCtx): LayoutNode {
  const node: LayoutNode = { id: spec.id, role: spec.role, spec, x, y, w, h: PART_H, children: [] }
  if (!spec.children || !spec.children.length) return node
  let cx = x
  for (const child of spec.children) {
    const cw = measureSpec(child, ctx)
    node.children.push(place(child, cx, y, cw, ctx))
    cx += cw
  }
  return node
}

export interface PartHit {
  node: LayoutNode
  role: PartRole
  id: string
  dragRole: DragRole
  tooltip: string | null
}

/** Deepest interactive part containing the point, honouring each part's `hitPad`. Spacers, dividers
 *  and groups never answer — a tap that lands on structure falls through to the chart. */
export function hitTestParts(root: LayoutNode, x: number, y: number): PartHit | null {
  let found: LayoutNode | null = null
  // Descend unconditionally: a control's `hitPad` can push its hit box outside its parent's bounds,
  // so pruning on the parent would swallow exactly the overhang the pad exists to provide.
  const walk = (n: LayoutNode) => {
    const pad = n.spec.hitPad ?? 0
    const inside = x >= n.x - pad && x <= n.x + n.w + pad && y >= n.y && y <= n.y + n.h
    if (inside && isInteractive(n.role)) found = n
    for (const c of n.children) walk(c)
  }
  walk(root)
  if (!found) return null
  const n: LayoutNode = found
  return {
    node: n,
    role: n.role,
    id: n.id,
    dragRole: n.spec.dragRole ?? null,
    tooltip: n.spec.tooltip || null,
  }
}

function isInteractive(role: PartRole): boolean {
  return role === 'reverse' || role === 'tp' || role === 'sl' || role === 'close' || role === 'qty' || role === 'pnl'
}

/** The union box of a laid-out tree — the region to repaint and the bound a pan gesture must clear. */
export function unionRect(root: LayoutNode): { x: number; y: number; w: number; h: number } {
  return { x: root.x, y: root.y, w: root.w, h: root.h }
}

// ── Paint ───────────────────────────────────────────────────────────────────────

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.lineTo(x + w - rr, y)
  ctx.arcTo(x + w, y, x + w, y + rr, rr)
  ctx.lineTo(x + w, y + h - rr)
  ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr)
  ctx.lineTo(x + rr, y + h)
  ctx.arcTo(x, y + h, x, y + h - rr, rr)
  ctx.lineTo(x, y + rr)
  ctx.arcTo(x, y, x + rr, y, rr)
  ctx.closePath()
}

/** A 1-on/3-off hairline whose dash period divides the perimeter evenly, so the dots land flush at
 *  every corner instead of drifting. */
function dottedBorder(ctx: CanvasRenderingContext2D, w: number, h: number, r: number): void {
  const perimeter = 2 * (w + h) - 8 * r + 2 * Math.PI * r
  const target = 4
  const count = Math.max(1, Math.round(perimeter / target))
  ctx.setLineDash([1, perimeter / count - 1])
}

export function drawParts(
  ctx: CanvasRenderingContext2D,
  node: LayoutNode,
  hoveredId: string | null,
): void {
  const s = node.spec
  const hovered = hoveredId === node.id

  if (s.fill || s.border) {
    const fill = hovered && s.fillHover ? s.fillHover : s.fill
    const r = s.borderRadius ?? 0
    if (fill) {
      ctx.save()
      roundRectPath(ctx, node.x, node.y, node.w, node.h, r)
      ctx.fillStyle = fill
      ctx.fill()
      ctx.restore()
    }
    if (s.border && (s.borderWidth ?? 0) > 0) {
      ctx.save()
      roundRectPath(ctx, node.x + 0.5, node.y + 0.5, node.w - 1, node.h - 1, Math.max(0, r - 0.5))
      ctx.strokeStyle = s.border
      ctx.lineWidth = s.borderWidth ?? 1
      if (s.borderDotted) dottedBorder(ctx, node.w, node.h, r)
      ctx.stroke()
      ctx.restore()
    }
  }

  if (s.text) {
    ctx.save()
    ctx.font = s.font ?? TRADE_FONT
    ctx.fillStyle = s.textColor ?? '#ffffff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(s.text, node.x + node.w / 2, node.y + node.h / 2)
    ctx.restore()
  }

  if (s.icon) {
    ctx.save()
    ctx.strokeStyle = s.iconColor ?? TRADE_THEME.accent
    ctx.lineWidth = 1.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    const cx = node.x + node.w / 2
    const cy = node.y + node.h / 2
    if (s.icon === 'close') {
      const a = 3.5
      ctx.beginPath()
      ctx.moveTo(cx - a, cy - a)
      ctx.lineTo(cx + a, cy + a)
      ctx.moveTo(cx + a, cy - a)
      ctx.lineTo(cx - a, cy + a)
      ctx.stroke()
    } else {
      // Two opposed arrows — the reverse mark.
      const a = 4.5
      ctx.beginPath()
      ctx.moveTo(cx - a, cy - 2.5)
      ctx.lineTo(cx + a, cy - 2.5)
      ctx.moveTo(cx + a - 3, cy - 5)
      ctx.lineTo(cx + a, cy - 2.5)
      ctx.lineTo(cx + a - 3, cy)
      ctx.moveTo(cx + a, cy + 2.5)
      ctx.lineTo(cx - a, cy + 2.5)
      ctx.moveTo(cx - a + 3, cy)
      ctx.lineTo(cx - a, cy + 2.5)
      ctx.lineTo(cx - a + 3, cy + 5)
      ctx.stroke()
    }
    ctx.restore()
  }

  for (const c of node.children) drawParts(ctx, c, hoveredId)
}

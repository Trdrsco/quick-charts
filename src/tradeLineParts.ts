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
  /** The draft's side chip. The ONE part on a line that spends money: it sends the composed ticket. */
  | 'submit'
  /** The draft's order-type cell — opens the host's type menu. PRE-MONEY, like the quantity chip. */
  | 'orderType'
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
  /** Hover wash for a chip that is ALREADY filled solid with an accent — a tint of the accent would
   *  vanish into it, so the lift has to come from above in white. */
  onAccentHover: 'rgba(255, 255, 255, 0.18)',
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

/** Re-alpha a `#rgb` / `#rrggbb` / `rgb()` / `rgba()` colour. Used for the drag bands, which are the
 *  LEG's own colour at low opacity — deriving them keeps a re-themed TP/SL line and its band in step,
 *  where a second hard-coded constant would silently drift. */
export function withAlpha(color: string, alpha: number): string {
  const hex = color.trim().replace(/^#/, '')
  if (/^[0-9a-f]{3}$/i.test(hex)) {
    const [r, g, b] = [...hex].map((c) => parseInt(c + c, 16))
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }
  if (/^[0-9a-f]{6}$/i.test(hex)) {
    const n = parseInt(hex, 16)
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
  }
  const m = color.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i)
  if (m) return `rgba(${m[1]}, ${m[2]}, ${m[3]}, ${alpha})`
  return color
}

/** Opacity of the shaded zone an exit level closes into — ONE value for both the hovered zone and the
 *  dragged band. A second treatment for the drag would read as a different thing appearing, when it is
 *  the same zone being narrowed to where the cursor now is. */
export const EXIT_ZONE_ALPHA = 0.15

/** Distance the control pill stops SHORT of the plot's right edge. The reference leaves this gap and
 *  runs the line on through it to the price axis, so the line reads as continuous and the pill never
 *  collides with the scale. Measured at 64px against the reference's own resolved layout. */
export const PILL_RIGHT_MARGIN = 64

/** The price-axis label for a trade line. A TRIGGER (stop) is drawn outlined — dark interior, coloured
 *  border — while a limit or the position average is a solid colour chip. That is the reference's own
 *  distinction, and it is the one glance that separates "this fires at a price" from "this rests at
 *  a price". */
export function drawAxisLabel(
  ctx: CanvasRenderingContext2D,
  o: { x: number; y: number; width: number; color: string; surface: string; text: string; outlined: boolean },
): void {
  const h = PART_H
  const top = Math.round(o.y - h / 2)
  ctx.save()
  const r = 2
  const path = () => {
    ctx.beginPath()
    ctx.moveTo(o.x + r, top)
    ctx.lineTo(o.x + o.width - r, top)
    ctx.arcTo(o.x + o.width, top, o.x + o.width, top + r, r)
    ctx.lineTo(o.x + o.width, top + h - r)
    ctx.arcTo(o.x + o.width, top + h, o.x + o.width - r, top + h, r)
    ctx.lineTo(o.x + r, top + h)
    ctx.arcTo(o.x, top + h, o.x, top + h - r, r)
    ctx.lineTo(o.x, top + r)
    ctx.arcTo(o.x, top, o.x + r, top, r)
    ctx.closePath()
  }
  path()
  ctx.fillStyle = o.outlined ? o.surface : o.color
  ctx.fill()
  if (o.outlined) {
    ctx.strokeStyle = o.color
    ctx.lineWidth = 1
    ctx.stroke()
  }
  ctx.fillStyle = o.outlined ? o.color : TRADE_THEME.onAccent
  ctx.font = '12px -apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, Ubuntu, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(o.text, o.x + o.width / 2, o.y)
  ctx.restore()
}

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
  /** The position LINE's colour. Every accent on the pill — the reverse button, the qty chip, the
   *  dividers, the pill frame, the ✕ — takes it, so a short reads red end to end rather than wearing
   *  a blue that matches nothing else on the chart. */
  accent: string
  /** The chart's own background — the pill paints on it, so it reads as part of the chart rather
   *  than a patch stamped over it, while still occluding the price line beneath. */
  surface: string
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
      iconColor: input.accent,
      fill: input.surface,
      border: input.accent,
      borderWidth: 1,
      borderRadius: TRADE_THEME.radius,
      hitPad: TRADE_THEME.reverseHitPad,
      tooltip: 'Reverse Position',
    })
    children.push({ id: 'gap-reverse', role: 'spacer', width: TRADE_THEME.gap })
  }

  const handles: PartSpec[] = []
  if (input.supportTakeProfit) handles.push(bracketButton('tp', 'TP', TRADE_THEME.tp, 'Drag to add Take profit', input.surface))
  if (input.supportStopLoss) handles.push(bracketButton('sl', 'SL', TRADE_THEME.sl, 'Drag to add Stop loss', input.surface))
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
      fill: input.accent,
      paddingX: TRADE_THEME.paddingX,
      font: TRADE_FONT,
      tooltip: '',
    },
  ]

  if (input.pnlText) {
    pill.push({ id: 'div-qty', role: 'divider', width: 1, fill: input.accent })
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
      fill: input.surface,
      paddingX: TRADE_THEME.paddingX,
      // Pinned so a live number can't resize the pill and walk the ✕ out from under the pointer.
      minWidth: 82,
      font: TRADE_FONT,
      tooltip: input.priceText ? `Price ${input.priceText}` : '',
    })
  }

  if (input.supportClose) {
    pill.push({ id: 'div-close', role: 'divider', width: 1, fill: withAlpha(input.accent, 0.45) })
    pill.push({
      id: 'close',
      role: 'close',
      width: 23,
      icon: 'close',
      iconColor: input.accent,
      fill: input.surface,
      fillHover: withAlpha(input.accent, 0.15),
      tooltip: 'Close Position',
    })
  }

  pill.push({ id: 'pill-inset-r', role: 'spacer', width: 1 })

  children.push({
    id: 'pill',
    role: 'group',
    border: input.accent,
    borderWidth: 1,
    borderRadius: TRADE_THEME.radius,
    children: pill,
  })

  return { id: 'root', role: 'group', children }
}

export interface OrderPartsInput {
  /** The chart's own background — the pill paints on it, so it reads as part of the chart rather
   *  than a patch stamped over it, while still occluding the price line beneath. */
  surface: string
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
      fill: input.surface,
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
      fill: input.surface,
      fillHover: TRADE_THEME.closeHover,
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

export interface ExitPartsInput {
  /** The chart's own background — the pill paints on it, so it reads as part of the chart rather
   *  than a patch stamped over it, while still occluding the price line beneath. */
  surface: string
  /** Which protective leg this is — it picks the whole line's colour. */
  kind: 'tp' | 'sl'
  qty: number
  /** The POTENTIAL result if this level fills, pre-formatted; null omits the cell rather than
   *  inventing a number the multiplier is not known for. */
  pnlText: string | null
  pnlSign: 'profit' | 'loss' | null
  supportCancel: boolean
}

/** A resting protective exit's controls: `[qty │ P&L │ ✕]`.
 *
 *  An exit is NOT labelled with its order type. The reference carries `positivePlColor` /
 *  `negativePlColor` on both `takeProfit.*` and `stopLoss.*`, and shows the POTENTIAL result at that
 *  level — which is the number a trader is actually deciding on. The order type is already implicit
 *  in the line's colour and position, so spending the cell on "SELL LIMIT" says nothing new.
 *
 *  Colour comes from the LEG, not the side: take profits are green and stops orange on both a long
 *  and a short, because the two lines are read as "my target" and "my risk", never as buy vs sell. */
export function buildExitParts(input: ExitPartsInput): PartSpec {
  const color = input.kind === 'tp' ? TRADE_THEME.tp : TRADE_THEME.sl
  const pill: PartSpec[] = [
    { id: 'pill-inset', role: 'spacer', width: 1 },
    {
      id: 'qty',
      role: 'qty',
      text: String(Math.abs(input.qty)),
      textColor: TRADE_THEME.onAccent,
      fill: color,
      paddingX: TRADE_THEME.paddingX,
      font: TRADE_FONT,
      tooltip: '',
    },
  ]
  if (input.pnlText) {
    pill.push({ id: 'div-qty', role: 'divider', width: 1, fill: color })
    pill.push({
      id: 'pnl',
      role: 'pnl',
      text: input.pnlText,
      textColor: input.pnlSign === 'loss' ? TRADE_THEME.loss : input.pnlSign === 'profit' ? TRADE_THEME.profit : color,
      fill: input.surface,
      paddingX: TRADE_THEME.paddingX,
      minWidth: 82,
      font: TRADE_FONT,
      tooltip: input.kind === 'tp' ? 'Take profit' : 'Stop loss',
    })
  }
  if (input.supportCancel) {
    pill.push({ id: 'div-close', role: 'divider', width: 1, fill: color })
    pill.push({
      id: 'close',
      role: 'close',
      width: 23,
      icon: 'close',
      iconColor: color,
      fill: input.surface,
      fillHover: TRADE_THEME.closeHover,
      tooltip: 'Cancel order',
    })
  }
  pill.push({ id: 'pill-inset-r', role: 'spacer', width: 1 })
  return {
    id: 'root',
    role: 'group',
    children: [{ id: 'pill', role: 'group', border: color, borderWidth: 1, borderRadius: TRADE_THEME.radius, children: pill }],
  }
}

export interface DraftPartsInput {
  surface: string
  /** The SIDE's colour — the order is not live, but which way it goes is already decided. */
  accent: string
  sideLabel: string
  qty: number | string
  /** The ticket's tab label ('Market' | 'Limit' | 'Stop Limit' | 'Stop') — rendered verbatim. */
  orderType: string
  supportTakeProfit: boolean
  supportStopLoss: boolean
  supportCancel: boolean
  /** Tooltip on the side chip. Empty when the chip cannot send (no account, or trading locked) — the
   *  caller says WHY there, so the chip explains itself rather than looking inert. */
  submitTooltip?: string
}

/** The order ticket's PENDING order, drawn with the same machinery as a live position: the side takes
 *  the standalone button, TP/SL are the same drag handles, and the pill carries `[qty | type | ✕]`.
 *
 *  The order TYPE sits exactly where a live line shows money, because a pending order has no P&L to
 *  report — what it has is a kind. Everything else is deliberately identical, so the ticket's order and
 *  the position it becomes are visibly the same object at two moments in its life. */
export function buildDraftParts(input: DraftPartsInput): PartSpec {
  const children: PartSpec[] = [
    {
      id: 'side',
      // The chip both STATES the side and sends the ticket at it. It is the only money control on a
      // draft line, so it is the only part here that is gated by the account lock.
      role: 'submit',
      text: input.sideLabel,
      textColor: TRADE_THEME.onAccent,
      fill: input.accent,
      fillHover: TRADE_THEME.onAccentHover,
      paddingX: TRADE_THEME.paddingX,
      font: TRADE_FONT,
      borderRadius: TRADE_THEME.radius,
      tooltip: input.submitTooltip ?? '',
    },
    { id: 'gap-side', role: 'spacer', width: TRADE_THEME.gap },
  ]

  const handles: PartSpec[] = []
  if (input.supportTakeProfit) handles.push(bracketButton('tp', 'TP', TRADE_THEME.tp, 'Drag to add Take profit', input.surface))
  if (input.supportStopLoss) handles.push(bracketButton('sl', 'SL', TRADE_THEME.sl, 'Drag to add Stop loss', input.surface))
  if (handles.length) {
    children.push(handles[0]!)
    for (const h of handles.slice(1)) {
      children.push({ id: `seam-${h.id}`, role: 'spacer', width: -1 })
      children.push(h)
    }
    children.push({ id: 'gap-handles', role: 'spacer', width: TRADE_THEME.gap })
  }

  const pill: PartSpec[] = [
    { id: 'pill-inset', role: 'spacer', width: 1 },
    {
      id: 'qty',
      role: 'qty',
      text: String(input.qty),
      textColor: TRADE_THEME.onAccent,
      fill: input.accent,
      paddingX: TRADE_THEME.paddingX,
      font: TRADE_FONT,
      tooltip: '',
    },
    { id: 'div-qty', role: 'divider', width: 1, fill: input.accent },
    {
      // Where a live line reports money, a draft states its KIND — and that kind is editable, so this
      // cell is a control rather than the readout the position line puts here.
      id: 'orderType',
      role: 'orderType',
      text: input.orderType,
      textColor: input.accent,
      fill: input.surface,
      fillHover: withAlpha(input.accent, 0.15),
      paddingX: TRADE_THEME.paddingX,
      minWidth: 82,
      font: TRADE_FONT,
      tooltip: 'Change order type',
    },
  ]
  if (input.supportCancel) {
    pill.push({ id: 'div-close', role: 'divider', width: 1, fill: withAlpha(input.accent, 0.45) })
    pill.push({
      id: 'close',
      role: 'close',
      width: 23,
      icon: 'close',
      iconColor: input.accent,
      fill: input.surface,
      fillHover: withAlpha(input.accent, 0.15),
      tooltip: 'Discard this order',
    })
  }
  pill.push({ id: 'pill-inset-r', role: 'spacer', width: 1 })

  children.push({
    id: 'pill',
    role: 'group',
    border: input.accent,
    borderWidth: 1,
    borderRadius: TRADE_THEME.radius,
    children: pill,
  })
  return { id: 'root', role: 'group', children }
}

function bracketButton(id: 'tp' | 'sl', text: string, color: string, tooltip: string, surface: string): PartSpec {
  return {
    id,
    role: id,
    text,
    textColor: color,
    fill: surface,
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
  return (
    role === 'reverse' || role === 'tp' || role === 'sl' || role === 'close' || role === 'qty' || role === 'pnl' || role === 'submit' || role === 'orderType'
  )
}

/** The first node with this role, in paint order. Where `hitTestParts` answers "what is under the
 *  pointer", this answers "where is that part now" — which is what a line that MOVES needs at the end
 *  of a gesture, since the part it started on may no longer be under the pointer. */
export function findPart(root: LayoutNode, role: PartRole): LayoutNode | null {
  if (root.role === role) return root
  for (const child of root.children) {
    const hit = findPart(child, role)
    if (hit) return hit
  }
  return null
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

  const r = s.borderRadius ?? 0
  // Base fill first, and the hover wash LAYERED ON TOP rather than swapping for it. The wash is
  // translucent, so replacing the opaque base would let the price line show straight through the
  // control the moment a pointer touched it.
  if (s.fill) {
    ctx.save()
    roundRectPath(ctx, node.x, node.y, node.w, node.h, r)
    ctx.fillStyle = s.fill
    ctx.fill()
    ctx.restore()
  }
  if (hovered && s.fillHover) {
    ctx.save()
    roundRectPath(ctx, node.x, node.y, node.w, node.h, r)
    ctx.fillStyle = s.fillHover
    ctx.fill()
    ctx.restore()
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

  // The border is a FOREGROUND pass, drawn after this part's own children. Children fill their full
  // 19px height, so a border painted before them is immediately overpainted along the top and bottom
  // edges — which is exactly why the pill looked open on those sides. The reference splits its draw
  // the same way, with a separate drawForeground for the surrounding frame.
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

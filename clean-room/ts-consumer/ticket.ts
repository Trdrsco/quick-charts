// The order-ticket consumer: a fresh project installs the ticket tarball beside the seam and mounts
// the ticket over its OWN TradingAdapter — no engine, no workspace source. Compiling against the
// shipped d.ts (skipLibCheck off) is the gate, and the pure submit core runs for real.
import { buildSubmitPlan, createOrderTicket, DARK_TICKET_THEME, ticketStrings, type SymbolSource } from '@trdrs/order-ticket'
import type { PlaceOrderArgs, Placement, TradingAdapter } from '@trdrs/broker'

const symbols: SymbolSource = {
  current: () => 'ESZ2026',
  subscribe: () => () => {},
  currentPrice: () => 5000,
  currentQuote: () => ({ bid: 4999.75, ask: 5000.25 }),
}

const trading: TradingAdapter = {
  broker: {
    async moveOrder() {},
    async setExits() {},
    async flatten() {},
    async cancelOrder() {},
    async placeOrder(args: PlaceOrderArgs): Promise<Placement> {
      return { brokerOrderId: `my-${args.intentKey}`, filledQty: args.orderType === 'market' ? args.qty : 0, avgFillPrice: args.orderType === 'market' ? 5000 : null }
    },
  },
  subscribeAccount(h) {
    h.onSnapshot({ scope: 'my-broker|ACC-1', currency: 'USD', positions: [], orders: [] })
    return () => {}
  },
  async capabilities() {
    return { exits: true, stopLimit: true, orderPreview: 'estimate', symbolLeverage: false }
  },
  async instrumentInfo(symbol) {
    return { instrument: symbol, root: 'ES', name: 'E-mini S&P 500', exchange: 'CME', assetClass: 'futures', tick: 0.25, pointValue: 50, qtyStep: 1, minQty: 1, tradable: true }
  },
  async previewOrder(draft) {
    return { marginRequired: draft.qty * 12_000, currency: 'USD', estimate: true, sufficient: true }
  },
}

export function mount(el: HTMLElement) {
  const ticket = createOrderTicket(el, {
    adapter: trading,
    symbolSource: symbols,
    theme: { ...DARK_TICKET_THEME, fontSize: 12 },
    strings: ticketStrings(),
    events: { onOrderPlaced: (placement) => console.log(placement.brokerOrderId) },
    onConnect: () => {},
  })
  ticket.update({ adapter: null })
  return ticket
}

// The pure core runs without a DOM: the same assembly the mounted ticket submits through.
const plan = buildSubmitPlan({
  scope: 'my-broker|ACC-1',
  instrument: 'ESZ2026',
  root: 'ES',
  side: 'buy',
  qty: 2,
  orderType: 'Limit',
  limitPrice: 5000.13,
  stopPrice: 0,
  stopLimitPrice: 0,
  canSnapEntry: true,
  tick: 0.25,
  markRef: 5001,
  entryRef: 5000.25,
  tif: 'GTC',
  sl: { enabled: true, price: 4990, ticks: 41 },
  tp: { enabled: false, price: 0, ticks: 0 },
  strategy: null,
})
if (!plan.ok || plan.order.price !== 5000.25) throw new Error('the submit core did not snap the limit onto the tick')

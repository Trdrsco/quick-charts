import { describe, expect, it, vi } from 'vitest'
import { createOrderTicket, type TicketSubmit } from '../src/orderTicket'
import type { ChartBroker } from '../src/broker'
import type { PreviewSet } from '../src/tradeLines'

// The ticket controller is the draft's state owner and the ONE submit path — its idempotency,
// its pre-money discipline, and its refusal rules are contract, so they pin here as pure tests.

function harness(overrides?: {
  scope?: string | null
  confirm?: (o: TicketSubmit) => Promise<boolean>
  placeOrder?: (o: TicketSubmit) => Promise<void>
  noPlace?: boolean
  policy?: (price: number) => string[]
}) {
  const placed: TicketSubmit[] = []
  const previews: (PreviewSet | null)[] = []
  const errors: string[] = []
  const actions: string[] = []
  const broker: ChartBroker = {
    async moveOrder() {},
    async setExits() {},
    async flatten() {},
    async cancelOrder() {},
    ...(overrides?.noPlace
      ? {}
      : {
          placeOrder: async (o: TicketSubmit) => {
            placed.push(o)
            await overrides?.placeOrder?.(o)
          },
        }),
  }
  const ticket = createOrderTicket({
    broker,
    instrument: () => 'ES',
    tick: () => 0.25,
    mark: () => 5000.13,
    scope: () => (overrides && 'scope' in overrides ? (overrides.scope ?? null) : 'stub|A1'),
    policy: overrides?.policy ? (price) => overrides.policy!(price) : undefined,
    confirm: overrides?.confirm,
    onChange: (preview) => previews.push(preview),
    onAction: (t) => actions.push(t),
    onError: (m) => errors.push(m),
  })
  return { ticket, placed, previews, errors, actions }
}

describe('the draft composes as preview (pre-money)', () => {
  it('opens at the snapped mark with honest defaults, and every edit only recomposes the preview', () => {
    const h = harness()
    h.ticket.open()
    expect(h.ticket.state()).toEqual({ side: 'buy', qty: 1, orderType: 'limit', price: 5000.25, stopLimitPrice: null })
    const p = h.previews.at(-1)!
    expect(p?.lines).toEqual([{ id: 'ticket-entry', kind: 'entry', price: 5000.25, label: 'Limit', qty: 1, editable: true }])
    expect(p?.side).toBe('buy')
    h.ticket.setQty(3)
    h.ticket.setSide('sell')
    h.ticket.setPrice(4999.87)
    expect(h.ticket.state()).toMatchObject({ qty: 3, side: 'sell', price: 4999.75 }) // snapped
    expect(h.placed).toHaveLength(0) // nothing on the edit path can spend
  })

  it('market drafts carry no lines; stop_limit carries trigger + conversion-limit lines', () => {
    const h = harness()
    h.ticket.open({ orderType: 'market' })
    expect(h.previews.at(-1)?.lines).toEqual([])
    h.ticket.setOrderType('stop_limit')
    const lines = h.previews.at(-1)!.lines
    expect(lines.map((l) => l.id)).toEqual(['ticket-entry', 'ticket-limit'])
    h.ticket.setPrice(5010, 'limit')
    expect(h.ticket.state()?.stopLimitPrice).toBe(5010)
    expect(h.ticket.state()?.price).toBe(5000.25) // the trigger did not move
  })

  it('close clears the preview; a symbol-scoped consumer sees null', () => {
    const h = harness()
    h.ticket.open()
    h.ticket.close()
    expect(h.previews.at(-1)).toBeNull()
    expect(h.ticket.state()).toBeNull()
  })
})

describe('submit — the one spending path', () => {
  it('places the exact composed order and closes the draft', async () => {
    const h = harness()
    h.ticket.open({ side: 'sell', qty: 2, orderType: 'limit', price: 5001 })
    await h.ticket.submit()
    expect(h.placed).toHaveLength(1)
    expect(h.placed[0]).toMatchObject({ instrument: 'ES', side: 'sell', qty: 2, orderType: 'limit', price: 5001, tick: 0.25 })
    expect(h.placed[0]!.intentKey).toMatch(/^ticket\|stub\|A1\|ES\|\d+$/)
    expect(h.actions).toEqual(['Sell 2 Limit placed'])
    expect(h.ticket.state()).toBeNull() // placed ⇒ the draft is done
  })

  it('the intent key is stable across a RETRY and fresh after ANY change to the order', async () => {
    const rejectOnce = vi.fn().mockRejectedValueOnce(new Error('venue hiccup')).mockResolvedValue(undefined)
    const h = harness({ placeOrder: rejectOnce })
    h.ticket.open({ price: 5000 })
    await h.ticket.submit() // rejected — the draft stays
    expect(h.errors).toEqual(['venue hiccup'])
    expect(h.ticket.state()).not.toBeNull()
    await h.ticket.submit() // the RETRY of the same intent
    expect(h.placed[1]!.intentKey).toBe(h.placed[0]!.intentKey)
    h.ticket.open({ price: 5000 })
    h.ticket.setQty(5) // the order changed — the old intent must not cover it
    await h.ticket.submit()
    expect(h.placed[2]!.intentKey).not.toBe(h.placed[0]!.intentKey)
  })

  it('refuses without an armed scope, and never calls a broker that cannot place', async () => {
    const unarmed = harness({ scope: null })
    unarmed.ticket.open()
    await unarmed.ticket.submit()
    expect(unarmed.placed).toHaveLength(0)
    expect(unarmed.errors[0]).toMatch(/No account armed/)

    const mutationOnly = harness({ noPlace: true })
    mutationOnly.ticket.open()
    await mutationOnly.ticket.submit()
    expect(mutationOnly.errors[0]).toMatch(/does not place orders/)
  })

  it('the confirm gate sees the exact payload and a veto leaves the draft editable', async () => {
    const seen: TicketSubmit[] = []
    const h = harness({
      confirm: async (o) => {
        seen.push(o)
        return false
      },
    })
    h.ticket.open({ qty: 4 })
    await h.ticket.submit()
    expect(seen[0]).toMatchObject({ qty: 4, orderType: 'limit' })
    expect(h.placed).toHaveLength(0) // vetoed — no money moved
    expect(h.ticket.state()).not.toBeNull() // the draft survives for editing
  })

  it('the host policy gates the composed entry exactly like a drag', async () => {
    const h = harness({ policy: () => ['price outside the allowed band'] })
    h.ticket.open({ price: 9999 })
    await h.ticket.submit()
    expect(h.placed).toHaveLength(0)
    expect(h.errors[0]).toBe('price outside the allowed band')
  })
})

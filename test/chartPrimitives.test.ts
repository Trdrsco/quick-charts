// The primitives store's laws: handles synthesize exactly the rows the renderer draws, the
// controls map IS the set of callbacks the host registered (buttons-only-when-callbacks as data),
// the dispatcher routes each renderer verb to the right handle's callback, a refused move reverts,
// and a removed handle is inert.
import { describe, expect, it, vi } from 'vitest'
import { createPrimitivesStore } from '../src/chartPrimitives'

const store = () => {
  const notify = vi.fn()
  return { s: createPrimitivesStore(notify), notify }
}

describe('row synthesis', () => {
  it('an order line is one working row; price lands on the leg its type rests at', () => {
    const { s } = store()
    const line = s.createOrderLine({ side: 'sell', orderType: 'stop', price: 4990, qty: 3 })
    const [row] = s.snapshot().orders
    expect(row).toMatchObject({ side: 'sell', orderType: 'stop', triggerPrice: 4990, limitPrice: null, qty: 3, status: 'working' })
    line.setPrice(4991)
    expect(s.snapshot().orders[0]!.triggerPrice).toBe(4991)
    expect(line.getPrice()).toBe(4991)
  })

  it('a position line keys the row by its own id and holds honesty on unknowns', () => {
    const { s } = store()
    const line = s.createPositionLine({ qty: -2 })
    const [row] = s.snapshot().positions
    expect(row!.qty).toBe(-2)
    expect(row!.avgPrice).toBeNull() // no price set yet — never a zero dressed as a level
    expect(row!.unrealizedPnl).toBeNull()
    line.setPrice(5000.25).setUnrealizedPnl(-12.5)
    expect(s.snapshot().positions[0]).toMatchObject({ avgPrice: 5000.25, unrealizedPnl: -12.5 })
    // A second position line is a second ROW: instruments are per-handle, never netted.
    s.createPositionLine({ qty: 1 })
    const instruments = s.snapshot().positions.map((p) => p.instrument)
    expect(new Set(instruments).size).toBe(2)
  })

  it('an execution shape is one fill', () => {
    const { s } = store()
    const shape = s.createExecutionShape({ direction: 'sell', price: 101.5, timeSecs: 1_750_000_000, qty: 2 })
    expect(s.executions()[0]).toMatchObject({ side: 'sell', price: 101.5, timeSecs: 1_750_000_000, qty: 2 })
    shape.setDirection('buy').setQuantity(4)
    expect(s.executions()[0]).toMatchObject({ side: 'buy', qty: 4 })
  })
})

describe('the controls map is the registered callbacks', () => {
  it('starts all-false and flips exactly what a handle registers', () => {
    const { s } = store()
    const line = s.createOrderLine()
    const id = s.snapshot().orders[0]!.brokerOrderId
    expect(s.controls().orders?.[id]).toEqual({ cancel: false, move: false, modifyQty: false })
    line.onCancel(() => {}).onMove(() => {})
    expect(s.controls().orders?.[id]).toEqual({ cancel: true, move: true, modifyQty: false })

    const pos = s.createPositionLine()
    const pid = s.snapshot().positions[0]!.instrument
    expect(s.controls().positions?.[pid]).toEqual({ close: false, reverse: false })
    pos.onClose(() => {})
    expect(s.controls().positions?.[pid]).toEqual({ close: true, reverse: false })
  })
})

describe('the dispatcher', () => {
  it('routes cancel / close / reverse to the RIGHT handle only', async () => {
    const { s } = store()
    const cancelled = vi.fn()
    const closed = vi.fn()
    const reversed = vi.fn()
    s.createOrderLine().onCancel(cancelled)
    const other = vi.fn()
    s.createOrderLine().onCancel(other)
    s.createPositionLine().onClose(closed).onReverse(reversed)
    const orderId = s.snapshot().orders[0]!.brokerOrderId
    const posId = s.snapshot().positions[0]!.instrument

    await s.broker.cancelOrder(orderId)
    expect(cancelled).toHaveBeenCalledTimes(1)
    expect(other).not.toHaveBeenCalled()

    await s.broker.flatten(posId)
    expect(closed).toHaveBeenCalledTimes(1)
    await expect(s.broker.reversePosition!({ instrument: posId, intentKey: 'k' })).resolves.toEqual({ cancelledOrders: 0 })
    expect(reversed).toHaveBeenCalledTimes(1)
  })

  it('a move commits to the handle FIRST, then fires; a throwing callback reverts and rejects', async () => {
    const { s } = store()
    const seen: number[] = []
    const line = s.createOrderLine({ orderType: 'limit', price: 100 })
    line.onMove((p) => {
      seen.push(p, line.getPrice())
    })
    const id = s.snapshot().orders[0]!.brokerOrderId
    await s.broker.moveOrder({ brokerOrderId: id, instrument: id, side: 'buy', qty: 1, orderType: 'limit', price: 101, intentKey: 'k' })
    expect(seen).toEqual([101, 101]) // the handle already reads the dropped price inside the callback
    expect(line.getPrice()).toBe(101)

    line.onMove(() => {
      throw new Error('band refused')
    })
    await expect(
      s.broker.moveOrder({ brokerOrderId: id, instrument: id, side: 'buy', qty: 1, orderType: 'limit', price: 102, intentKey: 'k' }),
    ).rejects.toThrow('band refused')
    expect(line.getPrice()).toBe(101) // reverted
  })

  it('fireModify routes the quantity-chip tap', () => {
    const { s } = store()
    const modify = vi.fn()
    s.createOrderLine().onModify(modify)
    s.fireModify(s.snapshot().orders[0]!.brokerOrderId)
    expect(modify).toHaveBeenCalledTimes(1)
  })
})

describe('removal', () => {
  it('a removed handle leaves no row, dispatches nowhere, and its setters stop notifying', async () => {
    const { s, notify } = store()
    const cancelled = vi.fn()
    const line = s.createOrderLine({ price: 100 }).onCancel(cancelled)
    const id = s.snapshot().orders[0]!.brokerOrderId
    line.remove()
    expect(s.snapshot().orders).toHaveLength(0)
    await s.broker.cancelOrder(id)
    expect(cancelled).not.toHaveBeenCalled()
    const calls = notify.mock.calls.length
    line.setPrice(105)
    line.remove() // idempotent
    expect(notify.mock.calls.length).toBe(calls)
  })

  it('hasLines / hasShapes report presence for the lazy attachments', () => {
    const { s } = store()
    expect(s.hasLines()).toBe(false)
    expect(s.hasShapes()).toBe(false)
    const line = s.createPositionLine()
    const shape = s.createExecutionShape()
    expect(s.hasLines()).toBe(true)
    expect(s.hasShapes()).toBe(true)
    line.remove()
    shape.remove()
    expect(s.hasLines()).toBe(false)
    expect(s.hasShapes()).toBe(false)
  })
})

// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { createDocuments } from '../../src/drawings/layer/documents'
import { DRAWING_CONTEXT_VERSION, emptyDrawingDocument, type DrawingResourceContext, type DrawingsBody } from '../../src/drawings/document'
import type { DrawingsMeta, ResourceStore } from '../../src/resources'

const deferred = <T>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

const context = (id: string): DrawingResourceContext => ({ version: DRAWING_CONTEXT_VERSION, kind: 'chart-local', layoutId: 'desk', chartId: id, symbol: 'ES' })

describe('drawing document identity lifetimes', () => {
  it.each(['success', 'conflict'] as const)('drops a delayed upload %s after identity rebind', async (kind) => {
    let id = 'one'
    const first = deferred<
      { kind: 'ok'; ref: { id: string; revision: string } } |
      { kind: 'conflict'; current: { id: string; revision: string } }
    >()
    const creates = vi.fn(() => first.promise)
    const updates = vi.fn()
    const secondCreates = vi.fn(async () => ({ kind: 'ok' as const, ref: { id: 'new', revision: '1' } }))
    const stores = new Map<string, ResourceStore<DrawingsMeta, DrawingsBody>>()
    stores.set('one', {
      list: async () => [], load: async () => null, create: creates, update: updates, remove: async () => ({ kind: 'not-found' }),
    } as unknown as ResourceStore<DrawingsMeta, DrawingsBody>)
    stores.set('two', {
      list: async () => [], load: async () => null, create: secondCreates, update: updates, remove: async () => ({ kind: 'not-found' }),
    } as unknown as ResourceStore<DrawingsMeta, DrawingsBody>)
    const docs = createDocuments({
      port: { context: () => context(id), store: (ctx) => stores.get((ctx as Extract<DrawingResourceContext, { kind: 'chart-local' }>).chartId)! },
      owner: { source: 'main', pane: 'main' }, chartId: () => id, current: () => 'ES', onDocument: vi.fn(), onConflict: vi.fn(),
    })
    docs.adopt('ES', emptyDrawingDocument(context('one')), null)
    docs.sync('ES', [{ id: 'old', type: 'trend_line', anchors: [], props: {} } as never])
    docs.persist('ES')
    docs.flush()
    await Promise.resolve()
    expect(creates).toHaveBeenCalledOnce()
    id = 'two'
    docs.rebind()
    first.resolve(kind === 'success'
      ? { kind: 'ok', ref: { id: 'old', revision: '1' } }
      : { kind: 'conflict', current: { id: 'old', revision: '2' } })
    await Promise.resolve()
    await Promise.resolve()
    docs.adopt('ES', emptyDrawingDocument(context('two')), null)
    docs.sync('ES', [{ id: 'new', type: 'trend_line', anchors: [], props: {} } as never])
    docs.persist('ES')
    docs.flush()
    await Promise.resolve()
    await Promise.resolve()
    expect(secondCreates).toHaveBeenCalledOnce()
    expect(updates).not.toHaveBeenCalled()
    docs.destroy()
  })
})

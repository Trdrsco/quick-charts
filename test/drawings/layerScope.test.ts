// @vitest-environment happy-dom
// Who a NEW drawing belongs to, whichever gesture made it. Placement, the menu clone, a paste and
// a modifier-drag copy all mint a fresh object, so all four take the scope the sync switch says a
// new drawing takes; the object they were made from keeps its own.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { memorySaveLoadAdapter } from '../../src/resources'
import { drag, click } from './fakeChart'
import { documentOf, rig, sharedPort, type Rig } from './layerRig'

let rigs: Rig[] = []
const make = (options?: Parameters<typeof rig>[0]): Rig => {
  const r = rig(options)
  rigs.push(r)
  return r
}

beforeEach(() => {
  rigs = []
})
afterEach(() => {
  for (const r of rigs) {
    r.handle.destroy()
    r.container.remove()
  }
  vi.useRealTimers()
})

describe('the scope a new drawing takes', () => {
  it('binds a modifier-drag copy of a shared drawing to this chart while sync is off, and leaves the original shared', () => {
    const { container, handle, workflow } = make({ chartId: 'c1' })
    handle.armTool('rectangle')
    drag(container, [10, 10], [100, 100])
    expect(handle.export()[0]?.scope).toBeUndefined()

    workflow.syncAcrossPanes = false
    drag(container, [10, 55], [110, 55], { ctrlKey: true })
    expect(handle.export().map((d) => d.scope)).toEqual([undefined, 'c1'])
  })

  it('leaves a modifier-drag copy shared while sync is on', () => {
    const { container, handle } = make({ chartId: 'c1' })
    handle.armTool('rectangle')
    drag(container, [10, 10], [100, 100])
    drag(container, [10, 55], [110, 55], { ctrlKey: true })
    expect(handle.export().map((d) => d.scope)).toEqual([undefined, undefined])
  })

  it('keeps a modifier-drag copy of a chart-bound drawing shared once sync is back on', () => {
    const { container, handle, workflow } = make({ chartId: 'c1' })
    workflow.syncAcrossPanes = false
    handle.armTool('rectangle')
    drag(container, [10, 10], [100, 100])
    workflow.syncAcrossPanes = true
    drag(container, [10, 55], [110, 55], { ctrlKey: true })
    expect(handle.export().map((d) => d.scope)).toEqual(['c1', undefined])
  })

  it('leaves nothing behind when a modifier-press never moves', () => {
    const { container, handle, workflow } = make({ chartId: 'c1' })
    handle.armTool('rectangle')
    drag(container, [10, 10], [100, 100])
    workflow.syncAcrossPanes = false
    click(container, 10, 55, { ctrlKey: true })
    expect(handle.export().map((d) => d.scope)).toEqual([undefined])
  })

  it('binds a placement, a menu clone and a paste the same way', () => {
    const { container, handle, workflow } = make({ chartId: 'c1' })
    workflow.syncAcrossPanes = false
    handle.armTool('rectangle')
    drag(container, [10, 10], [100, 100])
    handle.clone()
    handle.copy()
    handle.paste()
    expect(handle.export().map((d) => d.scope)).toEqual(['c1', 'c1', 'c1'])
  })

  it('keeps a peer chart of the same document from painting a modifier-drag copy made while sync was off', async () => {
    vi.useFakeTimers()
    const adapter = memorySaveLoadAdapter()
    const a = make({ documents: sharedPort(adapter), chartId: 'chart-1' })
    a.handle.armTool('rectangle')
    drag(a.container, [10, 10], [100, 100])
    a.workflow.syncAcrossPanes = false
    drag(a.container, [10, 55], [110, 55], { ctrlKey: true })
    await vi.advanceTimersByTimeAsync(300)
    await vi.advanceTimersByTimeAsync(0)

    const stored = await documentOf(adapter, sharedPort(adapter).context('ES'))
    expect(stored?.body.entries.map((e) => (e.state as { scope?: string }).scope)).toEqual([undefined, 'chart-1'])

    const b = make({ documents: sharedPort(adapter), chartId: 'chart-2' })
    await vi.advanceTimersByTimeAsync(0)
    expect(b.handle.count()).toBe(1)
  })
})

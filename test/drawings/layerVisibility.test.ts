// @vitest-environment happy-dom
// Hiding one drawing, and how long that lasts. A hidden drawing has no control of its own once it
// is off screen, so a fresh layer brings every stored hidden drawing back rather than stranding it.
// Within one layer's life the viewer's hide is the truth: a symbol switch, a document landing and
// a restore all keep it, and none of them writes an unhide back into the document.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { memorySaveLoadAdapter } from '../../src/resources'
import { drag } from './fakeChart'
import { documentOf, rig, sharedPort, type Rig } from './layerRig'

let rigs: Rig[] = []
const make = (options?: Parameters<typeof rig>[0]): Rig => {
  const r = rig(options)
  rigs.push(r)
  return r
}
const visibility = (r: Rig): (boolean | undefined)[] => r.handle.export().map((d) => d.options?.visible)

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

describe('a hidden drawing through the session', () => {
  it('stays hidden across a symbol switch and back', () => {
    const r = make()
    r.handle.armTool('rectangle')
    drag(r.container, [10, 10], [100, 100])
    r.handle.hideSelected()
    expect(visibility(r)).toEqual([false])

    r.handle.setSymbol('NQ')
    expect(r.handle.count()).toBe(0)
    r.handle.setSymbol('ES')
    expect(visibility(r)).toEqual([false])
  })

  it('stays hidden when a stored document lands on the symbol it is drawn on', async () => {
    vi.useFakeTimers()
    const adapter = memorySaveLoadAdapter()
    const r = make({ documents: sharedPort(adapter), chartId: 'chart-1' })
    r.handle.armTool('rectangle')
    drag(r.container, [10, 10], [100, 100])
    r.handle.hideSelected()
    await vi.advanceTimersByTimeAsync(300)
    await vi.advanceTimersByTimeAsync(0)

    const found = await r.handle.documents!.get()
    expect(found.kind).toBe('ok')
    if (found.kind !== 'ok') return
    expect(r.handle.documents!.apply(found.document, found.ref).kind).toBe('ok')
    expect(visibility(r)).toEqual([false])
  })

  it('stays hidden through a restore of the layer content, and through an unrelated edit', () => {
    const r = make()
    r.handle.armTool('rectangle')
    drag(r.container, [10, 10], [100, 100])
    r.handle.armTool('rectangle')
    drag(r.container, [200, 10], [300, 100])
    r.handle.select(r.handle.export()[0]!.id)
    r.handle.hideSelected()

    r.handle.select(r.handle.export()[1]!.id)
    r.handle.updateStyle({ lineWidth: 4 })
    expect(visibility(r)).toEqual([false, true])

    r.handle.restore(r.handle.export())
    expect(visibility(r)).toEqual([false, true])
  })

  it('writes the hide, and never writes an unhide back after a return visit', async () => {
    vi.useFakeTimers()
    const adapter = memorySaveLoadAdapter()
    const r = make({ documents: sharedPort(adapter), chartId: 'chart-1' })
    r.handle.armTool('rectangle')
    drag(r.container, [10, 10], [100, 100])
    r.handle.hideSelected()
    await vi.advanceTimersByTimeAsync(300)
    await vi.advanceTimersByTimeAsync(0)

    r.handle.setSymbol('NQ')
    r.handle.setSymbol('ES')
    r.handle.select(r.handle.export()[0]!.id)
    r.handle.updateStyle({ lineWidth: 3 })
    await vi.advanceTimersByTimeAsync(300)
    await vi.advanceTimersByTimeAsync(0)

    const stored = await documentOf(adapter, sharedPort(adapter).context('ES'))
    expect(stored?.body.entries.map((e) => (e.state as { options?: { visible?: boolean } }).options?.visible)).toEqual([false])
  })

  it('brings a stored hidden drawing back for a fresh layer, which is the only way to reach it again', async () => {
    vi.useFakeTimers()
    const adapter = memorySaveLoadAdapter()
    const a = make({ documents: sharedPort(adapter), chartId: 'chart-1' })
    a.handle.armTool('rectangle')
    drag(a.container, [10, 10], [100, 100])
    a.handle.hideSelected()
    await vi.advanceTimersByTimeAsync(300)
    await vi.advanceTimersByTimeAsync(0)

    const b = make({ documents: sharedPort(adapter), chartId: 'chart-2' })
    await vi.advanceTimersByTimeAsync(0)
    expect(visibility(b)).toEqual([true])
  })

  it('keeps the eye and the timeframe visibility apart from one drawing being hidden', () => {
    const r = make()
    r.handle.armTool('rectangle')
    drag(r.container, [10, 10], [100, 100])
    r.handle.armTool('rectangle')
    drag(r.container, [200, 10], [300, 100])
    r.handle.select(r.handle.export()[0]!.id)
    r.handle.hideSelected()

    r.handle.setAllHidden(true)
    expect(r.handle.allHidden()).toBe(true)
    r.handle.setAllHidden(false)
    expect(r.handle.allHidden()).toBe(false)
    expect(visibility(r)).toEqual([false, true])

    r.handle.select(r.handle.export()[1]!.id)
    r.handle.setVisibilityPreset('current-only')
    r.handle.setSymbol('NQ')
    r.handle.setSymbol('ES')
    expect(visibility(r)).toEqual([false, true])
    expect(r.handle.export()[1]?.options?.visibility).toBeDefined()
  })
})

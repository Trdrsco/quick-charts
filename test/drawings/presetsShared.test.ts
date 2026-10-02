// @vitest-environment happy-dom
// Tool defaults and named templates belong to the viewer, not to one chart. Two layers reading the
// same template store answer from one cache, so a default remembered on chart A is what chart B
// places with next, and a template saved or deleted on either shows in both menus. Separate stores
// stay separate, hydration never lands over a newer local edit, and the cache outlives one layer
// only as long as another still holds it.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { memorySaveLoadAdapter, type ResourceStore, type TemplateBody, type TemplateMeta, type WriteOutcome } from '../../src/resources'
import { DrawingTemplates } from '../../src/drawings/index'
import { drag } from './fakeChart'
import { rig, type Rig } from './layerRig'

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

interface HeldMutation {
  body: TemplateBody | null
  resolve(): void
  reject(): void
}

/** A real revisioned store with only default-row mutations held at its boundary. Reads and named
 * template writes stay live, so a named-template reload can expose an incorrectly unprotected
 * default exactly as it can against a remote adapter. */
const heldDefaultMutations = (inner: ResourceStore<TemplateMeta, TemplateBody>) => {
  const held: HeldMutation[] = []
  const wait = <T>(body: TemplateBody | null, run: () => Promise<WriteOutcome<T>>): Promise<WriteOutcome<T>> =>
    new Promise((resolve, reject) => held.push({ body, resolve: () => void run().then(resolve, reject), reject: () => reject(new Error('store away')) }))
  const store: ResourceStore<TemplateMeta, TemplateBody> = {
    list: (signal) => inner.list(signal),
    load: (id, signal) => inner.load(id, signal),
    create: (body, signal) => (body.name === '' ? wait(body, () => inner.create(body, signal)) : inner.create(body, signal)),
    update: (ref, body, signal) => (body.name === '' ? wait(body, () => inner.update(ref, body, signal)) : inner.update(ref, body, signal)),
    remove: (ref, signal) => wait(null, () => inner.remove(ref, signal)),
  }
  return { store, held }
}

/** A real revisioned store with named-template writes held after the cache has changed locally. */
const heldNamedMutations = (inner: ResourceStore<TemplateMeta, TemplateBody>) => {
  const held: HeldMutation[] = []
  const wait = <T>(body: TemplateBody | null, run: () => Promise<WriteOutcome<T>>): Promise<WriteOutcome<T>> =>
    new Promise((resolve, reject) => held.push({ body, resolve: () => void run().then(resolve, reject), reject: () => reject(new Error('store away')) }))
  const store: ResourceStore<TemplateMeta, TemplateBody> = {
    list: (signal) => inner.list(signal),
    load: (id, signal) => inner.load(id, signal),
    create: (body, signal) => (body.name === '' ? inner.create(body, signal) : wait(body, () => inner.create(body, signal))),
    update: (ref, body, signal) => (body.name === '' ? inner.update(ref, body, signal) : wait(body, () => inner.update(ref, body, signal))),
    remove: (ref, signal) => wait(null, () => inner.remove(ref, signal)),
  }
  return { store, held }
}

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

describe('two charts over one template store', () => {
  it('places on B with the default an edit on A remembered', async () => {
    const store = memorySaveLoadAdapter().templates('drawing')
    const a = make({ templates: store })
    const b = make({ templates: store })
    await settle()

    a.handle.armTool('trend_line')
    drag(a.container, [10, 10], [100, 100])
    a.handle.updateStyle({ lineWidth: 7 })

    b.handle.armTool('trend_line')
    drag(b.container, [10, 10], [100, 100])
    expect(b.handle.export()[0]?.style.lineWidth).toBe(7)
  })

  it('shows a template saved on A in B, and drops it from both when either removes it', async () => {
    const store = memorySaveLoadAdapter().templates('drawing')
    const a = make({ templates: store })
    const b = make({ templates: store })
    await settle()

    const seen: number[] = []
    b.handle.presets.subscribe(() => seen.push(b.handle.presets.templatesFor('trend_line').length))
    await a.handle.presets.saveTemplate('trend_line', 'Thick', { style: { lineWidth: 5 } })
    expect(b.handle.presets.templatesFor('trend_line').map((t) => t.name)).toEqual(['Thick'])
    expect(seen.length).toBeGreaterThan(0)

    await b.handle.presets.removeTemplate('trend_line', 'Thick')
    expect(a.handle.presets.templatesFor('trend_line')).toEqual([])
  })

  it('leaves the drawings already on either chart exactly as they were', async () => {
    const store = memorySaveLoadAdapter().templates('drawing')
    const a = make({ templates: store })
    const b = make({ templates: store })
    await settle()

    b.handle.armTool('trend_line')
    drag(b.container, [10, 10], [100, 100])
    const before = b.handle.export()[0]!.style.lineWidth

    a.handle.armTool('trend_line')
    drag(a.container, [10, 10], [100, 100])
    a.handle.updateStyle({ lineWidth: 9 })
    expect(b.handle.export()[0]?.style.lineWidth).toBe(before)
  })

  it('keeps two independent stores apart', async () => {
    const a = make({ templates: memorySaveLoadAdapter().templates('drawing') })
    const b = make({ templates: memorySaveLoadAdapter().templates('drawing') })
    await settle()

    await a.handle.presets.saveTemplate('trend_line', 'Mine', { style: { lineWidth: 5 } })
    expect(b.handle.presets.templatesFor('trend_line')).toEqual([])
  })

  it('serves a later chart from the cache the first one already filled', async () => {
    const store = memorySaveLoadAdapter().templates('drawing')
    const a = make({ templates: store })
    await settle()
    await a.handle.presets.saveTemplate('rectangle', 'Shaded', { style: { fillOpacity: 0.2 } })

    const b = make({ templates: store })
    expect(b.handle.presets.templatesFor('rectangle').map((t) => t.name)).toEqual(['Shaded'])
  })
})

describe('the cache while the store is still answering', () => {
  it('keeps a default remembered during the first read rather than letting the read overwrite it', async () => {
    const store = memorySaveLoadAdapter().templates('drawing')
    await new DrawingTemplates(store).rememberDefault('trend_line', { style: { lineWidth: 2 } })

    // The layer's first read is in flight: an edit made now is newer than anything it carries back.
    const r = make({ templates: store })
    r.handle.armTool('trend_line')
    drag(r.container, [10, 10], [100, 100])
    r.handle.updateStyle({ lineWidth: 11 })
    await settle()
    expect(r.handle.presets.defaultFor('trend_line').style?.lineWidth).toBe(11)
  })

  it('keeps a default cleared during the first read cleared', async () => {
    const store = memorySaveLoadAdapter().templates('drawing')
    await new DrawingTemplates(store).rememberDefault('trend_line', { style: { lineWidth: 2 } })

    const r = make({ templates: store })
    void r.handle.presets.clearDefault('trend_line')
    await settle()
    expect(r.handle.presets.defaultFor('trend_line')).toEqual({})
  })

  it('orders two remembers and does not let a named-template reload replace the newer pending value', async () => {
    const inner = memorySaveLoadAdapter().templates('drawing')
    await new DrawingTemplates(inner).rememberDefault('trend_line', { style: { lineWidth: 2 } })
    const controlled = heldDefaultMutations(inner)
    const r = make({ templates: controlled.store })
    await settle()

    r.handle.armTool('trend_line')
    drag(r.container, [10, 10], [100, 100])
    r.handle.updateStyle({ lineWidth: 4 })
    r.handle.updateStyle({ lineWidth: 9 })
    await settle()
    expect(controlled.held).toHaveLength(1)

    controlled.held.shift()!.resolve()
    await settle()
    expect(controlled.held).toHaveLength(1)
    await r.handle.presets.saveTemplate('trend_line', 'Named', { style: { lineWidth: 3 } })
    expect(r.handle.presets.defaultFor('trend_line').style?.lineWidth).toBe(9)

    controlled.held.shift()!.resolve()
    await settle()
  })

  it('orders remember before clear and does not let a reload resurrect the cleared default', async () => {
    const inner = memorySaveLoadAdapter().templates('drawing')
    await new DrawingTemplates(inner).rememberDefault('trend_line', { style: { lineWidth: 2 } })
    const controlled = heldDefaultMutations(inner)
    const r = make({ templates: controlled.store })
    await settle()

    r.handle.armTool('trend_line')
    drag(r.container, [10, 10], [100, 100])
    r.handle.updateStyle({ lineWidth: 9 })
    const clearing = r.handle.presets.clearDefault('trend_line')
    await settle()
    expect(r.handle.presets.defaultFor('trend_line')).toEqual({})
    expect(controlled.held).toHaveLength(1)

    controlled.held.shift()!.resolve()
    await settle()
    expect(controlled.held).toHaveLength(1)
    await r.handle.presets.saveTemplate('trend_line', 'Named', { style: { lineWidth: 3 } })
    expect(r.handle.presets.defaultFor('trend_line')).toEqual({})

    controlled.held.shift()!.resolve()
    await clearing
  })

  it('admits a clear before its subscriber remembers a newer default', async () => {
    const inner = memorySaveLoadAdapter().templates('drawing')
    await new DrawingTemplates(inner).rememberDefault('trend_line', { style: { lineWidth: 2 } })
    const controlled = heldDefaultMutations(inner)
    const a = make({ templates: controlled.store })
    await settle()

    a.handle.armTool('trend_line')
    drag(a.container, [10, 10], [100, 100])
    let reacted = false
    a.handle.presets.subscribe(() => {
      if (reacted) return
      reacted = true
      a.handle.updateStyle({ lineWidth: 9 })
    })

    const clearing = a.handle.presets.clearDefault('trend_line')
    await settle()
    expect(controlled.held).toHaveLength(1)
    controlled.held.shift()!.resolve()
    await settle()
    expect(controlled.held).toHaveLength(1)
    controlled.held.shift()!.resolve()
    await clearing
    await settle()

    a.handle.destroy()
    const b = make({ templates: controlled.store })
    await settle()
    expect(b.handle.presets.defaultFor('trend_line').style?.lineWidth).toBe(9)
  })

  it('keeps the cleared cache alive when its subscriber replaces the last holder', async () => {
    const inner = memorySaveLoadAdapter().templates('drawing')
    await new DrawingTemplates(inner).rememberDefault('trend_line', { style: { lineWidth: 2 } })
    const controlled = heldDefaultMutations(inner)
    const a = make({ templates: controlled.store })
    await settle()

    let b: Rig | undefined
    a.handle.presets.subscribe(() => {
      if (b) return
      a.handle.destroy()
      b = make({ templates: controlled.store })
    })
    const clearing = a.handle.presets.clearDefault('trend_line')
    await settle()
    expect(controlled.held).toHaveLength(1)
    controlled.held.shift()!.resolve()
    await clearing
    await settle()
    expect(b?.handle.presets.defaultFor('trend_line')).toEqual({})
  })

  it('keeps a locally remembered default after its write fails and a later reload succeeds', async () => {
    const inner = memorySaveLoadAdapter().templates('drawing')
    await new DrawingTemplates(inner).rememberDefault('trend_line', { style: { lineWidth: 2 } })
    const controlled = heldDefaultMutations(inner)
    const r = make({ templates: controlled.store })
    await settle()

    r.handle.armTool('trend_line')
    drag(r.container, [10, 10], [100, 100])
    r.handle.updateStyle({ lineWidth: 9 })
    await settle()
    controlled.held.shift()!.reject()
    await settle()

    await r.handle.presets.saveTemplate('trend_line', 'Named', { style: { lineWidth: 3 } })
    expect(r.handle.presets.defaultFor('trend_line').style?.lineWidth).toBe(9)
  })
})

describe('disposal', () => {
  it('keeps answering the chart that is still mounted after its peer goes', async () => {
    const store = memorySaveLoadAdapter().templates('drawing')
    const a = make({ templates: store })
    const b = make({ templates: store })
    await settle()
    await a.handle.presets.saveTemplate('ray', 'Dashed', { style: { lineStyle: 'dashed' } })

    a.handle.destroy()
    expect(b.handle.presets.templatesFor('ray').map((t) => t.name)).toEqual(['Dashed'])
    const seen: string[] = []
    b.handle.presets.subscribe(() => seen.push('announced'))
    await b.handle.presets.saveTemplate('ray', 'Solid', {})
    expect(seen.length).toBeGreaterThan(0)
  })

  it('keeps an in-flight local default coherent for a chart mounted while the last holder goes', async () => {
    const inner = memorySaveLoadAdapter().templates('drawing')
    await new DrawingTemplates(inner).rememberDefault('trend_line', { style: { lineWidth: 2 } })
    const controlled = heldDefaultMutations(inner)
    const a = make({ templates: controlled.store })
    await settle()

    a.handle.armTool('trend_line')
    drag(a.container, [10, 10], [100, 100])
    a.handle.updateStyle({ lineWidth: 9 })
    await settle()
    a.handle.destroy()

    const b = make({ templates: controlled.store })
    await settle()
    expect(b.handle.presets.defaultFor('trend_line').style?.lineWidth).toBe(9)

    controlled.held.shift()!.resolve()
    await settle()
  })

  it.each(['save', 'remove'] as const)('keeps a named-template %s alive when its subscriber replaces the last holder', async (operation) => {
    const inner = memorySaveLoadAdapter().templates('drawing')
    if (operation === 'remove') await new DrawingTemplates(inner).save('ray', 'Named', { style: { lineWidth: 4 } })
    const controlled = heldNamedMutations(inner)
    const a = make({ templates: controlled.store })
    await settle()

    let b: Rig | undefined
    a.handle.presets.subscribe(() => {
      if (b) return
      a.handle.destroy()
      b = make({ templates: controlled.store })
    })
    const writing =
      operation === 'save'
        ? a.handle.presets.saveTemplate('ray', 'Named', { style: { lineWidth: 4 } })
        : a.handle.presets.removeTemplate('ray', 'Named')
    await settle()
    expect(controlled.held).toHaveLength(1)
    controlled.held.shift()!.resolve()
    await writing
    await settle()

    expect(b?.handle.presets.templatesFor('ray').map((template) => template.name)).toEqual(operation === 'save' ? ['Named'] : [])
  })

  it.each(['save', 'remove'] as const)('releases a named-template %s after its subscriber throws', async (operation) => {
    const store = memorySaveLoadAdapter().templates('drawing')
    if (operation === 'remove') await new DrawingTemplates(store).save('ray', 'Named', { style: { lineWidth: 4 } })
    const a = make({ templates: store })
    await settle()

    a.handle.presets.subscribe(() => {
      throw new Error('subscriber refused')
    })
    const writing =
      operation === 'save'
        ? a.handle.presets.saveTemplate('ray', 'Named', { style: { lineWidth: 4 } })
        : a.handle.presets.removeTemplate('ray', 'Named')
    await expect(writing).rejects.toThrow('subscriber refused')
    a.handle.destroy()

    const b = make({ templates: store })
    await settle()
    expect(b.handle.presets.templatesFor('ray').map((template) => template.name)).toEqual(operation === 'save' ? [] : ['Named'])
  })

  it('finishes an admitted clear after its subscriber throws, then releases the cache', async () => {
    const inner = memorySaveLoadAdapter().templates('drawing')
    await new DrawingTemplates(inner).rememberDefault('trend_line', { style: { lineWidth: 2 } })
    const controlled = heldDefaultMutations(inner)
    const a = make({ templates: controlled.store })
    await settle()

    a.handle.presets.subscribe(() => {
      throw new Error('subscriber refused')
    })
    await expect(a.handle.presets.clearDefault('trend_line')).rejects.toThrow('subscriber refused')
    await settle()
    expect(controlled.held).toHaveLength(1)
    a.handle.destroy()

    const b = make({ templates: controlled.store })
    expect(b.handle.presets.defaultFor('trend_line')).toEqual({})
    controlled.held.shift()!.resolve()
    await settle()
    b.handle.destroy()

    const c = make({ templates: controlled.store })
    await settle()
    expect(c.handle.presets.defaultFor('trend_line')).toEqual({})
  })
})

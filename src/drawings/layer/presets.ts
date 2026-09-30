// Tool defaults and named templates, cached for the two readers that cannot await.
//
// `DrawingTemplates` owns what the two kinds MEAN over the revisioned template contract. This
// module is the layer's adapter around it: the family is read once into memory, every reader
// answers from that copy at once, and every write updates the copy and then goes up. A refused or
// failed write leaves the copy as the trader last saw it and the next write carries the
// correction; nothing here retries, because the next edit is the retry.
//
// The cache belongs to the STORE, not to one chart. Defaults and templates are the trader's, so
// every layer reading the same template store shares one copy: a default remembered on one chart
// is what the next placement on another chart starts from, and a template saved or deleted anywhere
// is in every menu at once. The copy lives as long as a layer holds it and goes when the last one
// does, so a chart mounted later reads it again from the store.
//
// A DEFAULT is remembered from the last edit to any drawing of a type, and it styles the NEXT
// drawing: it never writes the words, the cells, or the picture the edited drawing carried.
import type { IDrawing } from '../../internal/drawings/index'
import type { ResourceStore, TemplateBody, TemplateMeta } from '../../resources'
import { DEFAULT_PRESET_NAME, DrawingTemplates, type ToolPreset, type ToolTemplate } from '../templates'
import type { DrawingPresets } from './types'

/** Props that are the drawing's content rather than its setup. A remembered default drops them. */
const CONTENT_PROPS: readonly string[] = ['text', 'cells', 'dataUrl', 'url']

/** A drawing's setup as a preset: its style, and its props minus the content. */
export function presetOf(drawing: Pick<IDrawing, 'style' | 'props'>): ToolPreset {
  const props: Record<string, unknown> = { ...drawing.props }
  for (const key of CONTENT_PROPS) delete props[key]
  return { style: { ...drawing.style }, props }
}

/** The cache the layer holds: the public read surface plus the two verbs only the layer calls. */
export interface PresetCache extends DrawingPresets {
  /** Remember a drawing's setup as its tool's default. A refused write is not worth surfacing:
   *  another surface already wrote a newer default and the next edit writes again. */
  remember(drawing: IDrawing): void
  destroy(): void
  /** Whether every store operation started by this cache has settled. Internal lifetime hook. */
  idle(): boolean
  /** Run once when the cache next becomes idle. Internal lifetime hook. */
  onIdle(listener: () => void): () => void
}

type TemplateResourceStore = ResourceStore<TemplateMeta, TemplateBody>

/** One shared copy and the layers still holding it. */
interface SharedCache {
  cache: PresetCache
  holders: number
  releaseWait?: () => void
}

/** The copy each template store has, while at least one layer holds it. Keyed by the store itself,
 *  which is what a host hands back for one principal's template family. A host that mints a fresh
 *  store object per ask simply gets a copy per layer, as it did before. */
const byStore = new WeakMap<TemplateResourceStore, SharedCache>()

/** The presets over one template store, or over nothing (a page-lived cache) when the host supplies
 *  no adapter. `defaultFor` and `templatesFor` answer synchronously from the cache. */
export function createPresets(store: TemplateResourceStore | null): PresetCache {
  if (!store) return createCache(null)
  let shared = byStore.get(store)
  if (!shared) {
    shared = { cache: createCache(store), holders: 0 }
    byStore.set(store, shared)
  }
  shared.releaseWait?.()
  shared.releaseWait = undefined
  shared.holders += 1
  return holdOf(shared, store)
}

/** One layer's hold on a shared copy: the same verbs, plus a teardown that drops only this layer's
 *  listeners and only ends the copy once nothing is left holding it. */
function holdOf(shared: SharedCache, store: TemplateResourceStore): PresetCache {
  const { cache } = shared
  const mine = new Set<() => void>()
  let released = false
  return {
    defaultFor: (type) => cache.defaultFor(type),
    templatesFor: (type) => cache.templatesFor(type),
    saveTemplate: (type, name, preset) => cache.saveTemplate(type, name, preset),
    removeTemplate: (type, name) => cache.removeTemplate(type, name),
    clearDefault: (type) => cache.clearDefault(type),
    subscribe(listener) {
      const off = cache.subscribe(listener)
      mine.add(off)
      return () => {
        mine.delete(off)
        off()
      }
    },
    remember: (drawing) => cache.remember(drawing),
    destroy() {
      if (released) return
      released = true
      for (const off of mine) off()
      mine.clear()
      shared.holders -= 1
      if (shared.holders > 0) return
      const release = (): void => {
        if (shared.holders > 0) return
        shared.releaseWait = undefined
        byStore.delete(store)
        cache.destroy()
      }
      if (cache.idle()) release()
      else shared.releaseWait = cache.onIdle(release)
    },
    idle: () => cache.idle(),
    onIdle: (listener) => cache.onIdle(listener),
  }
}

function createCache(store: TemplateResourceStore | null): PresetCache {
  const templates = store ? new DrawingTemplates(store) : null
  const defaults = new Map<string, ToolPreset>()
  const named = new Map<string, ToolTemplate[]>()
  const listeners = new Set<() => void>()
  const idleListeners = new Set<() => void>()
  let destroyed = false
  let activeTasks = 0

  // Defaults are revisioned rows, so same-tool mutations run in issue order. Besides preventing
  // two writes from racing the same revision, the generation and dirty sets keep a store read from
  // replacing an optimistic value while its write is queued, in flight, or known to have failed.
  const editedAt = new Map<string, number>()
  const pendingDefaults = new Map<string, Set<number>>()
  const dirtyDefaults = new Set<string>()
  const writeTails = new Map<string, Promise<void>>()
  let clock = 0

  const startTask = (): (() => void) => {
    activeTasks += 1
    let ended = false
    return () => {
      if (ended) return
      ended = true
      activeTasks -= 1
      if (activeTasks !== 0) return
      const ready = [...idleListeners]
      idleListeners.clear()
      for (const listener of ready) listener()
    }
  }

  const announce = (): void => {
    for (const listener of [...listeners]) listener()
  }

  const reload = async (): Promise<void> => {
    if (!templates) return
    const finishTask = startTask()
    const startedAt = ++clock
    const pendingAtStart = new Set(pendingDefaults.keys())
    try {
      const rows = await templates.listAll()
      if (destroyed) return
      // The named list is the store's; a default edited or cleared while the read was in flight
      // stays, because the write it started may land after the row list was taken.
      named.clear()
      for (const row of rows) {
        const preset: ToolPreset = { ...(row.style ? { style: row.style } : {}), ...(row.props ? { props: row.props } : {}) }
        if (row.name === DEFAULT_PRESET_NAME) {
          if (
            !pendingAtStart.has(row.tool) &&
            !pendingDefaults.has(row.tool) &&
            !dirtyDefaults.has(row.tool) &&
            (editedAt.get(row.tool) ?? 0) < startedAt
          )
            defaults.set(row.tool, preset)
          continue
        }
        const bucket = named.get(row.tool) ?? []
        bucket.push({ ...preset, ref: row.ref, name: row.name, tool: row.tool })
        named.set(row.tool, bucket)
      }
      announce()
    } catch {
      /* the store is away; the cache keeps what it held, and a chart must still draw */
    } finally {
      finishTask()
    }
  }

  /** Queue one default mutation after every earlier mutation of the same tool. The local cache is
   * dirty until its latest generation is confirmed stored; an older completion never certifies a
   * newer choice. */
  const queueDefault = (type: string, generation: number, write: () => Promise<boolean>): Promise<void> => {
    const pending = pendingDefaults.get(type) ?? new Set<number>()
    pending.add(generation)
    pendingDefaults.set(type, pending)
    const finishTask = startTask()
    const before = writeTails.get(type) ?? Promise.resolve()
    let queued: Promise<void>
    queued = before
      .catch(() => undefined)
      .then(async () => {
        let stored = false
        try {
          stored = await write()
        } catch {
          /* the optimistic cache remains dirty and wins over later reloads */
        }
        if (stored && editedAt.get(type) === generation) dirtyDefaults.delete(type)
      })
      .finally(() => {
        pending.delete(generation)
        if (!pending.size) pendingDefaults.delete(type)
        if (writeTails.get(type) === queued) writeTails.delete(type)
        finishTask()
      })
    writeTails.set(type, queued)
    return queued
  }
  void reload()

  return {
    defaultFor: (type) => defaults.get(type) ?? {},
    templatesFor: (type) => named.get(type) ?? [],
    async saveTemplate(type, name, preset) {
      const existing = named.get(type)?.find((t) => t.name === name)
      const list = (named.get(type) ?? []).filter((t) => t.name !== name)
      // The cache answers at once; the store's own ref replaces the placeholder on reload.
      list.push({ ...preset, name, tool: type, ref: existing?.ref ?? { id: '', revision: '' } })
      named.set(type, list)
      // Admit the store work before notifying synchronous readers. A listener may tear down the
      // last layer and mount another one; that replacement must inherit this optimistic cache
      // rather than start a stale read while the write has not yet joined the cache's lifetime.
      const finishTask = templates ? startTask() : null
      try {
        // A subscriber exception still rejects the caller and prevents the store write, as it did
        // before lifetime tracking. The outer finally only makes that path release its admission.
        announce()
        if (!templates) return
        try {
          await templates.save(type, name, preset)
          await reload()
        } catch {
          /* the cache holds it for this session */
        }
      } finally {
        finishTask?.()
      }
    },
    async removeTemplate(type, name) {
      const removed = (named.get(type) ?? []).find((t) => t.name === name)
      const list = (named.get(type) ?? []).filter((t) => t.name !== name)
      if (list.length) named.set(type, list)
      else named.delete(type)
      const willWrite = templates && removed?.ref.id ? templates : null
      // As with save, lifetime registration precedes the only external boundary in this method:
      // subscribers run synchronously and are allowed to replace the final holder.
      const finishTask = willWrite ? startTask() : null
      try {
        announce()
        if (!willWrite || !removed) return
        try {
          await willWrite.remove(removed.ref)
          await reload()
        } catch {
          /* the cache already dropped it; the store catches up on the next reload */
        }
      } finally {
        finishTask?.()
      }
    },
    async clearDefault(type) {
      defaults.delete(type)
      const generation = ++clock
      editedAt.set(type, generation)
      dirtyDefaults.add(type)
      // Queue before announce so a subscriber's newer remember is ordered after this clear, and so
      // a subscriber replacing the last holder cannot release this cache before its write exists.
      const writing = templates
        ? queueDefault(type, generation, async () => {
            const outcome = await templates.clearDefault(type)
            return outcome === null || outcome.kind === 'ok' || outcome.kind === 'not-found'
          })
        : null
      announce()
      await writing
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    remember(drawing) {
      const preset = presetOf(drawing)
      defaults.set(drawing.type, preset)
      const generation = ++clock
      editedAt.set(drawing.type, generation)
      dirtyDefaults.add(drawing.type)
      if (!templates) return
      void queueDefault(drawing.type, generation, async () => (await templates.rememberDefault(drawing.type, preset)).kind === 'ok')
    },
    destroy() {
      destroyed = true
      listeners.clear()
      idleListeners.clear()
    },
    idle: () => activeTasks === 0,
    onIdle(listener) {
      if (activeTasks === 0) {
        listener()
        return () => undefined
      }
      idleListeners.add(listener)
      return () => idleListeners.delete(listener)
    },
  }
}

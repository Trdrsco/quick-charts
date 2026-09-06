// Tool defaults and named templates, cached for the two readers that cannot await.
//
// `DrawingTemplates` owns what the two kinds MEAN over the revisioned template contract. This
// module is the layer's adapter around it: the family is read once into memory, every reader
// answers from that copy at once, and every write updates the copy and then goes up. A refused or
// failed write leaves the copy as the trader last saw it and the next write carries the
// correction; nothing here retries, because the next edit is the retry.
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
}

/** The presets over one template store, or over nothing (a page-lived cache) when the host
 *  supplies no adapter. `defaultFor` and `templatesFor` answer synchronously from the cache. */
export function createPresets(store: ResourceStore<TemplateMeta, TemplateBody> | null): PresetCache {
  const templates = store ? new DrawingTemplates(store) : null
  const defaults = new Map<string, ToolPreset>()
  const named = new Map<string, ToolTemplate[]>()
  const listeners = new Set<() => void>()
  let destroyed = false

  const announce = (): void => {
    for (const listener of [...listeners]) listener()
  }

  const reload = async (): Promise<void> => {
    if (!templates) return
    try {
      const rows = await templates.listAll()
      if (destroyed) return
      // The named list is the store's; a default remembered while the read was in flight stays,
      // because the write it started may land after the row list was taken.
      named.clear()
      for (const row of rows) {
        const preset: ToolPreset = { ...(row.style ? { style: row.style } : {}), ...(row.props ? { props: row.props } : {}) }
        if (row.name === DEFAULT_PRESET_NAME) {
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
    }
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
      announce()
      if (!templates) return
      try {
        await templates.save(type, name, preset)
        await reload()
      } catch {
        /* the cache holds it for this session */
      }
    },
    async removeTemplate(type, name) {
      const removed = (named.get(type) ?? []).find((t) => t.name === name)
      const list = (named.get(type) ?? []).filter((t) => t.name !== name)
      if (list.length) named.set(type, list)
      else named.delete(type)
      announce()
      if (!templates || !removed || !removed.ref.id) return
      try {
        await templates.remove(removed.ref)
        await reload()
      } catch {
        /* the cache already dropped it; the store catches up on the next reload */
      }
    },
    async clearDefault(type) {
      defaults.delete(type)
      announce()
      if (!templates) return
      try {
        await templates.clearDefault(type)
      } catch {
        /* the cache already forgot it */
      }
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
      if (templates) void templates.rememberDefault(drawing.type, preset).catch(() => undefined)
    },
    destroy() {
      destroyed = true
      listeners.clear()
    },
  }
}

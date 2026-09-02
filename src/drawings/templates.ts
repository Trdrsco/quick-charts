// A tool's saved setup, in two kinds that look alike and behave nothing alike.
//
//   DEFAULTS  — the style and props every NEW drawing of a tool starts with. There is no save
//               control: the last edit to any drawing of that type becomes the default, silently,
//               and editing a default never touches drawings already on a chart. One per tool.
//   TEMPLATES — named snapshots a trader applies on demand. Several per tool, each with a name the
//               trader typed.
//
// Both ride the revisioned resource contract's `templates('drawing')` store rather than a store of
// their own, so a host that keeps saved charts on a server keeps these there too, and two tabs
// editing the same template get a typed conflict instead of a silent overwrite. A drawing template
// carries its `tool`, which is what makes "the templates for a trend line" a filter rather than a
// separate collection: a trend-line template is meaningless on a rectangle.
import type { DrawingStyle } from '@trdrs/chart-drawings'
import type { ResourceRef, ResourceStore, TemplateBody, TemplateMeta, WriteOutcome } from '../resources'

/** A saved tool setup: style and props partials layered over the tool's factory defaults. */
export interface ToolPreset {
  style?: Partial<DrawingStyle>
  props?: Record<string, unknown>
}

/** A named preset, as the picker lists it. */
export interface ToolTemplate extends ToolPreset {
  ref: ResourceRef
  name: string
  tool: string
}

/** The reserved template name that holds a tool's silent last-used DEFAULT. It is not shown in the
 *  template list and cannot be typed: a name a trader could collide with would let them overwrite
 *  their defaults by saving a template. */
export const DEFAULT_PRESET_NAME = ''

const encode = (preset: ToolPreset): string => JSON.stringify(preset)

/** Total: a body that will not parse reads as an empty preset, so one corrupt row never takes the
 *  picker down with it. */
export function decodePreset(content: string): ToolPreset {
  try {
    const parsed: unknown = JSON.parse(content)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const raw = parsed as { style?: unknown; props?: unknown }
    const preset: ToolPreset = {}
    if (raw.style && typeof raw.style === 'object' && !Array.isArray(raw.style)) preset.style = raw.style as Partial<DrawingStyle>
    if (raw.props && typeof raw.props === 'object' && !Array.isArray(raw.props)) preset.props = raw.props as Record<string, unknown>
    return preset
  } catch {
    return {}
  }
}

/** Whether a listing row is a tool's silent default rather than a named template. */
const isDefaultRow = (row: TemplateMeta): boolean => row.name === DEFAULT_PRESET_NAME

/** The drawing-template workflow over one `templates('drawing')` store. Every call takes the
 *  caller's `AbortSignal`, so a closed dialog or a fast retype abandons in flight and a late answer
 *  never lands. */
export class DrawingTemplates {
  constructor(private readonly store: ResourceStore<TemplateMeta, TemplateBody>) {}

  /** The named templates for one tool, in the store's order. The tool's silent default is not
   *  among them. */
  async list(tool: string, signal?: AbortSignal): Promise<TemplateMeta[]> {
    const rows = await this.store.list(signal)
    return rows.filter((row) => row.tool === tool && !isDefaultRow(row))
  }

  /** Every row of the family, defaults included, each with its preset. A host that has to answer
   *  synchronously (a placement path, a render) reads this once into a cache of its own rather
   *  than awaiting per tool. The contract's listing carries metadata only, so each row's body is
   *  fetched: one read per saved setup, once, against a family a trader keeps in the dozens. */
  async listAll(signal?: AbortSignal): Promise<ToolTemplate[]> {
    const rows = await this.store.list(signal)
    const out: ToolTemplate[] = []
    for (const row of rows) {
      const found = await this.store.load(row.id, signal)
      if (found) out.push({ ...decodePreset(found.body.content), ref: found.ref, name: found.body.name, tool: found.body.tool ?? '' })
    }
    return out
  }

  /** One template's preset. Null when the id is gone, which is what a picker shows after another
   *  tab deleted it. */
  async load(id: string, signal?: AbortSignal): Promise<{ ref: ResourceRef; template: ToolTemplate } | null> {
    const found = await this.store.load(id, signal)
    if (!found) return null
    const preset = decodePreset(found.body.content)
    return { ref: found.ref, template: { ...preset, ref: found.ref, name: found.body.name, tool: found.body.tool ?? '' } }
  }

  /** Save a NAMED template. Saving over a name the tool already has REPLACES that row at the
   *  revision the caller read, so two tabs saving the same name conflict rather than one silently
   *  winning. A name the tool does not have creates a row. */
  async save(tool: string, name: string, preset: ToolPreset, signal?: AbortSignal): Promise<WriteOutcome<TemplateMeta>> {
    const body: TemplateBody = { name, tool, content: encode(preset) }
    const rows = await this.store.list(signal)
    const existing = rows.find((row) => row.tool === tool && row.name === name)
    if (!existing) return this.store.create(body, signal)
    const found = await this.store.load(existing.id, signal)
    if (!found) return this.store.create(body, signal)
    return this.store.update(found.ref, body, signal)
  }

  async remove(ref: ResourceRef, signal?: AbortSignal): Promise<WriteOutcome<void>> {
    return this.store.remove(ref, signal)
  }

  /** A tool's silent last-used default, or an empty preset when it has none. */
  async defaultFor(tool: string, signal?: AbortSignal): Promise<ToolPreset> {
    const rows = await this.store.list(signal)
    const row = rows.find((r) => r.tool === tool && isDefaultRow(r))
    if (!row) return {}
    const found = await this.store.load(row.id, signal)
    return found ? decodePreset(found.body.content) : {}
  }

  /** Remember a tool's default. This runs after an ordinary style edit, so a CONFLICT here is not
   *  worth surfacing: another surface already wrote a newer default and the trader's next edit
   *  writes again. It is returned rather than swallowed so a caller may still look. */
  async rememberDefault(tool: string, preset: ToolPreset, signal?: AbortSignal): Promise<WriteOutcome<TemplateMeta>> {
    return this.save(tool, DEFAULT_PRESET_NAME, preset, signal)
  }

  /** Forget a tool's default, so new drawings of it start from the factory style again. */
  async clearDefault(tool: string, signal?: AbortSignal): Promise<WriteOutcome<void> | null> {
    const rows = await this.store.list(signal)
    const row = rows.find((r) => r.tool === tool && isDefaultRow(r))
    if (!row) return null
    const found = await this.store.load(row.id, signal)
    if (!found) return null
    return this.store.remove(found.ref, signal)
  }
}

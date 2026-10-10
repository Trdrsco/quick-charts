// The chart settings dialog's templates: named settings a viewer saves from the dialog and applies
// again from its Template menu. They ride the revisioned resource contract's `templates('chart')`
// store, so a host that keeps saved charts on a server keeps these beside them, and two tabs saving
// one name get a typed conflict rather than a silent overwrite.
//
// A template holds the viewer's own settings, the partial the viewer chose over the theme and the
// host, not the settings the chart shows: applied on a chart in the other mode, the leaves the
// viewer never named still follow that mode.
import { readPartialChartSettings } from '../../settings/defaults'
import type { PartialChartSettings } from '../../settings/schema'
import type { ResourceRef, ResourceStore, TemplateBody, TemplateMeta, WriteOutcome } from '../../resources'

/** A saved template's row, as the menu lists it. */
export interface ChartTemplateRow {
  ref: ResourceRef
  name: string
}

const encode = (settings: PartialChartSettings): string => JSON.stringify({ settings })

/** Total: a body that will not parse reads as no settings, and a leaf the tree does not have or
 *  cannot hold is left out, so one corrupt row never takes the menu down with it. */
export function decodeChartTemplate(content: string): PartialChartSettings {
  try {
    const parsed: unknown = JSON.parse(content)
    const settings = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as { settings?: unknown }).settings : undefined
    return readPartialChartSettings(settings).settings
  } catch {
    return {}
  }
}

/** The chart-template workflow over one `templates('chart')` store. */
export class ChartTemplates {
  constructor(private readonly store: ResourceStore<TemplateMeta, TemplateBody>) {}

  /** The saved templates, by name, in the store's order. */
  async list(signal?: AbortSignal): Promise<ChartTemplateRow[]> {
    const rows = await this.store.list(signal)
    return rows.filter((row) => row.name !== '').map((row) => ({ ref: { id: row.id, revision: row.revision }, name: row.name }))
  }

  /** One template's settings, or null when its row is gone. */
  async load(id: string, signal?: AbortSignal): Promise<PartialChartSettings | null> {
    const found = await this.store.load(id, signal)
    return found ? decodeChartTemplate(found.body.content) : null
  }

  /** Save the settings under a name. A name already saved is REPLACED at the revision read here, so
   *  two tabs saving one name conflict rather than one silently winning. */
  async save(name: string, settings: PartialChartSettings, signal?: AbortSignal): Promise<WriteOutcome<TemplateMeta>> {
    const body: TemplateBody = { name, content: encode(settings) }
    const rows = await this.store.list(signal)
    const existing = rows.find((row) => row.name === name)
    if (!existing) return this.store.create(body, signal)
    const found = await this.store.load(existing.id, signal)
    if (!found) return this.store.create(body, signal)
    return this.store.update(found.ref, body, signal)
  }

  async remove(ref: ResourceRef, signal?: AbortSignal): Promise<WriteOutcome<void>> {
    return this.store.remove(ref, signal)
  }
}

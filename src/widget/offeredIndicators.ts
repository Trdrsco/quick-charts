// The built-in indicators a widget offers: every built-in when the host names no list, or exactly
// the host's list. A built-in outside the offered set stays off this chart: the indicator
// picker leaves it out, and every door that would add one (the picker, `chart.indicators.add`,
// `indicators.add` and `indicators.set` on a chart handle, a new pane copying the first one's
// studies) refuses. Instances of it already on the chart are untouched: they render, edit, hide and
// remove exactly as any other instance does, and a saved chart, a layout or an undo step that
// carries one puts it back. A definition is matched by its `manifest.id`, the id `access.indicator`
// receives; a definition whose id names no built-in is the host's own and is never filtered.
import { BUILT_IN_INDICATORS } from '../builtInIndicators'
import type { IndicatorDefinition } from './options'

/** The built-in definition ids a widget offers, or null when the host names no list and every
 *  built-in is offered. */
export type OfferedIndicators = ReadonlySet<string> | null

const BUILT_IN_IDS: ReadonlySet<string> = new Set(BUILT_IN_INDICATORS.map((definition) => definition.id))

const TAKES = 'it takes the ids BUILT_IN_INDICATORS lists, such as sma'

/** The definition id an instance the host passed declares, when it declares one. */
const definitionIdOf = (instance: unknown): string | undefined => {
  const id = (instance as { definition?: { manifest?: { id?: unknown } } } | null)?.definition?.manifest?.id
  return typeof id === 'string' ? id : undefined
}

/** Validate the host's `builtInIndicators` option and the instances the host puts on the chart at
 *  mount. A non-list, an empty list, an id that names no built-in, a repeated id and a mount
 *  instance whose built-in the list leaves out are setup errors: nothing a host passes is
 *  substituted or dropped. */
export function resolveOfferedIndicators(list: readonly unknown[] | undefined, opening: readonly unknown[] | undefined): OfferedIndicators {
  if (list === undefined) return null
  if (!Array.isArray(list)) throw new TypeError(`builtInIndicators must be a list of built-in indicator ids; ${TAKES}`)
  if (list.length === 0) throw new TypeError(`builtInIndicators must name at least one built-in indicator id; ${TAKES}`)
  const seen = new Set<string>()
  for (const id of list) {
    if (typeof id !== 'string' || !BUILT_IN_IDS.has(id)) throw new TypeError(`builtInIndicators names ${JSON.stringify(id) ?? String(id)}, which is not a built-in indicator id; ${TAKES}`)
    if (seen.has(id)) throw new TypeError(`builtInIndicators names "${id}" more than once`)
    seen.add(id)
  }
  if (Array.isArray(opening)) {
    opening.forEach((instance, index) => {
      const id = definitionIdOf(instance)
      if (id !== undefined && BUILT_IN_IDS.has(id) && !seen.has(id)) {
        throw new TypeError(`indicators[${index}] uses the built-in indicator "${id}", which builtInIndicators does not offer`)
      }
    })
  }
  return seen
}

/** Whether the widget offers a definition for adding: always, unless its id names a built-in the
 *  host's list leaves out. */
export function indicatorOffered(offered: OfferedIndicators, definition: IndicatorDefinition): boolean {
  if (offered === null) return true
  const id = definition.manifest.id
  return id === undefined || !BUILT_IN_IDS.has(id) || offered.has(id)
}

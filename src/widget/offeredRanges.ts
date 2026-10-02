// The range presets a widget offers: every preset in `RANGE_PRESETS` when the host names no list,
// or exactly the host's list, in the host's order. A preset outside the offered set stays off this
// chart: it has no `chart.range.<key>` command, `chart.range.set` ignores its key, and the
// bottom bar draws no button for it. An empty list is a chart with no range buttons: the bottom bar
// keeps its clock, timezone and session controls, and `chart.range.set` still takes an explicit
// window.
import { RANGE_PRESETS, type RangePreset } from '../ranges'

/** The presets a widget offers, in the order the bottom bar draws them. */
export type OfferedRanges = readonly RangePreset[]

const TAKES = `it takes ${RANGE_PRESETS.map((preset) => preset.key).join(', ')}`

/** Validate the host's `ranges` option. A non-list, a key that names no preset and a repeated key
 *  are setup errors: nothing a host passes is substituted. An empty list is valid: the chart then
 *  offers no preset. */
export function resolveOfferedRanges(list: readonly unknown[] | undefined): OfferedRanges {
  if (list === undefined) return RANGE_PRESETS
  if (!Array.isArray(list)) throw new TypeError(`ranges must be a list of range preset keys; ${TAKES}`)
  const offered: RangePreset[] = []
  for (const key of list) {
    const preset = RANGE_PRESETS.find((candidate) => candidate.key === key)
    if (!preset) throw new TypeError(`ranges names ${JSON.stringify(key) ?? String(key)}, which is not a range preset; ${TAKES}`)
    if (offered.includes(preset)) throw new TypeError(`ranges names "${preset.key}" more than once`)
    offered.push(preset)
  }
  return offered
}

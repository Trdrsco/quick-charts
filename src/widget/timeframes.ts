// The timeframes a widget offers: every token the grammar reads when the host names no list, the
// presets alone when the host switches custom timeframes off, or exactly the host's list. A token
// outside the offered set is not a timeframe of this chart: no command reaches it, the setter
// ignores it, and a stored or restored one opens on the first offered timeframe.
import { parseTimeframe, TIMEFRAME_PRESET_TOKENS, timeframeOrder, timeframeSeconds } from '../timeframe'

/** The timeframe a chart opens on when nothing names one. */
export const DEFAULT_TIMEFRAME = '1m'

/** The timeframes a widget offers. `list` is the host's list, smallest first, or null when the
 *  host named none. `custom` says whether a viewer may compose a custom timeframe, which also
 *  decides whether a token beyond the presets is offered when there is no list. */
export interface OfferedTimeframes {
  readonly list: readonly string[] | null
  readonly custom: boolean
}

/** Every timeframe, presets and custom: what a widget offers when the host restricts nothing. */
export const ALL_TIMEFRAMES_OFFERED: OfferedTimeframes = { list: null, custom: true }

/** Whether the widget offers a token. With nothing restricted every token is offered as it is
 *  written, so the chart passes a host's token to its feed unchanged. */
export function offersTimeframe(offered: OfferedTimeframes, token: string): boolean {
  if (offered.list) return offered.list.includes(token)
  if (offered.custom) return true
  return TIMEFRAME_PRESET_TOKENS.has(token)
}

/** The offered timeframe a stored or restored token opens on: the token itself when it is offered,
 *  else the first offered timeframe, which is the smallest in the host's list, or the chart's
 *  default when the offered set is the presets. */
export function offeredTimeframe(token: string, offered: OfferedTimeframes): string {
  if (offersTimeframe(offered, token)) return token
  return offered.list?.[0] ?? DEFAULT_TIMEFRAME
}

/** The timeframe a range preset reads its span at: the preset's own when it is offered, else the
 *  smallest offered timeframe at or above it, else the largest offered. A coarser interval keeps
 *  the span to a bounded number of bars, which is why a coarser one is preferred over a finer. */
export function rangeTimeframe(token: string, offered: OfferedTimeframes): string {
  if (offersTimeframe(offered, token) || !offered.list) return token
  const wanted = parseTimeframe(token)
  const seconds = (t: string): number => {
    const tf = parseTimeframe(t)
    return tf ? timeframeSeconds(tf) : 0
  }
  const floor = wanted ? timeframeSeconds(wanted) : 0
  const above = offered.list.filter((t) => seconds(t) >= floor).sort((a, b) => seconds(a) - seconds(b))
  return above[0] ?? offered.list.reduce((a, b) => (seconds(b) > seconds(a) ? b : a))
}

const offeredPhrase = (offered: OfferedTimeframes): string =>
  offered.list ? `one of the offered timeframes: ${offered.list.join(', ')}` : 'offered: customTimeframes is false, so the chart offers the preset timeframes only'

/** Validate the host's `timeframes` and `customTimeframes` options and the opening timeframes the
 *  host names with them. An empty list, a token the grammar cannot read, a repeated token, a
 *  `customTimeframes: true` beside a list, and an opening timeframe outside the offered set are
 *  setup errors: nothing a host passes is substituted. */
export function resolveOfferedTimeframes(
  timeframes: readonly unknown[] | undefined,
  customTimeframes: unknown,
  opening: readonly { readonly name: string; readonly token: unknown }[] = [],
): OfferedTimeframes {
  if (customTimeframes !== undefined && typeof customTimeframes !== 'boolean') throw new TypeError('customTimeframes must be true or false')
  let offered: OfferedTimeframes = customTimeframes === false ? { list: null, custom: false } : ALL_TIMEFRAMES_OFFERED
  if (timeframes !== undefined) {
    if (!Array.isArray(timeframes)) throw new TypeError('timeframes must be a list of timeframe tokens, such as 1m, 4h or 1d')
    if (timeframes.length === 0) throw new TypeError('timeframes must name at least one timeframe token')
    if (customTimeframes === true) throw new TypeError('customTimeframes cannot be true beside a timeframes list: the list is every timeframe the chart offers')
    const seen = new Set<string>()
    for (const token of timeframes) {
      if (typeof token !== 'string' || parseTimeframe(token) === null) throw new TypeError(`timeframes names ${JSON.stringify(token)}, which is not a timeframe token`)
      if (seen.has(token)) throw new TypeError(`timeframes names "${token}" more than once`)
      seen.add(token)
    }
    offered = { list: [...seen].sort((a, b) => timeframeOrder(a) - timeframeOrder(b)), custom: false }
  }
  if (offered.list || !offered.custom) {
    for (const { name, token } of opening) {
      if (token === undefined) continue
      if (typeof token !== 'string' || !offersTimeframe(offered, token)) throw new TypeError(`${name} ${JSON.stringify(token)} is not ${offeredPhrase(offered)}`)
    }
  }
  return offered
}

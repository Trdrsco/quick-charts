// The UDF resolution vocabulary and the chart's `<N><unit>` timeframe tokens, mapped both ways. A
// module of its own because two adapters read it: the UDF datafeed maps a timeframe OUT to the
// resolution it asks a server for, and the UDF symbology mapping maps a server's declared
// resolutions BACK to the tokens `SymbolInfo.supportedResolutions` carries. Both directions read
// the chart's one timeframe grammar (timeframe.ts).
import { formatTimeframe, parseTimeframe, type TimeframeUnit } from './timeframe'

/** Map a timeframe token to a UDF resolution string: seconds `<N>S`, minutes `<N>`, hours as
 *  minutes (`<N*60>`, the classic UDF intraday encoding), day/week/month `<N>D`/`<N>W`/`<N>M`, ticks
 *  `<N>T`. A token the grammar cannot read falls through as-is (a custom server may accept it). */
export function tfToUdfResolution(tf: string): string {
  const parsed = parseTimeframe(tf)
  if (!parsed) return tf
  const { count, unit } = parsed
  switch (unit) {
    case 't':
      return `${count}T`
    case 's':
      return `${count}S`
    case 'm':
      return `${count}`
    case 'h':
      return `${count * 60}`
    case 'd':
      return `${count}D`
    case 'w':
      return `${count}W`
    case 'mo':
      return `${count}M`
  }
}

/** Canonical spelling of a UDF resolution for EQUALITY: real servers spell one-day as either 'D' or
 *  '1D' (same for W/M/S/T — a bare letter is an implicit count of 1), so both forms normalize to the
 *  digit-prefixed one. Anything else passes through unchanged — this canonicalizes spelling only,
 *  it never reinterprets an unknown token. */
export const canonicalResolution = (r: string): string => {
  const t = r.trim()
  return /^[TSDWM]$/.test(t) ? `1${t}` : t
}

const UDF_UNIT: Readonly<Record<string, TimeframeUnit>> = { T: 't', S: 's', D: 'd', W: 'w', M: 'mo' }

/** The inverse of {@link tfToUdfResolution}: a UDF resolution string back to a timeframe token.
 *  Bare numbers are minutes; whole-hour counts of 60 or more normalize to `<N>h` (the forward map
 *  emits hours AS minutes, so '1h' → '60' → '1h' round-trips); bare 'D'/'W'/'M'/'S'/'T' mean a
 *  count of 1. Null for a resolution the timeframe grammar cannot express, its per-unit ceilings
 *  included: a caller building a capability declaration OMITS that resolution rather than
 *  mis-declaring it (the widget can't do bucket arithmetic on a token outside the grammar, so it
 *  isn't widget-servable even if the server serves it). */
export function udfResolutionToTf(resolution: string): string | null {
  const m = /^(\d+)(T|S|D|W|M)?$/.exec(canonicalResolution(resolution))
  if (!m) return null
  const n = Number(m[1])
  if (!(n > 0)) return null
  const letter = m[2]
  if (letter) return formatTimeframe({ count: n, unit: UDF_UNIT[letter]! })
  return n % 60 === 0 && n >= 60 ? formatTimeframe({ count: n / 60, unit: 'h' }) : formatTimeframe({ count: n, unit: 'm' })
}

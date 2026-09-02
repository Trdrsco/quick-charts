// The UDF resolution vocabulary and the chart's `<N><unit>` timeframe tokens, mapped both ways. A
// module of its own because two adapters read it: the UDF datafeed maps a timeframe OUT to the
// resolution it asks a server for, and the UDF symbology mapping maps a server's declared
// resolutions BACK to the tokens `SymbolInfo.supportedResolutions` carries.

/** Map a `<N><unit>` timeframe token to a UDF resolution string: seconds `<N>S`, minutes `<N>`, hours as
 *  minutes (`<N*60>`, the classic UDF intraday encoding), day/week/month `<N>D`/`<N>W`/`<N>M`, ticks
 *  `<N>T`. An unrecognized token falls through as-is (a custom server may accept it). */
export function tfToUdfResolution(tf: string): string {
  const m = /^(\d+)(t|s|m|h|d|w|mo)$/.exec(tf)
  if (!m) return tf
  const n = Number(m[1])
  switch (m[2]) {
    case 't':
      return `${n}T`
    case 's':
      return `${n}S`
    case 'm':
      return `${n}`
    case 'h':
      return `${n * 60}`
    case 'd':
      return `${n}D`
    case 'w':
      return `${n}W`
    case 'mo':
      return `${n}M`
    default:
      return tf
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

/** The inverse of {@link tfToUdfResolution}: a UDF resolution string back to a wire tf token.
 *  Bare numbers are minutes; whole-hour counts ≥ 60 normalize to `<N>h` (the forward map emits hours
 *  AS minutes, so '1h' → '60' → '1h' round-trips); bare 'D'/'W'/'M'/'S'/'T' mean a count of 1. Null
 *  for a resolution the wire tf grammar cannot express — a caller building a capability declaration
 *  OMITS that resolution rather than mis-declaring it (the widget can't do bucket arithmetic on a
 *  token outside the grammar, so it isn't widget-servable even if the server serves it). */
export function udfResolutionToTf(resolution: string): string | null {
  const m = /^(\d+)(T|S|D|W|M)?$/.exec(canonicalResolution(resolution))
  if (!m) return null
  const n = Number(m[1])
  if (!(n > 0)) return null
  switch (m[2]) {
    case 'T':
      return `${n}t`
    case 'S':
      return `${n}s`
    case 'D':
      return `${n}d`
    case 'W':
      return `${n}w`
    case 'M':
      return `${n}mo`
    default:
      return n % 60 === 0 && n >= 60 ? `${n / 60}h` : `${n}m`
  }
}

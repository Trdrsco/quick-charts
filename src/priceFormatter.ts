// The one Quick Charts PRICE FORMATTER. Every price a chart writes comes through here: the price
// scale, the OHLC legend, the crosshair, drawing labels, marks, study price plots and exported
// image text, plus a host's own surfaces through the public factory. One resolved formatter per
// symbol means a layout cannot draw one market's prices at another's precision.
//
// The rule that makes it trustworthy: PRECISION COMES FROM THE SYMBOL'S DECLARED FACTS, NEVER FROM
// THE PRICE. There is no "small numbers get more decimals" branch anywhere below. A variable-tick
// symbol does change width by price band, but the bands are a fact the datafeed declared, not a
// guess the formatter made.
//
// Deterministic in the strict sense: the same `PriceFormat` and options always produce the same
// string for the same number, on every machine and in every locale, because the only locale input
// is the punctuation the caller passes (or asks to be derived once, at construction).
import { parseTickBands, tickBandFor, type PriceFormat, type TickBand } from './symbology'

/** How a formatted price is punctuated. The reference localizes the decimal sign only, so
 *  `groupSign` defaults to '' (no thousands separator) and a host that wants grouping asks for it
 *  explicitly. */
export interface NumericPunctuation {
  /** What separates the whole part from the decimals. Default '.', or the locale's sign when a
   *  `locale` is given. */
  decimalSign?: string
  /** What separates thousands in the whole part. Default '': the reference does not group. */
  groupSign?: string
}

export interface PriceFormatterOptions {
  /** A BCP 47 tag used ONCE, at construction, to derive the decimal sign. Anything explicit in
   *  `numericPunctuation` wins over it. */
  locale?: string
  numericPunctuation?: NumericPunctuation
}

/** A resolved formatter for one symbol. `format` and `parse` are exact inverses over every price
 *  that lands on the symbol's own grid. */
export interface PriceFormatter {
  /** The price as the symbol writes it. */
  format(price: number): string
  /** The number a user typed, or null when the text is not a price in this symbol's format. */
  parse(text: string): number | null
  /** How many digits `format` writes after the decimal sign. 0 for a fractional format, which
   *  writes none; the widest band's width for a variable-tick format, so a column sized from it
   *  never has to reflow. */
  precision(): number
}

/** The apostrophe the reference writes between a whole price and its counted fraction, and again
 *  between that fraction and its sub-fraction: 110'16 and 110'16'2. */
const FRACTION_SIGN = "'"

/** Decimal digits implied by a price scale: the digits it takes to write `pricescale - 1`. A power
 *  of ten resolves exactly (100 → 2, 100000000 → 8); 32 resolves to 2, the width of '31'. */
function decimalsOfPriceScale(pricescale: number): number {
  if (!Number.isFinite(pricescale) || pricescale <= 1) return 0
  return Math.min(16, Math.ceil(Math.log10(pricescale) - 1e-9))
}

/** The decimal sign a locale writes, resolved once. Falls back to '.' where `Intl` cannot answer. */
function localeDecimalSign(locale: string): string {
  try {
    const part = new Intl.NumberFormat(locale).formatToParts(1.1).find((p) => p.type === 'decimal')
    return part?.value ?? '.'
  } catch {
    return '.'
  }
}

/** A non-negative integer written with `groupSign` every three digits from the right. */
function groupDigits(digits: string, groupSign: string): string {
  if (!groupSign) return digits
  let out = ''
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += groupSign
    out += digits[i]
  }
  return out
}

/** The magnitude of `value` written at exactly `decimals` places. Rounding is the double's own: a
 *  price arrives as a binary float, and `toFixed` rounds the value that is actually stored, so the
 *  same input yields the same digits on every engine. The sign is applied by the caller, which is
 *  what keeps a price that rounds to zero from writing '-0.00'. */
function fixedText(value: number, decimals: number): string {
  return Math.abs(value).toFixed(Math.min(20, decimals))
}

interface Punctuation {
  decimalSign: string
  groupSign: string
}

function writeDecimal(price: number, decimals: number, punctuation: Punctuation): string {
  const fixed = fixedText(price, decimals)
  const dot = fixed.indexOf('.')
  const whole = dot < 0 ? fixed : fixed.slice(0, dot)
  const frac = dot < 0 ? '' : fixed.slice(dot + 1)
  const sign = price < 0 && Number(fixed) !== 0 ? '-' : ''
  const body = groupDigits(whole, punctuation.groupSign)
  return frac ? `${sign}${body}${punctuation.decimalSign}${frac}` : `${sign}${body}`
}

/** The fractional form. `units` is the count of `1/pricescale` steps in the sub-unit part, split
 *  into whole `minmove2`-sized groups (the thirty-seconds) and a remainder (the quarters of one
 *  thirty-second). With no `minmove2` the sub-unit part is the count itself: 110'16. */
function writeFractional(price: number, format: PriceFormat, punctuation: Punctuation): string {
  const scale = format.pricescale
  const second = format.minmove2 && format.minmove2 > 1 ? format.minmove2 : 1
  const at = Math.abs(price)
  const total = Math.round(at * scale)
  const whole = Math.floor(total / scale)
  const units = total - whole * scale
  const outer = Math.floor(units / second)
  const inner = units - outer * second
  const outerWidth = String(Math.ceil(scale / second) - 1).length
  const sign = price < 0 && total !== 0 ? '-' : ''
  const body = groupDigits(String(whole), punctuation.groupSign)
  const outerText = String(outer).padStart(outerWidth, '0')
  return second > 1
    ? `${sign}${body}${FRACTION_SIGN}${outerText}${FRACTION_SIGN}${inner}`
    : `${sign}${body}${FRACTION_SIGN}${outerText}`
}

function parseFractional(text: string, format: PriceFormat): number | null {
  const scale = format.pricescale
  const second = format.minmove2 && format.minmove2 > 1 ? format.minmove2 : 1
  const parts = text.split(FRACTION_SIGN)
  if (parts.length < 2 || parts.length > 3) return null
  const negative = parts[0]!.trim().startsWith('-')
  const whole = Number(parts[0]!.replace(/[^0-9]/g, ''))
  const outer = Number(parts[1]!.trim())
  const inner = parts.length === 3 ? Number(parts[2]!.trim()) : 0
  if (!Number.isInteger(whole) || !Number.isInteger(outer) || !Number.isInteger(inner)) return null
  if (outer < 0 || inner < 0 || inner >= second) return null
  if (outer * second + inner >= scale) return null
  const value = whole + (outer * second + inner) / scale
  return negative ? -value : value
}

/** Build the formatter for one symbol's price format. The result is stateless and reusable; a host
 *  resolves a symbol once and keeps its formatter for as long as the symbol is on screen. */
export function createPriceFormatter(format: PriceFormat, options?: PriceFormatterOptions): PriceFormatter {
  const explicit = options?.numericPunctuation
  const punctuation: Punctuation = {
    decimalSign: explicit?.decimalSign ?? (options?.locale ? localeDecimalSign(options.locale) : '.'),
    groupSign: explicit?.groupSign ?? '',
  }
  const fractional = format.fractional === true
  const bands: readonly TickBand[] = format.variableTickSize ? parseTickBands(format.variableTickSize) : []
  const bandDecimals = (band: TickBand): number => {
    const text = decimalText(band.size)
    const dot = text.indexOf('.')
    return dot < 0 ? 0 : text.length - dot - 1
  }
  const fixedDecimals = decimalsOfPriceScale(format.pricescale)
  const widest = bands.length > 0 ? Math.max(...bands.map(bandDecimals)) : fixedDecimals
  const decimalsFor = (price: number): number => {
    if (bands.length === 0) return fixedDecimals
    const band = tickBandFor(bands, price)
    return band ? bandDecimals(band) : fixedDecimals
  }

  return {
    format(price) {
      if (!Number.isFinite(price)) return ''
      return fractional ? writeFractional(price, format, punctuation) : writeDecimal(price, decimalsFor(price), punctuation)
    },
    parse(text) {
      const trimmed = text.trim()
      if (trimmed === '') return null
      if (fractional) return parseFractional(trimmed, format)
      let plain = trimmed
      if (punctuation.groupSign) plain = plain.split(punctuation.groupSign).join('')
      if (punctuation.decimalSign !== '.') plain = plain.split(punctuation.decimalSign).join('.')
      if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(plain)) return null
      const value = Number(plain)
      return Number.isFinite(value) ? value : null
    },
    precision: () => (fractional ? 0 : widest),
  }
}

/** A number's shortest decimal text, with exponent notation expanded, so a tick of 1e-8 reads
 *  '0.00000001' and its decimal width can be counted. */
function decimalText(value: number): string {
  const text = String(value)
  const exp = /^(-?)(\d)(?:\.(\d+))?e-(\d+)$/.exec(text)
  if (!exp) return text
  const [, sign, lead, rest = '', power] = exp
  const zeros = Number(power) - 1
  return `${sign}0.${'0'.repeat(zeros)}${lead}${rest}`
}

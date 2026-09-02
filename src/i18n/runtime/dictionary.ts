// Typed message catalogs and the translator over them: placeholder substitution, plural selection
// by CLDR rules through `Intl.PluralRules`, fallback to the source with a diagnostic, and the
// conformance check a translation is held to.

export type PluralCategory = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other'

/** The categories in CLDR's order, smallest count first and `other` last, which is the order the
 *  plural tables are written and read in. */
const CANONICAL_PLURAL_ORDER: PluralCategory[] = ['zero', 'one', 'two', 'few', 'many', 'other']

/** A message with one form per plural category its language distinguishes (CLDR: English has
 *  `one` and `other`, Russian `one`/`few`/`many`/`other`, Arabic all six, Japanese `other` alone).
 *  `other` is always present. `zero` is special: when present it is used for an exact count of 0 in
 *  EVERY language, so "No alerts" needs no branch at the call site. The form is selected by the
 *  `count` variable. */
export type PluralMessage = { other: string } & Partial<Record<Exclude<PluralCategory, 'other'>, string>>
export type Message = string | PluralMessage

/** A catalog: keys to messages. The English catalog is the SOURCE every translation is typed
 *  against; keys are dotted by surface (`legend.hideIndicator`), and each surface keeps its own file. */
export type Catalog = Record<string, Message>

/** A translation of a catalog: a string for every string, a plural for every plural. The shape is
 *  the source's, so a translation cannot miss a key or flatten a plural without failing typecheck. */
export type Translation<Source extends Catalog> = {
  [K in keyof Source]: Source[K] extends string ? string : PluralMessage
}

export type Vars = Record<string, string | number>

/** The arguments `t` takes for a key: a plural key REQUIRES `count`; a string key takes any vars.
 *  Distributive over `K`, so a key chosen at runtime from a union of keys (a label table) is
 *  accepted with the arguments any ONE of them takes rather than what all of them would need. */
export type TranslateArgs<Source extends Catalog, K extends keyof Source> = K extends unknown
  ? Source[K] extends string
    ? [vars?: Vars]
    : [vars: Vars & { count: number }]
  : never

/** The message for a key in the active language: a plural key picks its form by the language's
 *  rules, and numbers in `{slots}` are written with the language's digits and grouping. */
export type Translate<Source extends Catalog> = <K extends keyof Source & string>(key: K, ...args: TranslateArgs<Source, K>) => string

// `Intl` objects, memoized per (tag, options): constructing one is the expensive part, using it is
// cheap, and a legend re-formats on every bar.
function memo<T>(make: (tag: string, opts?: object) => T): (tag: string, opts?: object) => T {
  const cache = new Map<string, T>()
  return (tag, opts) => {
    const key = `${tag} ${opts ? JSON.stringify(opts) : ''}`
    let made = cache.get(key)
    if (!made) {
      made = make(tag, opts)
      cache.set(key, made)
    }
    return made
  }
}

export const numberFormat = memo((tag, opts) => new Intl.NumberFormat(tag, opts as Intl.NumberFormatOptions | undefined))
export const pluralRules = memo((tag, opts) => new Intl.PluralRules(tag, opts as Intl.PluralRulesOptions | undefined))

/** `{name}` placeholders in a message; the same token set in every translation of a key. */
export const PLACEHOLDER = /\{(\w+)\}/g

export const isPlural = (message: Message): message is PluralMessage => typeof message === 'object'

/** The form of a plural message for a count, by the language's rules. */
export function selectPlural(message: PluralMessage, count: number, rules: Intl.PluralRules): string {
  if (count === 0 && message.zero !== undefined) return message.zero
  return message[rules.select(count)] ?? message.other
}

/** Fill a message's `{name}` slots. A number goes through `formatNumber` when one is given (the
 *  language's digits and grouping); an unknown slot is left as written: a visible `{name}` in the
 *  interface is a bug you can see, a silently dropped value is one you cannot. */
export function format(template: string, vars?: Vars, formatNumber?: (value: number) => string): string {
  if (!vars) return template
  return template.replace(PLACEHOLDER, (whole, name: string) => {
    if (!(name in vars)) return whole
    const value = vars[name]
    return typeof value === 'number' && formatNumber ? formatNumber(value) : String(value)
  })
}

/** A message, string or plural, resolved to text for these vars. */
export function resolve(message: Message, vars: Vars | undefined, rules: Intl.PluralRules, formatNumber?: (value: number) => string): string {
  const text = isPlural(message) ? selectPlural(message, Number(vars?.count ?? 0), rules) : message
  return format(text, vars, formatNumber)
}

/** A translate function over a source catalog and a translation of it (null while one is still
 *  loading). A key the translation misses falls through to the source, and `onMissing` hears about
 *  it: the fallback is by design, the report is what keeps "by design" from becoming "permanently". */
export function createTranslator<Source extends Catalog>(
  source: Source,
  dictionary: Translation<Source> | null,
  tag: string,
  onMissing?: (key: keyof Source & string) => void,
): Translate<Source> {
  const rules = pluralRules(tag)
  const digits = (value: number) => numberFormat(tag).format(value)
  return (key, ...args) => {
    const vars = args[0]
    const own = dictionary?.[key] as Message | undefined
    if (own !== undefined && own !== '') return resolve(own, vars, rules, digits)
    if (dictionary) onMissing?.(key)
    return resolve((source[key] as Message | undefined) ?? key, vars, rules, digits)
  }
}

/** Every placeholder a message uses, across all of its forms. */
const slots = (message: Message): string[] =>
  [...new Set((isPlural(message) ? Object.values(message) : [message]).flatMap((text) => [...text.matchAll(PLACEHOLDER)].map((m) => m[1])))].sort()

/** The plural categories a language distinguishes, in CLDR order. ICU builds disagree on the order
 *  `resolvedOptions()` lists them in, and a message that names them must read the same everywhere. */
export function pluralCategories(tag: string): PluralCategory[] {
  const own = new Set(pluralRules(tag).resolvedOptions().pluralCategories)
  return CANONICAL_PLURAL_ORDER.filter((c) => own.has(c))
}

/** Everything wrong with a translation measured against its source, one line per problem; an empty
 *  list is a conforming translation. What typecheck already refuses (a missing key, a flattened
 *  plural) is repeated here so a catalog loaded from data is held to the same standard as one
 *  compiled from source; what typecheck cannot see is the point: empty text, a plural without the
 *  forms ITS language needs, a placeholder renamed or dropped. */
export function catalogProblems<Source extends Catalog>(source: Source, dictionary: Record<string, Message>, tag: string): string[] {
  const problems: string[] = []
  // CLDR's own order, not the runtime's: `pluralCategories` is a SET as far as the spec is
  // concerned, and engines hand it back in different orders. That order reaches the caller twice
  // (the order the problems are reported in, and the list printed inside each one), so taken as
  // given it would make this function's output depend on which machine ran it.
  const categories = pluralCategories(tag)
  for (const key of Object.keys(dictionary).sort()) if (!(key in source)) problems.push(`${key}: not in the source catalog`)
  for (const key of Object.keys(source).sort()) {
    const wanted = source[key] as Message
    const own = dictionary[key]
    if (own === undefined) {
      problems.push(`${key}: missing`)
      continue
    }
    if (isPlural(wanted) !== isPlural(own)) {
      problems.push(`${key}: ${isPlural(wanted) ? 'a plural in the source, a string here' : 'a string in the source, a plural here'}`)
      continue
    }
    const forms: [string, unknown][] = isPlural(own) ? Object.entries(own) : [['text', own]]
    for (const [form, text] of forms) if (typeof text !== 'string' || text.trim() === '') problems.push(`${key}: empty ${form}`)
    if (isPlural(own)) for (const c of categories) if (!(c in own)) problems.push(`${key}: no "${c}" form (${tag} distinguishes ${categories.join('/')})`)
    const want = slots(wanted)
    const have = slots(own)
    if (want.join() !== have.join()) problems.push(`${key}: placeholders {${have.join(', ')}} but the source has {${want.join(', ')}}`)
  }
  return problems
}

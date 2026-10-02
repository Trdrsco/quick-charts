// The private variable mapping and the scoped root selector: how a resolved semantic theme becomes
// CSS text, and where that text is allowed to apply.
//
// Two rules decide everything in this file. Every declaration lands on the widget's own root
// element, identified by one attribute, so two charts in one document can run different modes and
// neither reaches the host page. And the custom-property names are private implementation: the
// role id `canvas.background` is the public contract, the `--qc-canvas-background` it resolves to
// is not, and nothing outside this package should target one.
//
// This module deliberately has no runtime import. The build script loads it directly under Node's
// TypeScript stripping to generate `dist/quickcharts.css`, and Node resolves no extensionless
// relative specifier, so every input this file needs arrives as an argument.

/** The attribute the widget writes on its own root element. Its value is the active `ThemeMode`. */
export const THEME_ROOT_ATTRIBUTE = 'data-qc-theme'

/** The selector every rule in the package stylesheet is scoped under. */
export const THEME_ROOT_SELECTOR = `[${THEME_ROOT_ATTRIBUTE}]`

/** The selector for one mode's built-in variable block. */
export function themeRootSelector(mode: string): string {
  return `[${THEME_ROOT_ATTRIBUTE}="${mode}"]`
}

/** The private custom-property name for a role id: `surface.canvas` becomes `--qc-surface-canvas`. */
export function cssVarName(roleId: string): string {
  return `--qc-${roleId.replace(/\./g, '-')}`
}

/** One resolved role as it is written to the DOM. */
export interface ThemeDeclaration {
  /** The private custom-property name. */
  property: string
  /** The resolved value, already a CSS token. */
  value: string
}

/** Every role of a resolved theme as custom-property declarations, ordered by role id so the
 *  generated stylesheet, the runtime style writes, and the committed vectors all agree byte for
 *  byte. The argument is a complete theme; a partial one produces a short list, which is why
 *  resolution runs first. */
export function themeDeclarations(theme: Readonly<Record<string, string | number>>): ThemeDeclaration[] {
  return Object.keys(theme)
    .sort()
    .map((roleId) => ({ property: cssVarName(roleId), value: String(theme[roleId]) }))
}

/** One mode's built-in block: the selector, then one declaration per line. */
export function themeBlock(mode: string, theme: Readonly<Record<string, string | number>>): string {
  const body = themeDeclarations(theme)
    .map((d) => `  ${d.property}: ${d.value};`)
    .join('\n')
  return `${themeRootSelector(mode)} {\n${body}\n}`
}

/** The cascade layers the stylesheet declares. The built-in mode blocks sit in the tokens layer
 *  and every recipe in the chart layer, so a host decides where its own CSS stands by declaring
 *  the order once, before any product stylesheet loads. The names and their relative order are
 *  public: a host writes them into its ordering statement, after its reset and before its own
 *  overrides. */
export const STYLE_LAYERS = { tokens: 'quickcharts.tokens', chart: 'quickcharts.chart' } as const

/** The statement this stylesheet opens with: the layers it uses, in order. It never names a host
 *  layer, because the host owns the complete ordering and this sheet only takes its place in it. */
export const LAYER_ORDER_STATEMENT = `@layer ${STYLE_LAYERS.tokens}, ${STYLE_LAYERS.chart};`

/** The ordering a host declares in its first stylesheet, before any product CSS: its own reset
 *  first, the product layers, then the layer its intentional overrides live in. Documented, not
 *  emitted: a product that wrote a host layer would be deciding the host's cascade for it. */
export const HOST_LAYER_ORDER = `@layer reset, ${STYLE_LAYERS.tokens}, ${STYLE_LAYERS.chart}, host;`

/** What every duration role resolves to while the reader prefers reduced motion. */
export const REDUCED_MOTION_DURATION = '0ms'

/** The reduced-motion block: under `prefers-reduced-motion: reduce`, every duration role resolves to
 *  zero on every widget root. The declarations are `!important`, which outranks the custom
 *  properties the widget writes inline for a host's palette, so no palette can bring motion back to
 *  a reader who asked for none. Every transition the stylesheet runs reads one of these roles, and
 *  the chrome reads the same roles for how long to keep a closing surface, so both end at once. */
export function reducedMotionBlock(durationRoleIds: readonly string[]): string {
  const body = [...durationRoleIds]
    .sort()
    .map((roleId) => `    ${cssVarName(roleId)}: ${REDUCED_MOTION_DURATION} !important;`)
    .join('\n')
  return `@media (prefers-reduced-motion: reduce) {\n  ${THEME_ROOT_SELECTOR} {\n${body}\n  }\n}`
}

/** What the generator writes into the distributable stylesheet. */
export interface StylesheetInput {
  /** Built-in mode blocks, in the order they should appear. */
  blocks: { mode: string; theme: Readonly<Record<string, string | number>> }[]
  /** The duration role ids the reduced-motion block resolves to zero. */
  durationRoles: readonly string[]
  /** The authored structural and component CSS, already scoped to the root selector. */
  structural: string
}

/** Compose the distributable stylesheet: a short banner, the layer order, the built-in mode blocks
 *  and the reduced-motion block in the tokens layer, then the authored component CSS in the chart
 *  layer. The output is deterministic for a given input, which is what lets the drift gate compare a
 *  rebuild against the committed vectors. */
export function composeStylesheet(input: StylesheetInput): string {
  const banner = [
    '/* Quick Charts stylesheet.',
    ' * Generated from the typed theme source. Do not edit by hand.',
    ` * Every rule is scoped to ${THEME_ROOT_SELECTOR}, the widget root element, and sits in a cascade`,
    ` * layer: the built-in palettes in ${STYLE_LAYERS.tokens}, every recipe in ${STYLE_LAYERS.chart}.`,
    ' * The custom-property names below are private implementation, not API. The supported class',
    ' * names are listed in the theme manifest under hooks; every other class is private.',
    ' */',
  ].join('\n')
  const blocks = [...input.blocks.map((b) => themeBlock(b.mode, b.theme)), reducedMotionBlock(input.durationRoles)].join('\n\n')
  return [
    banner,
    '',
    LAYER_ORDER_STATEMENT,
    '',
    `@layer ${STYLE_LAYERS.tokens} {`,
    blocks,
    '}',
    '',
    `@layer ${STYLE_LAYERS.chart} {`,
    input.structural.trim(),
    '}',
    '',
  ].join('\n')
}

/** Every selector that introduces declarations outside any `@layer` block, in source order, with
 *  comments dropped. A stylesheet that keeps every rule layered answers an empty list. */
export function unlayeredSelectorsOf(css: string): string[] {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const out: string[] = []
  /** The at-rules whose block encloses the current position, innermost last. */
  const enclosing: string[] = []
  let prelude = ''
  for (const char of source) {
    if (char === '{') {
      const text = prelude.trim()
      if (text.startsWith('@')) enclosing.push(text)
      else {
        enclosing.push('')
        if (text && !enclosing.some((at) => at.startsWith('@layer'))) out.push(...text.split(',').map((s) => s.trim()).filter(Boolean))
      }
      prelude = ''
    } else if (char === '}') {
      enclosing.pop()
      prelude = ''
    } else if (char === ';' && enclosing.length === 0) {
      // A statement at the top level, such as the layer order, opens no block.
      prelude = ''
    } else {
      prelude += char
    }
  }
  return out
}

/** Every selector in a stylesheet, in source order. Comments and at-rule preludes are dropped, so
 *  what comes back is the list the scoping gate judges. */
export function selectorsOf(css: string): string[] {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const out: string[] = []
  for (const match of withoutComments.matchAll(/([^{}]+)\{/g)) {
    const prelude = match[1]!.trim()
    if (prelude.startsWith('@')) continue
    for (const selector of prelude.split(',')) {
      const trimmed = selector.trim()
      if (trimmed) out.push(trimmed)
    }
  }
  return out
}

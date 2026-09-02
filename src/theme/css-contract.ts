// The private variable mapping and the scoped root selector: how a resolved semantic theme becomes
// CSS text, and where that text is allowed to apply.
//
// Two rules decide everything in this file. Every declaration lands on the widget's own root
// element, identified by one attribute, so two charts in one document can run different modes and
// neither reaches the host page. And the custom-property names are private implementation: a role
// id is the public contract, `--qc-surface-canvas` is not, and nothing outside this package should
// target one.
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

/** What the generator writes into the distributable stylesheet. */
export interface StylesheetInput {
  /** Built-in mode blocks, in the order they should appear. */
  blocks: { mode: string; theme: Readonly<Record<string, string | number>> }[]
  /** The authored structural and component CSS, already scoped to the root selector. */
  structural: string
}

/** Compose the distributable stylesheet: a short banner, the built-in mode blocks, then the
 *  authored component CSS. The output is deterministic for a given input, which is what lets the
 *  drift gate compare a rebuild against the committed vectors. */
export function composeStylesheet(input: StylesheetInput): string {
  const banner = [
    '/* Quick Charts stylesheet.',
    ' * Generated from the typed theme source. Do not edit by hand.',
    ` * Every rule is scoped to ${THEME_ROOT_SELECTOR}, the widget root element.`,
    ' * The custom-property names below are private implementation, not API.',
    ' */',
  ].join('\n')
  const blocks = input.blocks.map((b) => themeBlock(b.mode, b.theme)).join('\n\n')
  return `${banner}\n\n${blocks}\n\n${input.structural.trim()}\n`
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

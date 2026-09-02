// Resolution: one mode plus a host's custom palettes become one complete, immutable theme.
//
// The theme palette ladder, lowest layer first:
//
//   1. the built-in palette for the selected mode;
//   2. the host's custom palette for that mode.
//
// A role the host does not name keeps the built-in value, so a partial palette is a tint rather than
// a replacement. An entry that fails validation is dropped and reported; it never reaches the
// resolved theme, and it never removes the built-in value it failed to replace.
//
// Chart appearance is a separate ladder. Series, grid, and study appearance overrides are resolved
// by the chart's own override tree, above whatever the theme says, and are not merged here.
import { BUILT_IN_THEMES } from './palettes'
import type { CustomThemes, SemanticTheme, ThemeMode } from './schema'
import { validateCustomThemes, type ThemeDiagnostic } from './validate'

/** A resolved theme and everything the host's input was told about. */
export interface ThemeResolution {
  mode: ThemeMode
  /** Complete: every role has a value. */
  theme: SemanticTheme
  /** Empty when the host's input was fully usable. */
  diagnostics: readonly ThemeDiagnostic[]
}

/** Resolve one mode over the built-in palette. The result is frozen, so a consumer can hold it
 *  across a mode change without copying. */
export function resolveSemanticTheme(mode: ThemeMode, custom?: CustomThemes | null): ThemeResolution {
  const diagnostics = validateCustomThemes(custom)
  const rejected = new Set(diagnostics.filter((d) => d.mode === mode).map((d) => d.role))
  const overrides = custom?.[mode] ?? {}
  const merged: Record<string, string> = { ...BUILT_IN_THEMES[mode] }
  for (const [role, value] of Object.entries(overrides)) {
    if (rejected.has(role) || typeof value !== 'string') continue
    merged[role] = value
  }
  return { mode, theme: Object.freeze(merged) as SemanticTheme, diagnostics }
}

// The runtime theme controller: one instance's mode, its custom palettes, and the subscription a
// host or a widget uses to hear about a change.
//
// It owns state and nothing else. It touches no DOM, imports no framework, and returns no element,
// so the same controller drives the canvas renderer and the scoped custom properties without either
// of them owning the other. The widget that mounts it applies what `renderer.ts` produces.
//
// A change is atomic: mode and palettes resolve together into one complete theme, and subscribers
// are called once with that theme. A call that resolves to the theme already in effect notifies
// nobody, so a host may set the mode it is already in without churning its own render.
import { resolveSemanticTheme, type ThemeResolution } from './resolve'
import type { CustomThemes, SemanticTheme, ThemeMode } from './schema'
import type { ThemeDiagnostic } from './validate'

/** What a host receives when the theme changes. */
export type ThemeChangeListener = (theme: SemanticTheme, mode: ThemeMode) => void

/** The runtime theme surface of one Quick Charts instance. */
export interface ThemeController {
  /** The mode in effect. */
  mode(): ThemeMode
  /** Switch modes. The chart keeps its symbol, timeframe, range, drawings, and studies. */
  setMode(mode: ThemeMode): void
  /** The complete resolved theme in effect. */
  get(): SemanticTheme
  /** Replace the custom palettes. A role a palette does not name returns to its built-in value. */
  applyCustom(themes: CustomThemes): void
  /** Drop every custom palette and return to the built-in palette for each mode. */
  resetCustom(): void
  /** Anything rejected in the custom palettes currently held. Empty when they are fully usable. */
  diagnostics(): readonly ThemeDiagnostic[]
  /** Subscribe to theme changes. Returns the unsubscribe. */
  onChange(listener: ThemeChangeListener): () => void
}

/** What a host may set when the controller is created. */
export interface ThemeControllerOptions {
  /** Defaults to `dark`. */
  mode?: ThemeMode
  /** Custom palettes for either mode, or both. */
  custom?: CustomThemes
}

/** Create the theme controller for one chart instance. */
export function createThemeController(options?: ThemeControllerOptions): ThemeController {
  let mode: ThemeMode = options?.mode ?? 'dark'
  let custom: CustomThemes | null = options?.custom ?? null
  let resolution: ThemeResolution = resolveSemanticTheme(mode, custom)
  const listeners = new Set<ThemeChangeListener>()

  /** Re-resolve and, when the result differs from what is in effect, publish it once. */
  const commit = (): void => {
    const next = resolveSemanticTheme(mode, custom)
    const unchanged = next.mode === resolution.mode && sameTheme(next.theme, resolution.theme)
    resolution = next
    if (unchanged) return
    for (const listener of [...listeners]) listener(resolution.theme, resolution.mode)
  }

  return {
    mode: () => resolution.mode,
    get: () => resolution.theme,
    diagnostics: () => resolution.diagnostics,
    setMode(next) {
      mode = next
      commit()
    },
    applyCustom(themes) {
      custom = themes
      commit()
    },
    resetCustom() {
      custom = null
      commit()
    },
    onChange(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

/** Whether two resolved themes carry the same value for every role. Both are complete, so comparing
 *  one key set is enough. */
function sameTheme(a: SemanticTheme, b: SemanticTheme): boolean {
  const keys = Object.keys(a) as (keyof SemanticTheme)[]
  return keys.length === Object.keys(b).length && keys.every((k) => a[k] === b[k])
}

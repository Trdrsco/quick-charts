// Validation of a host's custom palettes. Configuration errors are reported, never thrown into a
// render: a chart whose host mistyped one color still draws, wearing the built-in value for that
// role and carrying a diagnostic that names the role and says what was wrong.
//
// What is checked is what the schema declares. A key that is not a role id is unknown. A value is
// judged against the role's kind, so a color role rejects a length and a duration role rejects a
// color. Nothing here judges taste: an unusual but legible palette validates.
import { parseCssColor } from './color'
import { isThemeRoleId, THEME_MODES, THEME_ROLE_BY_ID, type CustomThemes, type ThemeMode, type ThemeRoleKind } from './schema'

/** What went wrong, as a machine-readable code. */
export type ThemeDiagnosticCode = 'unknown-role' | 'empty-value' | 'invalid-value'

/** One rejected entry of a host's custom palette. */
export interface ThemeDiagnostic {
  /** The mode whose palette carried the entry. */
  mode: ThemeMode
  /** The key as the host wrote it, whether or not it names a role. */
  role: string
  code: ThemeDiagnosticCode
  /** A sentence naming the problem, safe to log or surface in a host's own tooling. */
  message: string
}

const LENGTH = /^-?(?:\d+|\d*\.\d+)(?:px|rem|em|%)$/
const DURATION = /^(?:\d+|\d*\.\d+)(?:ms|s)$/
const EASING_KEYWORD = /^(?:linear|ease|ease-in|ease-out|ease-in-out|step-start|step-end)$/
const CUBIC_BEZIER = /^cubic-bezier\(\s*(-?(?:\d+|\d*\.\d+))\s*,\s*-?(?:\d+|\d*\.\d+)\s*,\s*(-?(?:\d+|\d*\.\d+))\s*,\s*-?(?:\d+|\d*\.\d+)\s*\)$/
const STEPS = /^steps\(\s*\d+\s*(?:,\s*(?:jump-start|jump-end|jump-none|jump-both|start|end)\s*)?\)$/
const LINEAR_FUNCTION = /^linear\([^()]+\)$/
const SCALE = /^(?:\d+|\d*\.\d+)$/

/** Whether a value is a CSS timing function: a keyword, a cubic Bezier curve whose x coordinates
 *  stay within 0 and 1 as CSS requires, a step function, or a piecewise linear function. */
function isEasing(value: string): boolean {
  if (EASING_KEYWORD.test(value) || STEPS.test(value) || LINEAR_FUNCTION.test(value)) return true
  const curve = CUBIC_BEZIER.exec(value)
  if (!curve) return false
  const x1 = Number(curve[1])
  const x2 = Number(curve[2])
  return x1 >= 0 && x1 <= 1 && x2 >= 0 && x2 <= 1
}

/** Whether a value is a valid token for a role of this kind. */
function isValidValue(kind: ThemeRoleKind, value: string): boolean {
  switch (kind) {
    case 'color':
      return parseCssColor(value) !== null
    case 'length':
      return LENGTH.test(value)
    case 'duration':
      return DURATION.test(value)
    case 'easing':
      return isEasing(value.trim())
    case 'scale':
      return SCALE.test(value.trim())
    case 'font':
      // A font stack is a comma-separated family list. Quick Charts never loads a font, so the only
      // requirement is that the value names at least one family.
      return value.trim().length > 0
    case 'shadow': {
      // `none`, or a shadow whose first token is an offset: a length, or a bare zero. The rest of
      // the grammar, including the color and the optional `inset`, is the browser's to enforce.
      const first = value.trim().split(/\s+/)[0] ?? ''
      return value.trim() === 'none' || first === '0' || LENGTH.test(first)
    }
  }
}

/** What a valid token for this kind looks like, for the diagnostic message. */
const EXPECTED: Record<ThemeRoleKind, string> = {
  color: 'a CSS color in hex or rgb notation',
  length: 'a CSS length such as 4px',
  duration: 'a CSS duration such as 150ms',
  easing: 'a CSS timing function such as ease-out or cubic-bezier(0.4, 0, 1, 1)',
  scale: 'a unitless scale factor such as 0.97',
  font: 'a font family stack',
  shadow: 'a CSS box shadow, or none',
}

/** Every problem in a host's custom palettes, in mode order then key order. An empty array means the
 *  input is usable in full. */
export function validateCustomThemes(custom: CustomThemes | null | undefined): ThemeDiagnostic[] {
  const out: ThemeDiagnostic[] = []
  if (!custom) return out
  for (const mode of THEME_MODES) {
    const palette = custom[mode]
    if (!palette) continue
    for (const key of Object.keys(palette).sort()) {
      const value = (palette as Record<string, unknown>)[key]
      if (!isThemeRoleId(key)) {
        out.push({ mode, role: key, code: 'unknown-role', message: `${key} is not a Quick Charts theme role.` })
        continue
      }
      if (typeof value !== 'string' || value.trim() === '') {
        out.push({ mode, role: key, code: 'empty-value', message: `${key} needs a non-empty string value.` })
        continue
      }
      const kind = THEME_ROLE_BY_ID[key]!.kind
      if (!isValidValue(kind, value)) {
        out.push({ mode, role: key, code: 'invalid-value', message: `${key} needs ${EXPECTED[kind]}. It received ${value}.` })
      }
    }
  }
  return out
}

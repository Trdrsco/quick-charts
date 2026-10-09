// The README's role tables quote the built-in palettes value by value, so a reader who copies one
// gets what the chart paints. Every row of every table under the Theme section that names a role
// and a light and a dark value is read back here against `BUILT_IN_THEMES`.
import { describe, expect, it } from 'vitest'
import readme from '../../README.md?raw'
import { BUILT_IN_THEMES } from '../../src/theme/palettes'
import { isThemeRoleId } from '../../src/theme/schema'

const theme = readme.slice(readme.indexOf('\n## Theme'), readme.indexOf('\n## Compare'))

/** Every `| \`role\` | \`light\` | \`dark\` | ... |` row of the Theme section. */
const rows = [...theme.matchAll(/^\| `([a-zA-Z]+\.[a-zA-Z]+)` \| `([^`]+)` \| `([^`]+)` \|/gm)].map((m) => ({ role: m[1]!, light: m[2]!, dark: m[3]! }))

describe('the README palette tables', () => {
  it('quote roles the inventory has', () => {
    expect(rows.length).toBeGreaterThanOrEqual(16)
    for (const row of rows) expect(isThemeRoleId(row.role), row.role).toBe(true)
  })

  for (const row of rows) {
    it(`quotes ${row.role} as the built-in palettes hold it`, () => {
      const id = row.role as keyof typeof BUILT_IN_THEMES.light
      expect(BUILT_IN_THEMES.light[id]).toBe(row.light)
      expect(BUILT_IN_THEMES.dark[id]).toBe(row.dark)
    })
  }
})

// The supported styling hooks: each names a class the chrome really emits, each has a recipe of
// its own in the authored stylesheet, and the manual lists every one with what a host may change.
//
// A hook that the markup stopped emitting would leave a host's rule matching nothing, silently.
// A hook the manual does not list is a promise nobody can find. Both are held here rather than
// discovered by a client.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { STYLE_HOOKS, STYLE_HOOK_CLASSES } from '../../src/theme/hooks'
import { authoredStylesheet } from './stylesheetSource'

const packageRoot = fileURLToPath(new URL('../..', import.meta.url))

/** Every TypeScript source file under src, read once. */
function sources(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) out.push(...sources(path))
    else if (/\.tsx?$/.test(name) && !name.endsWith('.d.ts')) out.push(readFileSync(path, 'utf8'))
  }
  return out
}

const source = sources(join(packageRoot, 'src')).join('\n')
const css = authoredStylesheet()
const readme = readFileSync(join(packageRoot, 'README.md'), 'utf8')

describe('the supported styling hooks', () => {
  it('name distinct classes in the chart vocabulary, never a control inside a surface', () => {
    expect(new Set(STYLE_HOOK_CLASSES).size).toBe(STYLE_HOOK_CLASSES.length)
    for (const className of STYLE_HOOK_CLASSES) {
      expect(className).toMatch(/^qc-[a-z-]+$/)
      expect(className).not.toMatch(/button|row|icon|label|input|field/)
    }
  })

  it('are classes the chrome emits', () => {
    for (const hook of STYLE_HOOKS) {
      // Emitted as a whole class, in a class string or a className assignment, not only mentioned.
      const emitted = new RegExp(`(class: ['\`][^'\`]*\\b${hook.className}\\b|className = '${hook.className}')`)
      expect(source, hook.className).toMatch(emitted)
    }
  })

  it('each carry a recipe of their own in the authored stylesheet', () => {
    for (const hook of STYLE_HOOKS) {
      expect(css, hook.className).toMatch(new RegExp(`\\.${hook.className}(?![a-z-])[^{]*\\{`))
    }
  })

  it('announce state through attributes, never a modifier class', () => {
    for (const hook of STYLE_HOOKS) for (const state of hook.states) expect(state.attribute).not.toMatch(/^\./)
  })

  it('are every one listed in the manual with their customization', () => {
    for (const hook of STYLE_HOOKS) {
      expect(readme, hook.className).toContain(`\`.${hook.className}\``)
      for (const property of hook.customization) expect(readme, `${hook.className} ${property}`).toContain(property)
    }
  })
})

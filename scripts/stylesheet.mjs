// The stylesheet composition the generators share: the built-in mode blocks followed by the authored
// structural rules and every component recipe under src/styles/components, in name order. One
// function, so the packed stylesheet and the guest's copy can never come from two readings of the
// theme source.
//
// It imports the theme source directly. Node strips the type annotations, which is why `schema.ts`,
// `palettes.ts` and `css-contract.ts` carry no runtime import of their own: Node resolves no
// extensionless relative specifier, so each of those modules has to stand alone.
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { THEME_MODES } from '../src/theme/schema.ts'
import { BUILT_IN_THEMES } from '../src/theme/palettes.ts'
import { composeStylesheet } from '../src/theme/css-contract.ts'

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

/** The authored CSS files in the order the stylesheet composes them: the structural file, then the
 *  recipes by name. The stylesheet fixture in test/theme reads exactly this list. */
export function authoredStylesheetFiles() {
  const componentsDir = join(pkgRoot, 'src/styles/components')
  const componentFiles = readdirSync(componentsDir)
    .filter((name) => name.endsWith('.css'))
    .sort()
    .map((name) => join(componentsDir, name))
  return [join(pkgRoot, 'src/styles/quickcharts.css'), ...componentFiles]
}

/** The distributable stylesheet, composed from the theme source and the authored CSS. */
export function composeDistributableStylesheet() {
  const structural = authoredStylesheetFiles()
    .map((path) => readFileSync(path, 'utf8').trim())
    .join('\n\n')
  const blocks = THEME_MODES.map((mode) => ({ mode, theme: BUILT_IN_THEMES[mode] }))
  return composeStylesheet({ blocks, structural })
}

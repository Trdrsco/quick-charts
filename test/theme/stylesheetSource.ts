// The stylesheet readers the theme fixtures share.
//
// Vitest does not process CSS, so a stylesheet imported with Vite's `?raw` arrives as an empty
// string. These read the files as bytes instead, deriving the package root from the module URL.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/** This file's path, then the package root, through Node's own file-URL conversion rather than the
 *  global `URL`: a DOM environment replaces that global with one that reads a file URL differently,
 *  and the theme matrix runs under happy-dom and reads these files too. Forward slashes throughout. */
const thisFile = fileURLToPath(import.meta.url).replace(/\\/g, '/')
const packageRoot = thisFile.replace(/\/test\/theme\/[^/]+$/, '')

const componentsDir = `${packageRoot}/src/styles/components`

/** Every authored CSS file, in the order the generator concatenates them: the structural file first,
 *  then each component recipe file in name order. Keyed by root-relative path so an offender reads
 *  the same in a Windows and a CI log. */
export const authoredStylesheets = (): Record<string, string> => {
  const out: Record<string, string> = { '/src/styles/quickcharts.css': readFileSync(`${packageRoot}/src/styles/quickcharts.css`, 'utf8') }
  for (const name of readdirSync(componentsDir).filter((n) => n.endsWith('.css')).sort()) {
    out[`/src/styles/components/${name}`] = readFileSync(`${componentsDir}/${name}`, 'utf8')
  }
  return out
}

/** The authored component recipes as one text, exactly as the generator composes them. */
export const authoredStylesheet = (): string =>
  Object.values(authoredStylesheets())
    .map((text) => text.trim())
    .join('\n\n')

/** A generated artifact, or null when no build has run. */
export const builtArtifact = (name: string): string | null => {
  const path = `${packageRoot}/dist/${name}`
  return existsSync(path) ? readFileSync(path, 'utf8') : null
}

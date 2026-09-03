// The stylesheet readers the theme fixtures share.
//
// Vitest does not process CSS, so a stylesheet imported with Vite's `?raw` arrives as an empty
// string. These read the files as bytes instead, deriving the package root from the module URL so
// no node path helper enters the package's type surface.
import { existsSync, readdirSync, readFileSync } from 'node:fs'

/** This file's directory, then the package root. Decoded, because a Windows `Joe D` path URL-encodes
 *  its space, and drive-letter-normalized. */
const testDir = decodeURIComponent(new URL('.', import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1')
const packageRoot = testDir.replace(/\/test\/theme\/?$/, '')

const componentsDir = `${packageRoot}/src/styles/components`

/** Every authored CSS file, in the order the generator concatenates them: the structural file first,
 *  then each component recipe file in name order. Keyed by root-relative path so an offender reads
 *  the same in a Windows and a CI log. */
export const authoredStylesheets = (): Record<string, string> => {
  const out: Record<string, string> = { '/packages/chart/src/styles/quickcharts.css': readFileSync(`${packageRoot}/src/styles/quickcharts.css`, 'utf8') }
  for (const name of readdirSync(componentsDir).filter((n) => n.endsWith('.css')).sort()) {
    out[`/packages/chart/src/styles/components/${name}`] = readFileSync(`${componentsDir}/${name}`, 'utf8')
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

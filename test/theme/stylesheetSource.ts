// The stylesheet readers the theme fixtures share.
//
// Vitest does not process CSS, so a stylesheet imported with Vite's `?raw` arrives as an empty
// string. These read the files as bytes instead, deriving the package root from the module URL so
// no node path helper enters the package's type surface.
import { existsSync, readFileSync } from 'node:fs'

/** This file's directory, then the package root. Decoded, because a Windows `Joe D` path URL-encodes
 *  its space, and drive-letter-normalized. */
const testDir = decodeURIComponent(new URL('.', import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1')
const packageRoot = testDir.replace(/\/test\/theme\/?$/, '')

/** The authored component recipes, exactly as the generator reads them. */
export const authoredStylesheet = (): string => readFileSync(`${packageRoot}/src/styles/quickcharts.css`, 'utf8')

/** A generated artifact, or null when no build has run. */
export const builtArtifact = (name: string): string | null => {
  const path = `${packageRoot}/dist/${name}`
  return existsSync(path) ? readFileSync(path, 'utf8') : null
}

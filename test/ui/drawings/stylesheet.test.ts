// The drawing surfaces' recipes, read as bytes the way the theme fixtures read the kernel sheet:
// every overlay a surface opens sits inside the chart root, so it positions absolutely against
// the root and never against the viewport; nothing reaches outside the package for an asset; and
// no rule addresses an element by id, because the surfaces write none.
import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/** This file's directory, decoded and drive-letter-normalized, then the recipes folder. */
const testDir = decodeURIComponent(new URL('.', import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1')
const recipes = testDir.replace(/\/test\/ui\/drawings\/?$/, '/src/styles/components')

const sheets = readdirSync(recipes)
  .filter((name) => /^drawings-.*\.css$/.test(name))
  .map((name) => [name, readFileSync(`${recipes}/${name}`, 'utf8')] as const)

describe('the drawing recipes', () => {
  it('exist, one per surface family', () => {
    expect(sheets.map(([name]) => name).sort()).toEqual(['drawings-editors.css', 'drawings-fields.css', 'drawings-settings.css', 'drawings-toolbar.css'])
  })

  it.each(sheets)('%s positions nothing against the viewport', (_name, css) => {
    expect(css).not.toMatch(/position:\s*fixed/)
  })

  it('places the popover absolutely, inside the root', () => {
    const toolbar = sheets.find(([name]) => name === 'drawings-toolbar.css')![1]
    const rule = toolbar.match(/\.qc-drawing-popover\s*\{([^}]*)\}/)
    expect(rule?.[1]).toMatch(/position:\s*absolute/)
  })

  it.each(sheets)('%s reaches no external asset and no element id', (_name, css) => {
    expect(css).not.toMatch(/url\(/)
    // A `#` starts a selector only at a rule's head; inside a declaration it is a color literal,
    // which the theme literal pin already forbids.
    expect(css).not.toMatch(/(^|[\s,>+~])#[A-Za-z_-]/m)
  })
})

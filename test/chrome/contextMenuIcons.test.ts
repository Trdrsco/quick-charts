// @vitest-environment happy-dom
// The level menu's icon gutter, for the chart's own rows and for rows the chart did not write. Both
// bring the SAME thing: an inert descriptor of shapes on the menu's 28 grid. The menu draws them in
// the same cell through one builder, and it must actually PAINT: a descriptor sitting in data
// changes nothing a viewer sees.
//
// The contract is deliberately narrow and it is held by construction. Nodes are created and
// attributes are written from an allowlist, so there is no markup path into this menu for a script,
// a handler or a remote reference to travel down; the payload is bounded, so a raise cannot be made
// expensive by contributing to it; and every refusal is silent and free, so a glyph the menu will
// not draw costs the row nothing at all.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mountContextMenu, type ContextMenuExtraRow } from '../../src/contextMenuUi'
import { createChartI18n } from '../../src/i18n'
import { GLYPH_ATTRIBUTES, GLYPH_LIMITS } from '../../src/ui/chrome/vector'
import type { ChartExtensionIcon } from '../../src/extension'
import type { ChartMenuContext } from '../../src/contextMenu'
import { authoredStylesheet } from '../theme/stylesheetSource'
import { everyHostIcon } from '../ownIcons'

const CTX: ChartMenuContext = { priceText: '5001.25', symbol: 'ESU6', indicatorCount: 0, drawingCount: 0, canPaste: false, canSettings: false }

const chevron: ChartExtensionIcon = { paths: [{ d: 'M4 10 L14 20 L24 10 Z', rule: 'evenodd' }] }
const outline: ChartExtensionIcon = { paths: [{ d: 'M6 6 H22 V22 H6 Z', paint: 'outline', width: 2 }] }

/** Path data of an exact length, so a bound can be read from either side of itself. */
const dataOfLength = (n: number): string => `M0 0${' L1 1'.repeat(Math.floor((n - 4) / 5))}${' '.repeat((n - 4) % 5)}`

let cleanup: (() => void)[] = []
afterEach(() => {
  for (const fn of cleanup.splice(0)) fn()
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

function raise(extra: readonly ContextMenuExtraRow[], ctx: ChartMenuContext = CTX) {
  const host = document.createElement('div')
  document.body.append(host)
  const strings = createChartI18n()
  const menu = mountContextMenu(host, () => {}, strings)
  cleanup.push(() => {
    menu.destroy()
    host.remove()
  })
  menu.open({ clientX: 20, clientY: 20 }, ctx, extra)
  const rows = [...host.querySelectorAll('.qc-menu-row')]
  return {
    menu,
    host,
    rows,
    labels: rows.map((r) => r.querySelector('.qc-menu-label')?.textContent ?? ''),
    glyphs: rows.map((r) => r.querySelector('.qc-menu-icon svg')),
  }
}

const row = (label: string, icon?: ChartExtensionIcon): ContextMenuExtraRow => ({ label, ...(icon ? { icon } : {}), run: () => {} })

/** The glyph one contributed row drew, or null where the menu drew none. */
const drew = (icon: ChartExtensionIcon) => raise([row('Contributed', icon)]).glyphs.slice(-1)[0]

/** The element children of a row, by recipe: the row's shape at the glass. */
const skeleton = (r: Element): string[] => [...r.children].map((c) => c.getAttribute('class') ?? c.tagName.toLowerCase())

describe('a contributed row draws its own glyph in the shared gutter', () => {
  it('paints the vector as elements, in the menu icon cell, at the 28 grid', () => {
    const { rows, glyphs } = raise([row('Sell limit', chevron)])
    const svg = glyphs[glyphs.length - 1]!
    expect(svg).not.toBe(null)
    expect(svg.getAttribute('viewBox')).toBe('0 0 28 28')
    expect(svg.getAttribute('width')).toBe('28')
    const path = svg.querySelector('path')!
    expect(path.getAttribute('d')).toBe('M4 10 L14 20 L24 10 Z')
    expect(path.getAttribute('fill')).toBe('currentColor')
    expect(path.getAttribute('fill-rule')).toBe('evenodd')
    expect(rows[rows.length - 1]!.querySelector('.qc-menu-icon')).not.toBe(null)
  })

  it('carries a stroked shape without a fill', () => {
    const { glyphs } = raise([row('Add order', outline)])
    const path = glyphs[glyphs.length - 1]!.querySelector('path')!
    expect(path.getAttribute('fill')).toBe('none')
    expect(path.getAttribute('stroke')).toBe('currentColor')
    expect(path.getAttribute('stroke-width')).toBe('2')
  })

  it('leaves the gutter empty for a row that contributes no glyph, and still reserves it', () => {
    const { rows, glyphs } = raise([row('Hide marks')])
    expect(glyphs[glyphs.length - 1]).toBe(null)
    expect(rows[rows.length - 1]!.querySelector('.qc-menu-icon')).not.toBe(null)
  })

  it('places level rows under the clipboard and view rows under the removes, each in the order given', () => {
    const rows = [row('Sell limit', chevron), row('Buy stop', chevron), row('Add order', outline), { ...row('Hide marks'), group: 'view' as const }]
    const { labels, host } = raise(rows, { ...CTX, indicatorCount: 1, drawingCount: 2, canPaste: true })
    expect(labels).toEqual(['Reset chart view', 'Copy price 5001.25', 'Paste', 'Sell limit', 'Buy stop', 'Add order', 'Remove 1 indicator', 'Remove 2 drawings', 'Hide marks'])
    // One separator between each group that exists, none around an empty one.
    const kinds = [...host.querySelectorAll('.qc-menu > *')].map((n) => (n.classList.contains('qc-separator') ? '|' : '.'))
    expect(kinds.join('')).toBe('.|..|...|..|.')
    // With nothing to remove, the view row still takes its own group after the level rows.
    const alone = raise(rows, { ...CTX, canPaste: true })
    expect(alone.labels).toEqual(['Reset chart view', 'Copy price 5001.25', 'Paste', 'Sell limit', 'Buy stop', 'Add order', 'Hide marks'])
    expect([...alone.host.querySelectorAll('.qc-menu > *')].map((n) => (n.classList.contains('qc-separator') ? '|' : '.')).join('')).toBe('.|..|...|.')
  })

  it('a checked row shows the check rather than its own glyph, whoever contributed it', () => {
    const { glyphs } = raise([{ label: 'Hide marks', checked: true, icon: chevron, run: () => {} }])
    expect(glyphs[glyphs.length - 1]!.querySelector('path')!.getAttribute('d')).toContain('M22 9.06')
  })
})

// One contract, not two. The chart's own glyphs are descriptors on the same grid, drawn by the same
// builder as a host's, so a contributed row is not second class and there is no second icon path to
// keep in step with this one.
describe('the chart draws its own glyphs the way it draws a contributed one', () => {
  const builtIn = (canSettings: boolean) => raise([], { ...CTX, canSettings })

  it('builds the reset glyph as paths, with no grouping element and no colour of its own', () => {
    const svg = builtIn(false).glyphs[0]!
    expect(svg).not.toBe(null)
    expect(svg.querySelectorAll('g').length).toBe(0)
    const paths = [...svg.querySelectorAll('path')]
    expect(paths.map((p) => p.getAttribute('d'))).toEqual(['M6.5 15A8.5 8.5 0 1 0 15 6.5H8.5', 'M12 10L8.5 6.5 12 3'])
    expect(paths.map((p) => p.getAttribute('stroke'))).toEqual(['currentColor', 'currentColor'])
    expect(paths.map((p) => p.getAttribute('fill'))).toEqual(['none', 'none'])
  })

  it('builds the settings glyph as two filled shapes with holes in them', () => {
    const { rows, glyphs } = builtIn(true)
    const paths = [...glyphs[rows.length - 1]!.querySelectorAll('path')]
    expect(paths.length).toBe(2)
    expect(paths.every((p) => p.getAttribute('fill') === 'currentColor' && p.getAttribute('fill-rule') === 'evenodd')).toBe(true)
  })

  it('names a glyph the chart does not have without drawing anything for it', () => {
    const { rows, glyphs } = raise([{ label: 'Contributed', icon: 'nonesuch', run: () => {} } as unknown as ContextMenuExtraRow])
    expect(glyphs[glyphs.length - 1]).toBe(null)
    expect(rows[rows.length - 1]!.textContent).toBe('Contributed')
  })
})

// The construction rule, read off the source rather than inferred from one payload: markup never
// enters this menu, and an attribute name can only be one the builder itself names.
describe('the painter builds nodes, and writes only the attributes it names', () => {
  const SOURCES = import.meta.glob(['/src/contextMenuUi.ts', '/src/ui/chrome/vector.ts'], {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>

  const source = (file: string): string => {
    const text = SOURCES[`/src/${file}`]
    expect(text, `${file} is readable`).toBeTypeOf('string')
    return text!
  }

  it('has no markup write anywhere in the menu painter or the glyph builder', () => {
    for (const file of ['contextMenuUi.ts', 'ui/chrome/vector.ts']) {
      const offenders = source(file)
        .split('\n')
        .map((text, i) => ({ line: i + 1, text }))
        .filter(({ text }) => /innerHTML|outerHTML|insertAdjacentHTML|createContextualFragment|DOMParser|<svg|<path|<g[ >]/.test(text))
        .map(({ line, text }) => `${file}:${line}: ${text.trim()}`)
      expect(offenders).toEqual([])
    }
  })

  it('writes attributes through exactly one call, guarded by the allowlist', () => {
    const builder = source('ui/chrome/vector.ts')
    expect(builder.match(/setAttribute\(/g)?.length).toBe(1)
    expect(builder).toContain('if (allowed.includes(name)) node.setAttribute(name, value)')
    expect(source('contextMenuUi.ts')).not.toContain('setAttribute')
  })

  it('draws a glyph carrying no attribute outside the allowlist, and no script', () => {
    const svg = drew({ paths: [{ d: 'M2 2 L26 26' }, { d: 'M6 6 H22 V22 H6 Z', paint: 'outline', width: 2, rule: 'evenodd' }] })!
    expect(svg.getAttributeNames().sort()).toEqual([...GLYPH_ATTRIBUTES.svg])
    for (const path of svg.querySelectorAll('path')) {
      expect(path.getAttributeNames().every((n) => (GLYPH_ATTRIBUTES.path as readonly string[]).includes(n))).toBe(true)
    }
    expect(svg.querySelector('script')).toBe(null)
  })

  it('takes nothing from a descriptor but its shapes: no element, no callback, no reference', () => {
    const hostile = {
      paths: [{ d: 'M2 2 L26 26', href: 'https://example.com/x.svg', onclick: () => {}, style: 'color:red', extra: document.createElement('img') }],
      title: 'contributed',
      onclick: () => {},
    } as unknown as ChartExtensionIcon
    const svg = drew(hostile)!
    expect(svg.querySelectorAll('*').length).toBe(1)
    expect(svg.querySelector('path')!.getAttributeNames().sort()).toEqual(['d', 'fill'])
    expect(svg.getAttributeNames()).not.toContain('title')
  })
})

// The bounds. They are what makes a refusal cheaper than the drawing it refuses: a raise builds one
// glyph per row while the viewer waits, so the work a contribution may ask for is capped, and a
// descriptor beyond the cap is turned away before any of it is read.
describe('the descriptor is validated before it is drawn', () => {
  it('accepts a glyph sitting on every bound', () => {
    const full: ChartExtensionIcon = { paths: Array.from({ length: GLYPH_LIMITS.shapes }, (_, i) => ({ d: `M${i} ${i} L26 26` })) }
    expect(drew(full)!.querySelectorAll('path').length).toBe(GLYPH_LIMITS.shapes)
    expect(drew({ paths: [{ d: dataOfLength(GLYPH_LIMITS.pathData) }] })!.querySelector('path')!.getAttribute('d')!.length).toBe(GLYPH_LIMITS.pathData)
    const widest = drew({ paths: [{ d: 'M2 2 L26 26', paint: 'outline', width: GLYPH_LIMITS.strokeWidth }] })!
    expect(widest.querySelector('path')!.getAttribute('stroke-width')).toBe(String(GLYPH_LIMITS.strokeWidth))
  })

  it('refuses a glyph of more shapes than one may hold, without reading any of them', () => {
    expect(drew({ paths: Array.from({ length: GLYPH_LIMITS.shapes + 1 }, () => ({ d: 'M2 2 L26 26' })) })).toBe(null)
  })

  it('drops a shape whose path data is longer than a shape may be', () => {
    expect(drew({ paths: [{ d: dataOfLength(GLYPH_LIMITS.pathData + 1) }] })).toBe(null)
  })

  it('drops a shape holding a number that is not finite', () => {
    for (const d of ['M1e999 0 L26 26', 'M2 2 L1E400 26', 'M2 2 L26 1e310']) expect(drew({ paths: [{ d }] })).toBe(null)
  })

  it('drops a stroked shape whose width is not a sensible number, rather than picking one for it', () => {
    for (const width of [0, -1, GLYPH_LIMITS.strokeWidth + 1, Number.NaN, Number.POSITIVE_INFINITY, '2' as unknown as number]) {
      expect(drew({ paths: [{ d: 'M2 2 L26 26', paint: 'outline', width }] })).toBe(null)
    }
  })

  it('drops a shape naming a paint or a winding rule this contract does not have', () => {
    expect(drew({ paths: [{ d: 'M2 2 L26 26', paint: 'gradient' as 'solid' }] })).toBe(null)
    expect(drew({ paths: [{ d: 'M2 2 L26 26', rule: 'inherit' as 'nonzero' }] })).toBe(null)
  })

  it('refuses a value that is not path data rather than drawing it', () => {
    for (const d of ['"/><script>alert(1)</script>', 'url(https://example.com/x.svg)', 'M0 0 L1 1; onload=alert(1)', '<path d="M0 0"/>', '']) {
      expect(drew({ paths: [{ d }] })).toBe(null)
    }
  })

  it('draws nothing at all for an empty or malformed descriptor', () => {
    expect(drew({ paths: [] })).toBe(null)
    expect(drew({ paths: [{ d: 1 as unknown as string }] })).toBe(null)
    expect(drew({} as ChartExtensionIcon)).toBe(null)
    expect(drew({ paths: 'M2 2' as unknown as ChartExtensionIcon['paths'] })).toBe(null)
  })

  it('drops only the refused shape and still draws the rest of the glyph', () => {
    const svg = drew({ paths: [{ d: 'javascript:alert(1)' }, { d: 'M2 2 L26 26' }] })!
    expect(svg.querySelectorAll('path').length).toBe(1)
    expect(svg.querySelector('path')!.getAttribute('d')).toBe('M2 2 L26 26')
  })
})

// A glyph changes what a row looks like and nothing else about it: not its ink, not what a screen
// reader says, not where its label sits.
describe('the row is unchanged by the glyph it wears', () => {
  it('takes the ink of the row it sits in and names no colour of its own', () => {
    const svg = drew({ paths: [{ d: 'M2 2 L26 26' }, { d: 'M6 6 H22 V22 H6 Z', paint: 'outline' }] })!
    const paint = [...svg.querySelectorAll('path')].flatMap((p) => [p.getAttribute('fill'), p.getAttribute('stroke')].filter((v) => v !== null))
    expect(paint).toEqual(['currentColor', 'none', 'currentColor'])
    expect(svg.outerHTML).not.toMatch(/#[0-9a-f]{3}|rgb\(|hsl\(|var\(/i)
    // The ink itself is the menu row's semantic foreground, so the glyph reads correctly in every
    // theme without knowing which one is on. A row rests in the primary ink and keeps it under the
    // pointer; the glyph follows because it names no colour of its own.
    expect(authoredStylesheet()).toMatch(/\.qc-menu-row \{[^}]*color: var\(--qc-text-primary\)/)
    expect(authoredStylesheet()).toMatch(/\.qc-menu-row:hover \{[^}]*color: var\(--qc-text-primary\)/)
  })

  it('keeps the name and role of the row, and is not announced as content', () => {
    const withGlyph = raise([row('Sell 1 ESU6 @ 5001.25', chevron)]).rows.slice(-1)[0]!
    const without = raise([row('Sell 1 ESU6 @ 5001.25')]).rows.slice(-1)[0]!
    expect(withGlyph.tagName).toBe('BUTTON')
    expect(withGlyph.getAttribute('role')).toBe(null)
    expect(withGlyph.getAttribute('aria-label')).toBe(without.getAttribute('aria-label'))
    expect(withGlyph.textContent).toBe(without.textContent)
    expect(withGlyph.textContent).toBe('Sell 1 ESU6 @ 5001.25')
    const svg = withGlyph.querySelector('svg')!
    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expect(svg.textContent).toBe('')
  })

  it('keeps the row geometry with a glyph, without one, and with one the menu refused', () => {
    const rows = raise([row('A', chevron), row('B'), row('C', { paths: [{ d: 'nope' }] })]).rows.slice(-3)
    expect(rows.map(skeleton)).toEqual([
      ['qc-menu-icon', 'qc-menu-label'],
      ['qc-menu-icon', 'qc-menu-label'],
      ['qc-menu-icon', 'qc-menu-label'],
    ])
    // The gutter is a fixed column in the recipe, so an empty cell holds the label exactly where a
    // drawn one does rather than letting it slide left.
    expect(authoredStylesheet()).toMatch(/\.qc-menu-icon \{[^}]*flex: 0 0 36px/)
  })
})

// The refusal path, end to end: a row whose glyph the menu will not draw is a row, not an incident.
describe('a glyph the menu will not draw costs the row nothing', () => {
  it('paints a refused row exactly as a row that brought no glyph, and says nothing about it', () => {
    const noise = (['debug', 'error', 'info', 'log', 'warn'] as const).map((name) => vi.spyOn(console, name).mockImplementation(() => {}))
    const refused = raise([row('Add order', { paths: [{ d: 'M2 2 L26 26', paint: 'outline', width: Number.NaN }] })]).rows.slice(-1)[0]!
    const plain = raise([row('Add order')]).rows.slice(-1)[0]!
    expect(refused.outerHTML).toBe(plain.outerHTML)
    expect(noise.flatMap((spy) => spy.mock.calls)).toEqual([])
  })

  it('opens the menu around a descriptor that throws when it is read', () => {
    const explosive = {
      get paths(): never {
        throw new Error('read me')
      },
    } as unknown as ChartExtensionIcon
    const { rows, glyphs } = raise([row('Drawn above', chevron), row('Contributed', explosive)])
    expect(rows[rows.length - 1]!.textContent).toBe('Contributed')
    expect(glyphs[glyphs.length - 1]).toBe(null)
    expect(glyphs[glyphs.length - 2]).not.toBe(null)
  })

  it('still runs the row a refused glyph belongs to', () => {
    let ran = 0
    const { rows } = raise([{ label: 'Add order', icon: { paths: [{ d: '' }] }, run: () => (ran += 1) }])
    ;(rows[rows.length - 1] as HTMLButtonElement).click()
    expect(ran).toBe(1)
  })
})

describe('a contribution lives exactly as long as the menu that was given it', () => {
  it('two menus draw their own contributions independently', () => {
    const a = raise([row('A', chevron)])
    const b = raise([row('B', outline)])
    expect(a.labels.slice(-1)).toEqual(['A'])
    expect(b.labels.slice(-1)).toEqual(['B'])
  })

  it('a raise with no contributions leaves none of the last raise behind', () => {
    const first = raise([row('Sell limit', chevron)])
    first.menu.open({ clientX: 20, clientY: 20 }, CTX, [])
    const labels = [...first.host.querySelectorAll('.qc-menu-label')].map((n) => n.textContent)
    expect(labels).not.toContain('Sell limit')
  })

  it('a destroyed menu leaves nothing in the host', () => {
    const { host, menu } = raise([row('Sell limit', chevron)])
    menu.destroy()
    expect(host.querySelectorAll('.qc-menu-row').length).toBe(0)
  })
})

describe("a host's drawings reach the chart's own rows and leave a contribution its own", () => {
  function raiseWithHostIcons(extra: readonly ContextMenuExtraRow[], ctx: ChartMenuContext = CTX) {
    const host = document.createElement('div')
    document.body.append(host)
    const menu = mountContextMenu(host, () => {}, createChartI18n(), everyHostIcon())
    cleanup.push(() => {
      menu.destroy()
      host.remove()
    })
    menu.open({ clientX: 20, clientY: 20 }, ctx, extra)
    return (label: string): SVGSVGElement | null =>
      [...host.querySelectorAll('.qc-menu-row')].find((r) => r.querySelector('.qc-menu-label')?.textContent?.startsWith(label))?.querySelector<SVGSVGElement>('.qc-menu-icon svg') ?? null
  }

  it('draws the reset, settings and check rows in the host artwork for those icons', () => {
    const glyphOf = raiseWithHostIcons([{ label: 'Sync', checked: true, run: () => {} }], { ...CTX, canSettings: true })
    expect(glyphOf('Reset chart view')?.getAttribute('data-host-icon')).toBe('reset')
    expect(glyphOf('Settings')?.getAttribute('data-host-icon')).toBe('settings')
    // The checked state owns the cell whoever contributed the row, so it wears the check.
    expect(glyphOf('Sync')?.getAttribute('data-host-icon')).toBe('check')
  })

  it("leaves a contributed row the drawing it brought", () => {
    const glyphOf = raiseWithHostIcons([row('Sell limit', chevron)])
    const svg = glyphOf('Sell limit')!
    expect(svg.hasAttribute('data-host-icon')).toBe(false)
    expect(svg.querySelector('path')!.getAttribute('d')).toBe('M4 10 L14 20 L24 10 Z')
  })
})

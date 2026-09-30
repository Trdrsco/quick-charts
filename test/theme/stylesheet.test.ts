// The stylesheet contract: scoping, drift, and the two-instance guarantee.
//
// The composed stylesheet is built here from the same two inputs the generator uses, so this
// fixture judges the real artifact without needing a build to have run. `vectors.json` is the
// committed record of what the generator emits for the built-in palettes; editing a palette without
// rerunning `pnpm --filter @trdrs/quickcharts build:theme` fails the drift block below.
import { describe, expect, it } from 'vitest'
import { composeStylesheet, cssVarName, HOST_LAYER_ORDER, LAYER_ORDER_STATEMENT, selectorsOf, STYLE_LAYERS, themeBlock, themeDeclarations, THEME_ROOT_ATTRIBUTE, themeRootSelector, unlayeredSelectorsOf } from '../../src/theme/css-contract'
import { BUILT_IN_THEMES } from '../../src/theme/palettes'
import { THEME_MODES, THEME_ROLES } from '../../src/theme/schema'
import { authoredStylesheet, authoredStylesheets } from './stylesheetSource'
import vectors from './vectors.json'

const structural = authoredStylesheet()
const blocks = THEME_MODES.map((mode) => ({ mode, theme: BUILT_IN_THEMES[mode] }))
const css = composeStylesheet({ blocks, structural })

describe('the scoped stylesheet', () => {
  it('keeps the layout setup flyout measured, reachable, and neutral', () => {
    const panel = structural.match(/\[data-qc-theme\] \.qc-menu-panel\.qc-layout-menu \{[^}]+\}/s)?.[0]
    const tiles = structural.match(/\[data-qc-theme\] \.qc-layout-tiles \{[^}]+\}/s)?.[0]
    const selected = structural.match(/\[data-qc-theme\] \.qc-layout-tile\[aria-checked='true'\] \{[^}]+\}/s)?.[0]

    expect(panel).toContain('86vh')
    expect(panel).toContain('747px')
    expect(panel).toContain('max-width: calc(100% - 16px)')
    expect(panel).toContain('overflow: hidden')
    expect(structural).toMatch(/\.qc-layout-menu \.qc-menu-body \{[^}]*overflow: auto/s)
    expect(tiles).not.toContain('flex-wrap')
    expect(structural).toMatch(/\.qc-layout-tile \{[^}]*flex: 0 0 29px/s)
    expect(selected).toContain('background: var(--qc-text-primary)')
    expect(selected).toContain('color: var(--qc-overlay-surface)')
    expect(selected).not.toContain('state-accent')
  })

  it('stands the timeframe flyout as tall as the widget allows, the saved star in the emphasis fill', () => {
    const panel = structural.match(/\[data-qc-theme\] \.qc-menu-panel\.qc-tf-menu \{[^}]+\}/s)?.[0]
    const groups = structural.match(/\[data-qc-theme\] \.qc-tf-menu \.qc-menu-body \{[^}]+\}/s)?.[0]
    const star = structural.match(/\n\[data-qc-theme\] \.qc-tf-side\[aria-pressed='true'\] \{[^}]*color:[^}]+\}/s)?.[0]
    const rule = structural.match(/\[data-qc-theme\] \.qc-tf-menu \.qc-menu-body > \.qc-separator \{[^}]+\}/s)?.[0]

    expect(panel).toContain('max-height: calc(100% - 16px)')
    expect(panel).not.toContain('720px')
    // A saved star keeps its fill under the pointer; the chosen row lifts its star's cell faintly.
    expect(structural).toMatch(/\.qc-tf-side\[aria-pressed='true'\]:hover \{[^}]*color: var\(--qc-control-on\)/s)
    expect(structural).toMatch(/\.qc-tf-row\[data-qc-checked='true'\] \.qc-tf-side:hover \{[^}]*color-mix\(in srgb, var\(--qc-text-inverse\) 10%/s)
    // The custom-timeframe footer stands on the panel's own surface, and its unit list wears no edge.
    expect(structural.match(/\[data-qc-theme\] \.qc-tf-composer \{[^}]+\}/s)?.[0]).not.toContain('background')
    expect(structural.match(/\[data-qc-theme\] \.qc-tf-unit-list \{[^}]+\}/s)?.[0]).not.toContain('outline')
    // The list takes the space the footer leaves; it carries no ceiling of its own.
    expect(groups).not.toContain('max-height')
    expect(groups).toContain('padding: 6px')
    // A rule spans the list with 6px above and below.
    expect(rule).toContain('margin: 6px 0')
    expect(star).toContain('color: var(--qc-control-on)')
    expect(star).not.toContain('state-accent')
  })

  it('inverts a chosen menu row, with no accent dot and no substitute check mark', () => {
    // A row that is itself a switch is not a choice among rows: only its track fills.
    const checked = structural.match(/\[data-qc-theme\] \.qc-menu-row\[aria-checked='true'\]:not\(\[role='switch'\]\) \{[^}]+\}/s)?.[0]
    expect(structural).not.toMatch(/\.qc-menu-row\[aria-checked='true'\] \{/)
    expect(checked).toContain('background: var(--qc-control-on)')
    expect(checked).toContain('color: var(--qc-text-inverse)')
    expect(checked).not.toContain('state-accent')
    expect(structural).not.toMatch(/\.qc-menu-row\[aria-checked='true'\] \.qc-menu-icon::before/)
    expect(structural).toMatch(/\.qc-menu-row\[aria-selected='true'\] \{[^}]*control-on/s)
  })

  it('keeps the saved-layouts menu on the package list rhythm, restating none of it', () => {
    // The panel, rows, marks and rules are the menu primitive's own; this menu adds only what is
    // its own: the shortcut's clearance, the two-line recent row and the switch row's corners.
    expect(structural).not.toMatch(/\.qc-menu-panel\.qc-layouts-menu \{/)
    expect(structural).not.toMatch(/\.qc-layouts-menu \.qc-menu-row \{/)
    expect(structural).not.toMatch(/\.qc-layouts-menu \.qc-separator \{/)
    const hint = structural.match(/\[data-qc-theme\] \.qc-layouts-menu \.qc-menu-hint \{[^}]+\}/s)?.[0]
    expect(hint).toContain('padding-inline-start: 24px')
    expect(hint).toContain('font-size: 12px')
    expect(structural).toMatch(/\.qc-layouts-recents \.qc-menu-row \{[^}]*height: 48px/s)
    expect(structural).toMatch(/\.qc-layouts-menu \.qc-menu-row\[disabled\] \{[^}]*opacity: 0\.5/s)
    expect(structural).toMatch(/\.qc-menu-row\[aria-checked='true'\] \.qc-menu-description \{[^}]*color: inherit/s)
  })

  it('dips a caret under the pointer and turns it for an open menu, keyed on its class', () => {
    expect(structural).toMatch(/\.qc-toolbar-button:not\(\[aria-expanded='true'\]\):hover > \.qc-caret \{[^}]*translate: 0 2px/s)
    expect(structural).toMatch(/\.qc-toolbar-button\[aria-expanded='true'\] > \.qc-caret > svg \{[^}]*rotate: 180deg/s)
    // A state rule keyed on an SVG attribute can miss the hover change that should restyle it, so
    // no hover or open rule reaches a mark through its view box.
    expect(structural).not.toMatch(/(:hover|aria-expanded)[^{}]*svg\[viewBox/i)
  })

  it('makes the layout name the button that saves, at the bar size with Save under it', () => {
    const name = structural.match(/\[data-qc-theme\] \.qc-layouts-name \{[^}]+\}/s)?.[0]
    const save = structural.match(/\[data-qc-theme\] \.qc-layouts-save \{[^}]+\}/s)?.[0]
    expect(name).toContain('font-size: var(--qc-text-fontSizeBase)')
    expect(name).toContain('color: var(--qc-text-primary)')
    expect(save).toContain('color: var(--qc-text-link)')
    expect(save).toContain('font-size: var(--qc-text-fontSizeMicro)')
    // With nothing to save it answers no pointer: no wash under hover or press.
    expect(structural).toMatch(/\.qc-layouts-title\[aria-disabled='true'\]:hover::before,[^{]*\{[^}]*background: none/s)
  })

  it('opens the timezone list upward as a plain flush list with a check column', () => {
    const panel = structural.match(/\[data-qc-theme\] \.qc-menu-panel\.qc-tz-menu \{[^}]+\}/s)?.[0]
    // No ceiling of its own: the menu stands an upward list as tall as the room above its anchor.
    expect(panel).not.toContain('max-height')
    expect(panel).toContain('padding: 6px 0')
    expect(structural).toMatch(/\.qc-tz-menu \.qc-menu-row,[^{]*\{[^}]*height: 32px/s)
    expect(structural).toMatch(/\.qc-tz-menu \.qc-menu-row \.qc-menu-icon \{[^}]*width: 36px/s)
    expect(structural).toMatch(/\.qc-session-menu \.qc-menu-icon \{[^}]*display: none/s)
  })

  it('scopes every rule to the widget root, so a host document keeps its own styling', () => {
    const selectors = selectorsOf(css)
    expect(selectors.length).toBeGreaterThan(20)
    expect(selectors.filter((s) => !s.startsWith(`[${THEME_ROOT_ATTRIBUTE}`))).toEqual([])
  })

  it('scopes every component recipe file on its own, so an unscoped rule is named by file', () => {
    for (const [file, text] of Object.entries(authoredStylesheets())) {
      const selectors = selectorsOf(text)
      expect(selectors.length, file).toBeGreaterThan(0)
      expect(selectors.filter((s) => !s.startsWith(`[${THEME_ROOT_ATTRIBUTE}`)).map((s) => `${file}: ${s}`)).toEqual([])
    }
  })

  it('writes no keyframes or other at-rule the scoping gate could not judge', () => {
    // A keyframe's step selectors (`from`, `to`) would pass the selector sweep unscoped; the chrome
    // animates with transitions instead, which the reduced-motion rule already flattens.
    expect(structural).not.toMatch(/@keyframes/)
  })

  it('carries no global reset and no document-level selector', () => {
    const selectors = selectorsOf(css)
    expect(selectors.filter((s) => /^(\*|html|body|:root)\b/.test(s))).toEqual([])
    // A bare universal selector is a reset; a scoped descendant of the root is not.
    expect(selectors.filter((s) => s === '*')).toEqual([])
  })

  it('fetches nothing at runtime: no import, no remote asset, no font download', () => {
    expect(css).not.toMatch(/@import/)
    expect(css).not.toMatch(/@font-face/)
    expect(css).not.toMatch(/url\(/)
    expect(css).not.toMatch(/https?:/)
  })

  it('answers forced colors and reduced motion', () => {
    expect(css).toMatch(/@media \(forced-colors: active\)/)
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/)
  })

  it('declares one custom property per role in each mode block, and reads only those', () => {
    for (const mode of THEME_MODES) {
      const block = themeBlock(mode, BUILT_IN_THEMES[mode])
      expect(block.startsWith(themeRootSelector(mode))).toBe(true)
      for (const role of THEME_ROLES) expect(block, `${mode} ${role.id}`).toContain(`${cssVarName(role.id)}: `)
    }
    const declared = new Set(THEME_ROLES.map((r) => cssVarName(r.id)))
    const read = [...structural.matchAll(/var\((--qc-[A-Za-z-]+)\)/g)].map((m) => m[1]!)
    expect(read.length).toBeGreaterThan(10)
    expect([...new Set(read)].filter((v) => !declared.has(v))).toEqual([])
  })
})

describe('the cascade layers', () => {
  it('opens with the layer order, and names no host layer', () => {
    const body = css.replace(/\/\*[\s\S]*?\*\//g, '').trimStart()
    expect(body.startsWith(LAYER_ORDER_STATEMENT)).toBe(true)
    expect(LAYER_ORDER_STATEMENT).not.toContain('host')
    expect(LAYER_ORDER_STATEMENT).not.toContain('reset')
  })

  it('puts the built-in palettes in the tokens layer and every recipe in the chart layer', () => {
    const tokens = css.indexOf(`@layer ${STYLE_LAYERS.tokens} {`)
    const chart = css.indexOf(`@layer ${STYLE_LAYERS.chart} {`)
    expect(tokens).toBeGreaterThan(-1)
    expect(chart).toBeGreaterThan(tokens)
    for (const mode of THEME_MODES) {
      const block = css.indexOf(themeRootSelector(mode))
      expect(block).toBeGreaterThan(tokens)
      expect(block).toBeLessThan(chart)
    }
    expect(css.indexOf('.qc-chrome')).toBeGreaterThan(chart)
  })

  it('leaves no rule outside a layer, media rules included', () => {
    expect(unlayeredSelectorsOf(css)).toEqual([])
    // The walker is judged on a sheet that does break the rule, so an empty answer means something.
    expect(unlayeredSelectorsOf('@layer a { .x { color: red } } .y { color: blue } @media (x) { .z { color: green } }')).toEqual(['.y', '.z'])
  })

  it('documents the host ordering with the reset before the product layers and the host layer last', () => {
    const order = HOST_LAYER_ORDER.replace(/^@layer\s*/, '').replace(/;$/, '').split(',').map((s) => s.trim())
    expect(order[0]).toBe('reset')
    expect(order.indexOf(STYLE_LAYERS.tokens)).toBeLessThan(order.indexOf(STYLE_LAYERS.chart))
    expect(order[order.length - 1]).toBe('host')
  })
})

describe('generated-artifact drift', () => {
  it('matches the committed vectors for both built-in palettes', () => {
    expect(vectors.rootAttribute).toBe(THEME_ROOT_ATTRIBUTE)
    for (const mode of THEME_MODES) {
      expect(vectors.modes[mode], `${mode}: rerun pnpm --filter @trdrs/quickcharts build:theme`).toEqual(themeDeclarations(BUILT_IN_THEMES[mode]))
    }
  })

  it('records one vector per role per mode', () => {
    for (const mode of THEME_MODES) expect(vectors.modes[mode].length).toBe(THEME_ROLES.length)
  })
})

describe('two instances in one document', () => {
  it('resolve different variables from the same stylesheet', () => {
    const light = themeDeclarations(BUILT_IN_THEMES.light)
    const dark = themeDeclarations(BUILT_IN_THEMES.dark)
    expect(light.map((d) => d.property)).toEqual(dark.map((d) => d.property))
    const differing = light.filter((d, i) => d.value !== dark[i]!.value)
    expect(differing.length).toBeGreaterThan(20)
    // Both blocks live in one file, selected by the attribute value each root carries.
    expect(css).toContain(themeRootSelector('light'))
    expect(css).toContain(themeRootSelector('dark'))
  })
})

describe('the surfaces that scroll', () => {
  /** Every top-level rule in the authored files, at-rule wrappers unwrapped, as selector and body
   *  pairs. Enough of a reader for these files, which nest one level and never nest a selector. */
  const rules = (): { selector: string; body: string }[] => {
    const out: { selector: string; body: string }[] = []
    for (const text of Object.values(authoredStylesheets())) {
      const stripped = text.replace(/\/\*[\s\S]*?\*\//g, '')
      for (const [, prelude, body] of stripped.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const selectors = prelude.trim()
        if (selectors.startsWith('@')) continue
        for (const selector of selectors.split(',').map((one) => one.trim()).filter(Boolean)) out.push({ selector, body })
      }
    }
    return out
  }

  it('each says for itself whether it shows a bar, so no host and no browser decides', () => {
    const all = rules()
    const scrolls = all.filter((rule) => /overflow(-x|-y)?:[^;]*\b(auto|scroll)\b/.test(rule.body)).map((rule) => rule.selector)
    const painted = new Set(
      all
        .filter((rule) => rule.selector.endsWith('::-webkit-scrollbar') && (/width: 5px/.test(rule.body) || /display: none/.test(rule.body)))
        .map((rule) => rule.selector.replace('::-webkit-scrollbar', '')),
    )
    // A surface is answered when some rule speaks for the class it ends in, whether that rule is
    // the shared one or a narrower override: the layout menu's own body scrolls without a bar, and
    // the timeframe menu's body takes the bar every menu body wears.
    const lastClass = (selector: string): string => selector.split(/\s+/).at(-1) ?? selector
    const spokenFor = new Set([...painted].map(lastClass))
    const answered = (selector: string): boolean => spokenFor.has(lastClass(selector))
    expect(scrolls.length).toBeGreaterThan(10)
    expect(scrolls.filter((selector) => !answered(selector))).toEqual([])
  })

  it('paints the thin bar in the theme ink, never a literal', () => {
    const thumbs = rules().filter((rule) => rule.selector.endsWith('::-webkit-scrollbar-thumb'))
    expect(thumbs.length).toBeGreaterThan(5)
    for (const thumb of thumbs) {
      expect(thumb.body, thumb.selector).toContain(`background-color: var(${cssVarName('chrome.scrollThumb')})`)
      expect(thumb.body, thumb.selector).toContain('border-radius: 3px')
    }
  })
})

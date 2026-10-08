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

  it('reserves its column in both coordinate planes and leaves the legend inside chart content', () => {
    const toolbar = sheets.find(([name]) => name === 'drawings-toolbar.css')![1]
    const width = toolbar.match(/\.qc-drawing-toolbar\s*\{[^}]*?width:\s*(\d+)px/)?.[1]
    const legend = readFileSync(`${recipes}/../../chartLegend.ts`, 'utf8')
    const chrome = readFileSync(`${recipes}/chrome.css`, 'utf8')
    const inset = chrome.match(/\.qc-chrome\[data-qc-drawing-toolbar='true'\]\s*\{[^}]*?inset-inline-start:\s*(\d+)px/)?.[1]
    const projection = toolbar.match(/\.qc-chrome\[data-qc-drawing-toolbar='true'\] \.qc-drawing-toolbar\s*\{[^}]*?inset-inline-start:\s*-(\d+)px/)?.[1]
    expect(width).toBe('52')
    expect(inset).toBe(width)
    expect(projection).toBe(width)
    expect(chrome).toMatch(/\.qc-gestures\[data-qc-drawing-toolbar='true'\],\s*\[data-qc-theme\] \.qc-chrome\[data-qc-drawing-toolbar='true'\]/)
    expect(legend).toContain("root.style.insetInlineStart = '0px'")
    // The legend offsets with a logical inset, so a right-to-left chart keeps the same seam.
    expect(legend).toMatch(/root\.style\.insetInlineStart = /)
    expect(legend).not.toMatch(/root\.style\.left = /)
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

// The selected drawing's bar and the panels it opens, pinned to their geometry and recipes.
describe('the settings bar and its panels', () => {
  const settings = readFileSync(`${recipes}/drawings-settings.css`, 'utf8')
  const fields = readFileSync(`${recipes}/drawings-fields.css`, 'utf8')
  const body = (css: string, selector: RegExp): string => {
    const found = [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^}]*)\}/g)].filter(([, head]) => selector.test(head))
    expect(found.length, String(selector)).toBeGreaterThan(0)
    return found.map(([, , rule]) => rule).join(String.fromCharCode(10))
  }

  it('glides the tab bar and the opacity knob, steps a list button’s edge to its own hover role, and outlines Cancel', () => {
    const bar = body(settings, /\.qc-drawing-tabs\[data-qc-placed='true'\] > \.qc-drawing-tab-bar/)
    expect(bar).toMatch(/transform var\(--qc-motion-durationGlide\) var\(--qc-motion-easingInOut\)/)
    expect(bar).toMatch(/width var\(--qc-motion-durationGlide\) var\(--qc-motion-easingInOut\)/)
    expect(body(fields, /\.qc-drawing-opacity:not\(\[data-qc-dragging='true'\]\) \.qc-drawing-opacity-knob/)).toMatch(/var\(--qc-motion-durationGlide\)/)
    // The hover edge stands below a disabled field, a refused value and the keyboard's ring.
    expect(body(fields, /\.qc-drawing-select:hover:not\(:disabled\):not\(\[aria-invalid='true'\]\):not\(:focus-visible\)/)).toMatch(/border-color:\s*var\(--qc-control-selectEdgeHover\)/)
    const cancel = body(settings, /\.qc-drawing-cancel\s*$/m)
    expect(cancel).toMatch(/color:\s*var\(--qc-control-outline\)/)
    expect(cancel).toMatch(/border-color:\s*var\(--qc-control-outline\)/)
    expect(body(settings, /\.qc-drawing-cancel:hover:not\(\[disabled\]\)/)).toMatch(/border-color:\s*var\(--qc-control-on\)/)
    expect(body(settings, /\.qc-drawing-mark-list \.qc-drawing-list-row\[aria-selected='true'\]/)).toMatch(/color:\s*var\(--qc-control-onInk\)/)
  })

  it('holds a control at 38px with a 2px-inset wash, and a wide control on its own padding', () => {
    expect(body(settings, /\.qc-drawing-bar-button\s*$/m)).toMatch(/width:\s*38px/)
    expect(body(settings, /\.qc-drawing-bar-button::before\s*$/m)).toMatch(/inset:\s*2px/)
    expect(body(settings, /\.qc-drawing-bar-wide\s*$/m)).toMatch(/padding:\s*0 11px 0 10px/)
  })

  it('reads a locked drawing as a held mode and an open menu as a lit control, neither by an accent', () => {
    // Locked: the emphasis fill with the ink cut out of it, the same "on" the rest of the product
    // wears. Open: the neutral wash, because the panel below is what says the menu is open.
    const locked = body(settings, /\.qc-drawing-bar-button\[aria-pressed='true'\]::before/)
    expect(locked).toMatch(/--qc-control-on/)
    expect(body(settings, /\.qc-drawing-bar-button\[aria-pressed='true'\]\s*$/m)).toMatch(/--qc-text-inverse/)
    // Open fills the whole cell, square, the way it does on the chart's own toolbar.
    const opened = body(settings, /\.qc-drawing-bar-button\[aria-expanded='true'\]::before/)
    expect(opened).toMatch(/--qc-state-hover/)
    expect(opened).toMatch(/inset:\s*0/)
    expect(locked).not.toMatch(/accent|selected/)
    // At rest the control reads at full strength; the states answer with a wash, not with ink.
    expect(body(settings, /\.qc-drawing-bar-button\s*$/m)).toMatch(/--qc-text-primary/)
  })

  it('sizes the menus by content, or 240px for the lists and 176px for the stacking moves', () => {
    expect(body(settings, /\.qc-drawing-bar-menu\s*$/m)).toMatch(/width:\s*max-content/)
    expect(body(settings, /\.qc-drawing-bar-menu\[data-width='wide'\]/)).toMatch(/width:\s*240px/)
    expect(body(settings, /\.qc-drawing-bar-menu\[data-width='narrow'\]/)).toMatch(/width:\s*176px/)
    // A mark sits at its own width; an empty cell is the 28px spacer that keeps labels in a column.
    expect(body(settings, /\.qc-drawing-bar-row \.qc-menu-icon\s*$/m)).toMatch(/width:\s*auto/)
    expect(body(settings, /\.qc-drawing-bar-row \.qc-menu-icon:empty/)).toMatch(/width:\s*28px/)
  })

  it('draws the opacity as a 10px track faded over the check, a 12px knob riding it, beside an edged figure', () => {
    // The track is a checked ground fading into the color inside an edge of that same color: the
    // check is what says see-through, on an 8px tile.
    const track = body(fields, /\.qc-drawing-opacity\s*$/m)
    expect(track).toMatch(/height:\s*10px/)
    expect(track).toMatch(/repeating-conic-gradient\(from 270deg, var\(--qcd-check\)/)
    expect(track).toMatch(/8px 8px/)
    expect(body(fields, /\.qc-drawing-opacity-fade\s*$/m)).toMatch(/border:\s*1px solid var\(--qcd-swatch\)/)
    // The knob is a disc drawn from the two poles, so it reads at both ends of the fade.
    const knob = body(fields, /\.qc-drawing-opacity-knob\s*$/m)
    expect(knob).toMatch(/width:\s*12px/)
    expect(knob).toMatch(/background:\s*var\(--qcd-black\)/)
    expect(knob).toMatch(/border:\s*2px solid var\(--qcd-white\)/)
    // The figure is a field a viewer may type over, so it is edged rather than washed: the field's
    // own edge at the popover's compact 26px on a 4px corner, which turns the focus color while the
    // field has the keyboard.
    const figure = body(fields, /\.qc-drawing-opacity-readout,/)
    expect(figure).toMatch(/height:\s*26px/)
    expect(figure).toMatch(/border:\s*1px solid var\(--qc-control-fieldEdge\)/)
    expect(figure).toMatch(/border-radius:\s*4px/)
    expect(body(fields, /\.qc-drawing-opacity-readout\s*$/m)).toMatch(/width:\s*47px/)
    expect(body(fields, /\.qc-drawing-opacity-readout:focus,/)).toMatch(/border-color:\s*var\(--qc-state-focusRing\)/)
  })

  it('holds the hex field to the same compact field box, edged in the invalid color for a hex it refuses', () => {
    const hex = body(fields, /\.qc-drawing-hex\s*$/m)
    expect(hex).toMatch(/height:\s*26px/)
    expect(hex).toMatch(/width:\s*68px/)
    expect(hex).toMatch(/border:\s*1px solid var\(--qc-control-fieldEdge\)/)
    expect(hex).toMatch(/border-radius:\s*4px/)
    expect(body(fields, /\.qc-drawing-hex:focus\s*$/m)).toMatch(/border-color:\s*var\(--qc-state-focusRing\)/)
    expect(body(fields, /\.qc-drawing-hex\[aria-invalid='true'\]/)).toMatch(/border-color:\s*var\(--qc-control-fieldInvalid\)/)
  })

  it('gives a number field its steppers in a 22 by 28 column inside the box, 2px in from the edge', () => {
    const column = body(fields, /\.qc-drawing-steppers\s*$/m)
    expect(column).toMatch(/inset-block:\s*3px/)
    expect(column).toMatch(/inset-inline-end:\s*3px/)
    const stepper = body(fields, /\.qc-drawing-stepper\s*$/m)
    expect(stepper).toMatch(/width:\s*22px/)
    expect(stepper).toMatch(/height:\s*14px/)
    // The text stops short of the column, and the pointer on a stepper steps the field's edge up at
    // no more weight than the field's own pointer state, so focus and a refused value still win.
    expect(body(fields, /\.qc-drawing-number\s*$/m)).toMatch(/padding-inline-end:\s*26px/)
    expect(body(fields, /:where\(\.qc-drawing-number-wrap:hover\) > \.qc-field/)).toMatch(/border-color:\s*var\(--qc-control-fieldEdgeHover\)/)
  })
})

// The drawing toolbar, its flyouts and the floating favorites strip, pinned to their geometry and
// recipes. Values are read out of the recipe rather than computed, because a test document has no
// cascade; the numbers are the pins.
describe('the drawing toolbar and its favorites strip', () => {
  const toolbar = readFileSync(`${recipes}/drawings-toolbar.css`, 'utf8')
  /** Every rule whose selector list carries exactly this widget-scoped selector, joined. The
   *  forced-colors block is left out: it answers a display mode, not the ordinary recipe. */
  const rule = (selector: string): string => {
    const ordinary = toolbar.slice(0, toolbar.indexOf('@media (forced-colors: active)')).replace(/\/\*[\s\S]*?\*\//g, '')
    const found = [...ordinary.matchAll(/([^{}]+)\{([^}]*)\}/g)].filter(([, head]) =>
      head
        .split(',')
        .map((one) => one.trim())
        .includes(`[data-qc-theme] ${selector}`),
    )
    expect(found.length, selector).toBeGreaterThan(0)
    return found.map(([, , body]) => body).join(String.fromCharCode(10))
  }

  it('holds the toolbar at 52px with flush 38px cells, a 34px inset square with a 6px corner and an 11px arrow strip', () => {
    expect(rule('.qc-drawing-toolbar')).toMatch(/width:\s*52px/)
    // The cells stack flush, one every 38px; only a group rule parts them.
    expect(rule('.qc-drawing-toolbar-column')).not.toMatch(/gap:/)
    expect(rule('.qc-drawing-toolbar-end')).not.toMatch(/gap:/)
    expect(rule('.qc-drawing-toolbar-column')).toMatch(/padding:\s*6px 0/)
    expect(rule('.qc-drawing-toolbar-button')).toMatch(/height:\s*38px/)
    expect(rule('.qc-drawing-toolbar-button')).toMatch(/width:\s*100%/)
    const wash = rule(".qc-drawing-toolbar-button::before")
    expect(wash).toMatch(/width:\s*34px/)
    expect(wash).toMatch(/height:\s*34px/)
    expect(wash).toMatch(/border-radius:\s*var\(--qc-chrome-radius\)/)
    expect(rule('.qc-drawing-toolbar-arrow')).toMatch(/width:\s*11px/)
    expect(rule('.qc-drawing-toolbar-arrow')).toMatch(/inset-block:\s*2px/)
  })

  it('draws three separator recipes, so a flyout rule is not the toolbar width', () => {
    // The toolbar's rule spans 36px of the toolbar with 6px above and below.
    expect(rule('.qc-drawing-divider')).toMatch(/width:\s*36px/)
    expect(rule('.qc-drawing-divider')).toMatch(/margin:\s*6px 0/)
    // A tool flyout's section rule and a menu's rule span the content area, 6px above and below.
    expect(rule('.qc-drawing-flyout-rule')).toMatch(/width:\s*100%/)
    expect(rule('.qc-drawing-flyout-rule')).toMatch(/margin-block:\s*6px;/)
    expect(rule('.qc-drawing-menu-rule')).toMatch(/width:\s*100%/)
    expect(rule('.qc-drawing-menu-rule')).toMatch(/margin-block:\s*6px;/)
  })

  it('sizes a tool flyout by its content within 192 and 360, padded 6 all round, with 40px rows and 24px headings', () => {
    const flyout = rule('.qc-drawing-flyout')
    expect(flyout).toMatch(/min-width:\s*192px/)
    expect(flyout).toMatch(/max-width:\s*360px/)
    expect(flyout).toMatch(/padding:\s*6px;/)
    expect(rule('.qc-drawing-flyout-row')).toMatch(/height:\s*40px/)
    expect(rule('.qc-drawing-flyout .qc-dialog-heading')).toMatch(/height:\s*24px/)
    // A menu row of words alone stands 32px; a row that carries a mark, 40px.
    expect(rule('.qc-drawing-menu-row')).toMatch(/height:\s*32px/)
    expect(rule('.qc-drawing-menu-row--marked')).toMatch(/height:\s*40px/)
  })

  it('keeps the armed toolbar tool on the neutral held fill and names an armed favorite by its glyph alone', () => {
    const armed = rule(".qc-drawing-toolbar-button[data-qc-active='true']::before")
    expect(armed).toMatch(/background:\s*var\(--qc-state-pressed\)/)
    expect(armed).not.toContain('--qc-state-accent')
    expect(armed).not.toContain('--qc-state-selected')
    expect(rule(".qc-drawing-toolbar-button[data-qc-active='true']")).toMatch(/color:\s*var\(--qc-text-primary\)/)
    // Under the pointer the held fill steps once more; a held mode inverts instead.
    expect(rule(".qc-drawing-toolbar-button[data-qc-active='true']:hover::before")).toMatch(/background:\s*var\(--qc-state-pressedHover\)/)
    expect(rule(".qc-drawing-toolbar-mode[data-qc-active='true']")).toMatch(/color:\s*var\(--qc-text-inverse\)/)
    expect(rule(".qc-drawing-toolbar-mode[data-qc-active='true']::before")).toMatch(/background:\s*var\(--qc-control-on\)/)
    // An armed favorite wears the accent on its glyph and no fill of its own.
    expect(rule(".qc-drawing-favorite[data-qc-active='true']")).toMatch(/color:\s*var\(--qc-state-accent\)/)
    expect(toolbar.slice(0, toolbar.indexOf('@media (forced-colors: active)'))).not.toContain(".qc-drawing-favorite[data-qc-active='true']::before")
    // Hover paints inside the cell, 2px in with a 2px corner.
    expect(rule('.qc-drawing-favorite:hover::before')).toMatch(/background:\s*var\(--qc-state-hover\)/)
    expect(rule('.qc-drawing-favorite::before')).toMatch(/inset:\s*2px/)
    expect(rule('.qc-drawing-favorite::before')).toMatch(/border-radius:\s*2px/)
  })

  it('keeps the favorites strip one content-sized row with fixed cells and no resize affordance', () => {
    const strip = rule('.qc-drawing-favorites')
    expect(strip).toMatch(/flex-wrap:\s*nowrap/)
    expect(strip).toMatch(/width:\s*max-content/)
    expect(strip).toMatch(/resize:\s*none/)
    expect(rule('.qc-drawing-favorites-tools')).toMatch(/flex-wrap:\s*nowrap/)
    // Nothing in the strip shrinks, so a narrow host cannot squash a cell or fold the row.
    for (const selector of ['.qc-drawing-favorites-tools', '.qc-drawing-favorite', '.qc-drawing-grip']) {
      expect(rule(selector), selector).toMatch(/flex:\s*0 0 auto/)
    }
    const cellRule = rule('.qc-drawing-favorite')
    expect(cellRule).toMatch(/width:\s*38px/)
    expect(cellRule).toMatch(/height:\s*38px/)
    const grip = rule('.qc-drawing-grip')
    expect(grip).toMatch(/width:\s*24px/)
    expect(grip).toMatch(/height:\s*38px/)
    expect(grip).toMatch(/cursor:\s*grab/)
    // No rule anywhere gives the strip a resizer or a second column.
    expect(toolbar).not.toMatch(/\.qc-drawing-favorites[^{]*\{[^}]*grid-template-columns/)
    expect(toolbar).not.toMatch(/qc-drawing-favorites-resize/)
  })
})

// @vitest-environment happy-dom
// The color popover a drawing's settings dialog opens from a color button, as a document paints it
// and as a viewer works it. The composed stylesheet stands over a painted widget root in both
// built-in modes, a trend line's dialog opens in it, and the popover, its palette, the opacity, the
// Thickness and Line style rows, the custom editor and the line-end list are read back from their
// computed style and compared with the geometry and the roles that name them. What this document's
// engine does not compute (a pseudo-element, a layered background) is read from the rule itself.
//
// This document's engine reads neither cascade layers nor `:focus-within`, so the sheet is read as
// one unlayered sheet in the same order, with each `:focus-within` written as the
// `:is(:focus, :has(:focus))` it means, and every read touches the element first, because the engine
// keeps a computed style until the element itself changes.
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { composeStylesheet, LAYER_ORDER_STATEMENT } from '../../../src/theme/css-contract'
import { BUILT_IN_THEMES } from '../../../src/theme/palettes'
import { THEME_MODES, THEME_ROLES, type ThemeMode } from '../../../src/theme/schema'
import { paintThemeRoot } from '../../../src/widget/theme'
import { createChartI18n } from '../../../src/i18n'
import { openSettingsDialog } from '../../../src/ui/drawings/settingsDialog'
import { createPresets } from '../../../src/drawings/layer/presets'
import { drawingTools } from '../../../src/drawings/index'
import type { ColorMemory } from '../../../src/ui/controls/color'
import type { IDrawing } from '../../../src/internal/drawings/index'
import { focusables } from '../../../src/ui/controls/dom'
import { ownIcons } from '../../ownIcons'
import { authoredStylesheet } from '../../theme/stylesheetSource'

const t = createChartI18n().t

function readable(css: string): string {
  let text = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(LAYER_ORDER_STATEMENT, '')
  for (let open = /@layer [\w.-]+\s*\{/.exec(text); open; open = /@layer [\w.-]+\s*\{/.exec(text)) {
    const start = open.index + open[0].length
    let depth = 1
    let end = start
    while (depth > 0) {
      if (text[end] === '{') depth++
      else if (text[end] === '}') depth--
      end++
    }
    text = text.slice(0, open.index) + text.slice(start, end - 1) + text.slice(end)
  }
  return text.replace(/:focus-within/g, ':is(:focus, :has(:focus))')
}

const sheet = authoredStylesheet().replace(/\r/g, '')

/** The declarations of the rule for `selector`: the rule written for it alone where there is one,
 *  or else the first rule whose selector list names it. */
function rule(selector: string): string {
  const text = sheet.replace(/\/\*[\s\S]*?\*\//g, '')
  const rules = [...text.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selectors: m[1]!.split(',').map((s) => s.trim()), body: m[2]! }))
  const found = rules.find((r) => r.selectors.length === 1 && r.selectors[0] === selector) ?? rules.find((r) => r.selectors.includes(selector))
  if (!found) throw new Error(`no rule for ${selector}`)
  return found.body
}

/** The declarations of the rule written for exactly these selectors together. */
function ruleFor(...selectors: string[]): string {
  const text = sheet.replace(/\/\*[\s\S]*?\*\//g, '')
  for (const m of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const list = m[1]!.split(',').map((s) => s.trim())
    if (list.length === selectors.length && selectors.every((s) => list.includes(s))) return m[2]!
  }
  throw new Error(`no rule for ${selectors.join(', ')}`)
}

beforeAll(() => {
  const blocks = THEME_MODES.map((mode) => ({ mode, theme: BUILT_IN_THEMES[mode] }))
  const durationRoles = THEME_ROLES.filter((role) => role.kind === 'duration').map((role) => role.id)
  const style = document.createElement('style')
  style.textContent = readable(composeStylesheet({ blocks, durationRoles, structural: authoredStylesheet() }))
  document.head.appendChild(style)
})

const closers: (() => void)[] = []
afterEach(() => {
  for (const close of closers.splice(0)) close()
  document.body.replaceChildren()
})

let touches = 0
function painted(element: Element): CSSStyleDeclaration {
  element.setAttribute('data-qc-read', String(++touches))
  return getComputedStyle(element)
}

/** A trend line's settings dialog in a painted root: the dialog box, the backdrop its panels stand
 *  on, the drawing, and its Line button. */
function trendLine(mode: ThemeMode = 'dark', colors?: ColorMemory): { box: HTMLElement; layer: HTMLElement; drawing: IDrawing; close(): void; line(): HTMLButtonElement } {
  const root = document.body.appendChild(document.createElement('div'))
  paintThemeRoot(root, mode, BUILT_IN_THEMES[mode])
  const drawing = drawingTools.create('trend_line', 'l1', [{ time: 1000 as never, price: 100 }, { time: 1060 as never, price: 110 }])!
  drawing.updateStyle({ lineColor: '#2962ff', lineWidth: 2, lineStyle: 'solid' })
  const dialog = openSettingsDialog({ chrome: root, t, icons: ownIcons(), drawing, presets: createPresets(null), idBase: 'c1-drawing-settings', run: () => true, available: () => true, ...(colors ? { colors } : {}) })
  closers.push(() => dialog.close())
  const box = root.querySelector<HTMLElement>('[data-role="drawing-settings"]')!
  return { box, layer: box.parentElement!, drawing, close: () => dialog.close(), line: () => box.querySelector<HTMLButtonElement>('.qc-drawing-swatch-button[aria-label="Line"]')! }
}

/** The color popover open in the document, wherever the dialog stood it. */
const popoverIn = (_box: HTMLElement): HTMLElement | null => document.querySelector<HTMLElement>('.qc-drawing-popover--color')
const swatchOf = (popover: HTMLElement, hex: string): HTMLButtonElement => popover.querySelector<HTMLButtonElement>(`.qc-drawing-swatch[data-qc-color="${hex}"]`)!
const segment = (popover: HTMLElement, label: string): HTMLButtonElement => popover.querySelector<HTMLButtonElement>(`.qc-drawing-segment[aria-label="${label}"]`)!

/** A memory the test holds, newest first, as the widget's preference record keeps it. */
function memory(seed: string[] = []): ColorMemory & { colors: string[] } {
  const colors = [...seed]
  return {
    colors,
    list: () => colors,
    add(hex) {
      const at = colors.indexOf(hex)
      if (at >= 0) colors.splice(at, 1)
      colors.unshift(hex)
    },
  }
}

for (const mode of THEME_MODES) {
  const theme = BUILT_IN_THEMES[mode]

  describe(`${mode}: the color popover as it is painted`, () => {
    it('stands on the overlay ground on a 6px corner, its column 6px clear above and below, as wide as what it holds', () => {
      const { box, layer, line } = trendLine(mode)
      line().click()
      const panel = popoverIn(box)!
      // It stands on the backdrop the dialog's panels stand on, outside the dialog's box, so it hangs
      // past the dialog's edge.
      expect(panel.parentElement).toBe(layer)
      expect(box.contains(panel)).toBe(false)
      const surface = painted(panel)
      expect(surface.backgroundColor).toBe(theme['overlay.surface'])
      expect(surface.borderTopLeftRadius).toBe(theme['chrome.radiusLarge'])
      expect(surface.boxShadow).toBe(theme['overlay.shadow'])
      expect(surface.width).toBe('max-content')
      const column = painted(panel.querySelector('.qc-drawing-color-popover')!)
      expect(column.paddingTop).toBe('6px')
      expect(column.paddingBottom).toBe('6px')
      expect(column.paddingLeft).toBe('0px')
      // The button holding it open rings itself in the focus color, 2px over its own edge.
      const button = painted(line())
      expect(button.borderTopColor).toBe(theme['state.focusRing'])
      expect(button.boxShadow).toBe(`inset 0 0 0 1px ${theme['state.focusRing']}`)
      // The popover names itself after the button, as the dialog it is.
      const dialog = panel.querySelector('.qc-drawing-color-popover')!
      expect([dialog.getAttribute('role'), dialog.getAttribute('aria-label')]).toEqual(['dialog', 'Line'])
    })

    it('lays the palette 224px wide inside 6px by 12px, a ten-wide grid of 17px cells with 3px gutters', () => {
      const { box, line } = trendLine(mode)
      line().click()
      const panel = popoverIn(box)!
      const palette = painted(panel.querySelector('.qc-drawing-palette')!)
      expect(palette.boxSizing).toBe('content-box')
      expect(palette.width).toBe('224px')
      expect(palette.paddingTop).toBe('6px')
      expect(palette.paddingLeft).toBe('12px')
      expect(painted(panel.querySelector('.qc-drawing-swatches')!).display).toBe('block')
      const blocks = [...panel.querySelectorAll('.qc-drawing-swatch-block')]
      expect(blocks).toHaveLength(3)
      const block = painted(blocks[0]!)
      expect(block.marginLeft).toBe('-3px')
      expect(block.marginRight).toBe('-3px')
      expect(block.marginBottom).toBe('6px')
      // A grey row and the ten hues, then six ramps, every row ten cells.
      expect(blocks[0]!.querySelectorAll('.qc-drawing-swatch-row')).toHaveLength(2)
      expect(blocks[1]!.querySelectorAll('.qc-drawing-swatch-row')).toHaveLength(6)
      for (const row of panel.querySelectorAll('.qc-drawing-swatch-block:not(.qc-drawing-swatch-block--mixed) .qc-drawing-swatch-row')) expect(row.children).toHaveLength(10)
      const cell = painted(swatchOf(panel, '#f23645'))
      expect(cell.width).toBe('17px')
      expect(cell.height).toBe('17px')
      expect(cell.marginTop).toBe('3px')
      expect(cell.marginLeft).toBe('3px')
      expect(cell.borderTopLeftRadius).toBe('2px')
      expect(cell.backgroundColor).toBe('#f23645')
      // A rule 12px clear of the blocks either side, in the separator's grey.
      const separator = painted(panel.querySelector('.qc-drawing-separator')!)
      expect(separator.height).toBe('1px')
      expect(separator.marginTop).toBe('12px')
      expect(separator.marginBottom).toBe('12px')
      expect(separator.backgroundColor).toBe(theme['overlay.separator'])
    })

    it('rings a cell 2px outside it: the field edge under the pointer, the primary ink around the chosen one, the focus color under the keyboard', () => {
      const ring = rule('[data-qc-theme] .qc-drawing-swatch::after')
      expect(ring).toMatch(/inset:\s*-4px/)
      expect(ring).toMatch(/border:\s*2px solid transparent/)
      expect(ring).toMatch(/border-radius:\s*6px/)
      expect(ring).toMatch(/transition:\s*border-color var\(--qc-motion-durationSlow\) var\(--qc-motion-easingStandard\)/)
      expect(rule('[data-qc-theme] .qc-drawing-swatch:hover::after')).toMatch(/border-color:\s*var\(--qc-control-fieldEdge\)/)
      expect(rule("[data-qc-theme] .qc-drawing-swatch[data-qc-active='true']::after")).toMatch(/border-color:\s*var\(--qc-text-primary\)/)
      expect(rule('[data-qc-theme] .qc-drawing-swatch:focus-visible::after')).toMatch(/border-color:\s*var\(--qc-state-focusRing\)/)
      // The palest cell keeps no edge of its own on the dark panel, and takes the panel's on the light.
      expect(rule("[data-qc-theme='light'] .qc-drawing-swatch[data-qc-pale='true']")).toMatch(/inset 0 0 0 1px var\(--qc-chrome-border\)/)
      const { box, line } = trendLine(mode)
      line().click()
      const panel = popoverIn(box)!
      expect(swatchOf(panel, '#2962ff').dataset.qcActive).toBe('true')
      expect(swatchOf(panel, '#2962ff').getAttribute('aria-pressed')).toBe('true')
      if (mode === 'dark') expect(painted(swatchOf(panel, '#ffffff')).boxShadow).not.toContain('inset')
    })

    it('ends the grid with the plus: two 13px hairlines in the primary ink on a 17px cell that washes under the pointer', () => {
      const { box, line } = trendLine(mode)
      line().click()
      const plus = popoverIn(box)!.querySelector<HTMLButtonElement>('.qc-drawing-swatch-plus')!
      expect(plus.getAttribute('title')).toBe('Add custom color')
      const cell = painted(plus)
      expect(cell.width).toBe('17px')
      expect(cell.height).toBe('17px')
      expect(cell.marginTop).toBe('3px')
      expect(cell.borderTopLeftRadius).toBe('2px')
      expect(rule('[data-qc-theme] .qc-drawing-swatch-plus:hover')).toMatch(/background:\s*var\(--qc-state-hover\)/)
      const vertical = rule('[data-qc-theme] .qc-drawing-swatch-plus::before')
      expect(vertical).toMatch(/width:\s*1px/)
      expect(vertical).toMatch(/height:\s*13px/)
      expect(rule('[data-qc-theme] .qc-drawing-swatch-plus::after')).toMatch(/width:\s*13px/)
      expect(ruleFor('[data-qc-theme] .qc-drawing-swatch-plus::before', '[data-qc-theme] .qc-drawing-swatch-plus::after')).toMatch(/background:\s*var\(--qc-text-primary\)/)
      expect(rule('[data-qc-theme] .qc-drawing-swatch-plus:focus-visible')).toMatch(/border:\s*2px solid var\(--qc-state-focusRing\)/)
    })

    it('draws the opacity under its 12px muted title: a 10px track beside a 47px percent field', () => {
      const { box, line } = trendLine(mode)
      line().click()
      const panel = popoverIn(box)!
      const title = painted(panel.querySelector('.qc-drawing-palette-opacity .qc-drawing-section-title')!)
      expect(title.fontSize).toBe('12px')
      expect(title.lineHeight).toBe('14px')
      expect(title.color).toBe(theme['text.muted'])
      expect(title.marginTop).toBe('12px')
      expect(title.marginBottom).toBe('4px')
      const track = painted(panel.querySelector('.qc-drawing-opacity')!)
      expect(track.height).toBe('10px')
      expect(track.borderTopLeftRadius).toBe('5px')
      expect(track.flexGrow).toBe('1')
      expect(rule('[data-qc-theme] .qc-drawing-opacity')).toMatch(/repeating-conic-gradient\(from 270deg, var\(--qcd-check\) 0% 25%, transparent 0% 50%\) 1px 50% \/ 8px 8px, var\(--qcd-ground\)/)
      const fade = painted(panel.querySelector('.qc-drawing-opacity-fade')!)
      expect(fade.borderTopWidth).toBe('1px')
      expect(fade.borderTopLeftRadius).toBe('4px')
      expect(fade.borderTopColor).toBe('#2962ff')
      expect(painted(panel.querySelector('.qc-drawing-opacity-travel')!).width).toBe('calc(100% - 12px)')
      const knob = painted(panel.querySelector('.qc-drawing-opacity-knob')!)
      expect(knob.width).toBe('12px')
      expect(knob.height).toBe('12px')
      expect(knob.marginTop).toBe('-1px')
      expect(knob.borderTopWidth).toBe('2px')
      expect(knob.borderTopLeftRadius).toBe('50%')
      expect(knob.getPropertyValue('inset-inline-start')).toBe('100%')
      expect(rule("[data-qc-theme] .qc-drawing-opacity:not([data-qc-dragging='true']) .qc-drawing-opacity-knob")).toMatch(/transition:\s*inset-inline-start var\(--qc-motion-durationGlide\) var\(--qc-motion-easingStandard\)/)
      const field = painted(panel.querySelector('.qc-drawing-opacity-readout')!)
      expect(field.width).toBe('47px')
      expect(field.height).toBe('26px')
      expect(field.getPropertyValue('margin-inline-start')).toBe('8px')
      expect(field.getPropertyValue('padding-inline-start')).toBe('5px')
      expect(field.getPropertyValue('padding-inline-end')).toBe('14px')
      expect(field.borderTopColor).toBe(theme['control.fieldEdge'])
      expect(field.borderTopLeftRadius).toBe('4px')
      expect(field.color).toBe(theme['text.primary'])
      expect(field.textAlign).toBe('end')
      expect(ruleFor('[data-qc-theme] .qc-drawing-opacity-readout:focus', '[data-qc-theme] .qc-drawing-hex:focus')).toMatch(/border-color:\s*var\(--qc-state-focusRing\)/)
      expect(rule("[data-qc-theme] .qc-drawing-hex[aria-invalid='true']")).toMatch(/border-color:\s*var\(--qc-control-fieldInvalid\)/)
      const unit = painted(panel.querySelector('.qc-drawing-opacity-unit')!)
      expect(unit.getPropertyValue('inset-inline-start')).toBe('40px')
      expect(unit.top).toBe('5px')
    })

    it('carries the Thickness and Line style rows: joined 32px segments, the chosen one filled and its mark cut from the fill', () => {
      const { box, line } = trendLine(mode)
      line().click()
      const panel = popoverIn(box)!
      const [thickness, style] = [...panel.querySelectorAll<HTMLElement>('.qc-drawing-stroke-section')]
      expect(painted(thickness!).paddingLeft).toBe('12px')
      const thicknessTitle = painted(thickness!.querySelector('.qc-drawing-section-title')!)
      expect(thicknessTitle.marginTop).toBe('6px')
      expect(thicknessTitle.color).toBe(theme['text.muted'])
      expect(painted(style!).marginTop).toBe('12px')
      expect(painted(style!.querySelector('.qc-drawing-section-title')!).marginTop).toBe('0px')
      const segments = [...thickness!.querySelectorAll<HTMLElement>('.qc-drawing-segment')]
      expect(segments.map((s) => s.getAttribute('aria-label'))).toEqual(['Thickness 1px', 'Thickness 2px', 'Thickness 3px', 'Thickness 4px'])
      const resting = painted(segments[0]!)
      expect(resting.height).toBe('32px')
      expect(resting.paddingLeft).toBe('12px')
      expect(resting.borderTopColor).toBe(theme['control.fieldEdge'])
      expect(resting.color).toBe(theme['control.on'])
      expect(resting.getPropertyValue('border-start-start-radius')).toBe('3px')
      expect(resting.flexBasis).toBe('0px')
      expect(painted(segments[1]!).getPropertyValue('margin-inline-start')).toBe('-1px')
      expect(painted(segments[3]!).getPropertyValue('border-end-end-radius')).toBe('3px')
      const chosen = painted(segments[1]!)
      expect(segments[1]!.getAttribute('aria-checked')).toBe('true')
      expect(chosen.backgroundColor).toBe(theme['control.on'])
      expect(chosen.borderTopColor).toBe(theme['control.on'])
      expect(chosen.color).toBe(theme['control.onInk'])
      expect(segments.map((s) => s.querySelector<HTMLElement>('.qc-drawing-thickness-mark')!.style.height)).toEqual(['1px', '2px', '3px', '4px'])
      expect(rule('[data-qc-theme] .qc-drawing-thickness-mark')).toMatch(/background:\s*currentColor/)
      expect(rule('[data-qc-theme] .qc-drawing-segment:hover')).toMatch(/background:\s*var\(--qc-state-hover\)/)
      const styles = [...style!.querySelectorAll<HTMLElement>('.qc-drawing-segment')]
      expect(styles.map((s) => s.getAttribute('aria-label'))).toEqual(['Line style Line', 'Line style Dashed line', 'Line style Dotted line'])
      expect(painted(styles[0]!).paddingLeft).toBe('22px')
      const cell = painted(styles[0]!.querySelector('.qc-drawing-style-mark')!)
      expect(cell.width).toBe('30px')
      expect(cell.height).toBe('24px')
      expect(cell.gap).toBe('3px')
      const seg = (s: HTMLElement): CSSStyleDeclaration => painted(s.querySelector('.qc-drawing-style-seg')!)
      expect([seg(styles[0]!).width, seg(styles[0]!).height]).toEqual(['30px', '1px'])
      expect(styles[1]!.querySelectorAll('.qc-drawing-style-seg')).toHaveLength(4)
      expect([seg(styles[1]!).width, seg(styles[1]!).height]).toEqual(['5px', '1px'])
      expect(styles[2]!.querySelectorAll('.qc-drawing-style-seg')).toHaveLength(6)
      expect([seg(styles[2]!).width, seg(styles[2]!).height]).toEqual(['2px', '2px'])
      const ring = rule('[data-qc-theme] .qc-drawing-segment:focus-visible::after')
      expect(ring).toMatch(/inset:\s*-4px/)
      expect(ring).toMatch(/border:\s*2px solid var\(--qc-state-focusRing\)/)
    })

    it('turns over to the custom editor: a 26px row of the well, the hex and Add over a 184px area beside a 17px hue strip', () => {
      const { box, line } = trendLine(mode)
      line().click()
      const panel = popoverIn(box)!
      panel.querySelector<HTMLButtonElement>('.qc-drawing-swatch-plus')!.click()
      // The editor stands alone: the grid, the opacity and the stroke rows stand down.
      expect(panel.querySelector<HTMLElement>('.qc-drawing-swatches')!.hidden).toBe(true)
      expect(panel.querySelector<HTMLElement>('.qc-drawing-palette-opacity')!.hidden).toBe(true)
      for (const section of panel.querySelectorAll<HTMLElement>('.qc-drawing-stroke-section')) expect(section.hidden).toBe(true)
      const row = painted(panel.querySelector('.qc-drawing-custom-row')!)
      expect(row.height).toBe('26px')
      expect(row.marginBottom).toBe('12px')
      const well = painted(panel.querySelector('.qc-drawing-custom-swatch')!)
      expect([well.width, well.height, well.borderTopLeftRadius, well.backgroundColor]).toEqual(['26px', '26px', '4px', '#2962ff'])
      const hex = panel.querySelector<HTMLInputElement>('.qc-drawing-hex')!
      expect(document.activeElement).toBe(hex)
      expect(hex.value).toBe('2962ff')
      const field = painted(hex)
      expect([field.width, field.height, field.borderTopLeftRadius]).toEqual(['68px', '26px', '4px'])
      expect(field.getPropertyValue('padding-inline-start')).toBe('12px')
      expect(field.getPropertyValue('margin-inline-start')).toBe('8px')
      expect(field.borderTopColor).toBe(theme['state.focusRing'])
      const mark = painted(panel.querySelector('.qc-drawing-hex-mark')!)
      expect([mark.width, mark.textAlign, mark.top]).toEqual(['21px', 'end', '5px'])
      const add = painted(panel.querySelector('.qc-drawing-add')!)
      expect([add.height, add.borderTopLeftRadius, add.fontSize, add.lineHeight]).toEqual(['28px', '8px', '14px', '18px'])
      expect(add.backgroundColor).toBe(theme['control.on'])
      expect(add.color).toBe(theme['text.inverse'])
      expect(add.getPropertyValue('margin-inline-start')).toBe('auto')
      expect(painted(panel.querySelector('.qc-drawing-custom-tracks')!).gap).toBe('7px')
      const areaElement = panel.querySelector<HTMLElement>('.qc-drawing-sv')!
      const area = painted(areaElement)
      expect([area.height, area.borderTopLeftRadius, area.overflow]).toEqual(['184px', '2px', 'hidden'])
      // The area is the pure hue under a fade to white across it and a fade to black down it.
      expect(areaElement.style.getPropertyValue('--qcd-hue')).toBe('#0044ff')
      expect(rule('[data-qc-theme] .qc-drawing-sv')).toContain('background: linear-gradient(to top, var(--qcd-black), transparent), linear-gradient(to right, var(--qcd-white), transparent), var(--qcd-hue)')
      const areaKnob = painted(panel.querySelector('.qc-drawing-sv-dot')!)
      expect([areaKnob.width, areaKnob.height, areaKnob.marginTop, areaKnob.borderTopWidth]).toEqual(['14px', '14px', '-6px', '2px'])
      expect(areaKnob.getPropertyValue('margin-inline-start')).toBe('-6px')
      const strip = painted(panel.querySelector('.qc-drawing-hue')!)
      expect([strip.height, strip.flexBasis, strip.borderTopLeftRadius]).toEqual(['184px', '17px', '2px'])
      expect(rule('[data-qc-theme] .qc-drawing-hue')).toMatch(/var\(--qcd-hue-60\) 17%,\s*var\(--qcd-hue-120\) 33%,\s*var\(--qcd-hue-180\) 50%,\s*var\(--qcd-hue-240\) 67%,\s*var\(--qcd-hue-300\) 83%/)
      expect(rule('[data-qc-theme] .qc-drawing-hue-travel')).toMatch(/inset:\s*3px 0/)
      const stripKnob = painted(panel.querySelector('.qc-drawing-hue-dot')!)
      expect([stripKnob.height, stripKnob.marginTop, stripKnob.borderTopWidth, stripKnob.borderTopLeftRadius]).toEqual(['9px', '-4px', '2px', '2px'])
      expect(rule('[data-qc-theme] .qc-drawing-hue-dot')).toMatch(/inset-inline:\s*-2px/)
    })

    it('opens the line-end list as wide as its rows, its 32px rows wearing the 28px marks, the chosen one inverted', () => {
      const { box, layer } = trendLine(mode)
      box.querySelector<HTMLButtonElement>('.qc-drawing-line-end')!.click()
      const list = layer.querySelector<HTMLElement>('.qc-drawing-line-ends')!
      const listbox = painted(list)
      expect(listbox.width).toBe('max-content')
      expect(listbox.minWidth).toBe('0')
      expect(listbox.paddingTop).toBe('6px')
      expect(painted(list.closest('.qc-drawing-popover')!).borderTopLeftRadius).toBe('10px')
      const [normal, arrow] = [...list.querySelectorAll<HTMLElement>('[role="option"]')]
      expect([normal!.textContent, arrow!.textContent]).toEqual(['Normal', 'Arrow'])
      const chosen = painted(normal!)
      expect(chosen.height).toBe('32px')
      expect(chosen.backgroundColor).toBe(theme['control.on'])
      expect(chosen.color).toBe(theme['control.onInk'])
      expect(chosen.paddingLeft).toBe('4px')
      expect(chosen.gap).toBe('6px')
      expect(painted(arrow!).color).toBe(theme['text.primary'])
      expect(normal!.querySelector('svg')!.getAttribute('viewBox')).toBe('0 0 28 28')
      expect(rule("[data-qc-theme] .qc-drawing-line-ends .qc-drawing-list-row:not([aria-selected='true']):hover")).toMatch(/color:\s*var\(--qc-state-hoverInk\)/)
      const ring = rule('[data-qc-theme] .qc-drawing-line-ends .qc-drawing-list-row:focus-visible::after')
      expect(ring).toMatch(/inset:\s*2px/)
      expect(ring).toMatch(/border-radius:\s*9px/)
    })
  })
}

describe('the color popover in the dialog', () => {
  it('applies every choice to the drawing at once and stays up, answering to the button the rebuilt page puts in its place', () => {
    const { box, drawing, line } = trendLine()
    const opener = line()
    opener.click()
    const panel = popoverIn(box)!
    expect(opener.getAttribute('aria-expanded')).toBe('true')
    swatchOf(panel, '#f23645').click()
    expect(drawing.style.lineColor).toBe('#f23645')
    // The page rebuilt under the popover: the same popover answers to the new Line button.
    expect(opener.isConnected).toBe(false)
    expect(popoverIn(box)).toBe(panel)
    expect(line().getAttribute('aria-expanded')).toBe('true')
    expect(swatchOf(panel, '#f23645').dataset.qcActive).toBe('true')
    expect(swatchOf(panel, '#2962ff').dataset.qcActive).toBeUndefined()
    segment(panel, 'Thickness 4px').click()
    expect(drawing.style.lineWidth).toBe(4)
    expect(segment(panel, 'Thickness 4px').getAttribute('aria-checked')).toBe('true')
    expect(segment(panel, 'Thickness 2px').getAttribute('aria-checked')).toBe('false')
    segment(panel, 'Line style Dotted line').click()
    expect(drawing.style.lineStyle).toBe('dotted')
    // The opacity applies to the color just picked, not to the one the dialog opened with.
    const figure = panel.querySelector<HTMLInputElement>('.qc-drawing-opacity-readout')!
    figure.focus()
    figure.value = '40'
    figure.dispatchEvent(new Event('input'))
    expect(drawing.style.lineColor).toBe('rgba(242, 54, 69, 0.4)')
    // A color picked now keeps the opacity set.
    swatchOf(panel, '#089981').click()
    expect(drawing.style.lineColor).toBe('rgba(8, 153, 129, 0.4)')
    // The face of the button in place shows what the drawing holds.
    expect(line().querySelector<HTMLElement>('.qc-drawing-well-fill')!.style.getPropertyValue('--qcd-swatch')).toBe('#089981')
    expect(line().querySelector<HTMLElement>('.qc-drawing-well-fill')!.style.opacity).toBe('0.4')
    expect(line().querySelectorAll('.qc-drawing-stroke-seg').length).toBeGreaterThan(1)
  })

  it('puts back everything from before the dialog opened on Cancel', () => {
    const { box, drawing, line } = trendLine()
    line().click()
    const panel = popoverIn(box)!
    swatchOf(panel, '#ff9800').click()
    segment(panel, 'Thickness 3px').click()
    segment(panel, 'Line style Dashed line').click()
    box.querySelector<HTMLButtonElement>('.qc-drawing-cancel')!.click()
    expect(drawing.style.lineColor).toBe('#2962ff')
    expect(drawing.style.lineWidth).toBe(2)
    expect(drawing.style.lineStyle).toBe('solid')
  })

  it('closes on Escape or on its button, giving the keyboard back to the button in place', () => {
    const { box, line } = trendLine()
    line().click()
    swatchOf(popoverIn(box)!, '#4caf50').click()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(popoverIn(box)).toBeNull()
    expect(document.activeElement).toBe(line())
    expect(line().getAttribute('aria-expanded')).toBe('false')
    // The rebuilt button closes what its predecessor opened.
    line().click()
    swatchOf(popoverIn(box)!, '#ffeb3b').click()
    line().click()
    expect(popoverIn(box)).toBeNull()
    line().click()
    expect(popoverIn(box)).not.toBeNull()
  })

  it('keeps Tab inside itself, wrapping at either end, where the dialog around it would take it away', () => {
    const { box, line } = trendLine()
    line().click()
    const panel = popoverIn(box)!
    const stops = focusables(panel)
    // The grid, the opacity track and its figure, and one stop for each row.
    expect(stops).toEqual([
      swatchOf(panel, '#2962ff'),
      panel.querySelector('.qc-drawing-opacity'),
      panel.querySelector('.qc-drawing-opacity-readout'),
      segment(panel, 'Thickness 2px'),
      segment(panel, 'Line style Line'),
    ])
    const tab = (shiftKey = false): void => void document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true }))
    expect(document.activeElement).toBe(stops[0])
    tab(true)
    expect(document.activeElement).toBe(stops[4])
    tab()
    expect(document.activeElement).toBe(stops[0])
    tab()
    tab()
    expect(document.activeElement).toBe(stops[2])
    // Turned over to the editor, Tab goes round the editor's own stops.
    panel.querySelector<HTMLButtonElement>('.qc-drawing-swatch-plus')!.click()
    const editor = focusables(panel)
    expect(editor[0]).toBe(panel.querySelector('.qc-drawing-hex'))
    tab(true)
    expect(document.activeElement).toBe(editor[editor.length - 1])
  })

  it('lands the keyboard on the chosen color; the arrows move over the grid and the segments, and only a press picks', () => {
    const { box, drawing, line } = trendLine()
    line().click()
    const panel = popoverIn(box)!
    const chosen = swatchOf(panel, '#2962ff')
    expect(document.activeElement).toBe(chosen)
    const cells = [...panel.querySelectorAll<HTMLElement>('.qc-drawing-swatch, .qc-drawing-swatch-plus')]
    expect(cells.filter((cell) => cell.tabIndex === 0)).toEqual([chosen])
    const key = (key: string): void => void document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
    key('ArrowRight')
    expect(document.activeElement).toBe(swatchOf(panel, '#673ab7'))
    key('ArrowDown')
    expect(document.activeElement).toBe(swatchOf(panel, '#d1c4e9'))
    key('ArrowLeft')
    key('ArrowUp')
    expect(document.activeElement).toBe(swatchOf(panel, '#2962ff'))
    key('ArrowUp')
    expect(document.activeElement).toBe(swatchOf(panel, '#4a4a4a'))
    key('End')
    expect(document.activeElement).toBe(panel.querySelector('.qc-drawing-swatch-plus'))
    key('Home')
    expect(document.activeElement).toBe(swatchOf(panel, '#ffffff'))
    // Moving picks nothing; the press does.
    expect(drawing.style.lineColor).toBe('#2962ff')
    ;(document.activeElement as HTMLElement).click()
    expect(drawing.style.lineColor).toBe('#ffffff')
    // The segments: one stop, the arrows move along them without choosing.
    const two = segment(panel, 'Thickness 2px')
    const segments = [...panel.querySelectorAll<HTMLElement>('.qc-drawing-segments')[0]!.children] as HTMLElement[]
    expect(segments.filter((s) => s.tabIndex === 0)).toEqual([two])
    two.focus()
    key('ArrowRight')
    expect(document.activeElement).toBe(segment(panel, 'Thickness 3px'))
    key('ArrowLeft')
    key('ArrowLeft')
    expect(document.activeElement).toBe(segment(panel, 'Thickness 1px'))
    key('ArrowLeft')
    expect(document.activeElement).toBe(segment(panel, 'Thickness 4px'))
    expect(drawing.style.lineWidth).toBe(2)
  })

  it('adds a custom color to the viewer\'s own colors and chooses it, and offers it again in the next popover', () => {
    const colors = memory(['#123456'])
    const { box, drawing, line } = trendLine('dark', colors)
    line().click()
    let panel = popoverIn(box)!
    const mixed = panel.querySelector<HTMLElement>('.qc-drawing-swatch-block--mixed')!
    expect([...mixed.querySelectorAll<HTMLElement>('.qc-drawing-swatch')].map((c) => c.dataset.qcColor)).toEqual(['#123456'])
    expect(mixed.lastElementChild!.lastElementChild!.classList.contains('qc-drawing-swatch-plus')).toBe(true)
    panel.querySelector<HTMLButtonElement>('.qc-drawing-swatch-plus')!.click()
    const hex = panel.querySelector<HTMLInputElement>('.qc-drawing-hex')!
    hex.value = 'f0a'
    hex.dispatchEvent(new Event('input'))
    // Three digits name a color, which the area and the strip take as it is typed.
    expect(panel.querySelector<HTMLElement>('.qc-drawing-custom-swatch')!.style.getPropertyValue('--qcd-swatch')).toBe('#ff00aa')
    expect(drawing.style.lineColor).toBe('#2962ff')
    panel.querySelector<HTMLButtonElement>('.qc-drawing-add')!.click()
    expect(colors.colors).toEqual(['#ff00aa', '#123456'])
    expect(drawing.style.lineColor).toBe('#ff00aa')
    panel = popoverIn(box)!
    expect(panel.querySelector('.qc-drawing-custom')).toBeNull()
    expect(panel.querySelector<HTMLElement>('.qc-drawing-swatches')!.hidden).toBe(false)
    for (const section of panel.querySelectorAll<HTMLElement>('.qc-drawing-stroke-section')) expect(section.hidden).toBe(false)
    const added = panel.querySelector<HTMLElement>('.qc-drawing-swatch-block--mixed [data-qc-color="#ff00aa"]')!
    expect(added.dataset.qcActive).toBe('true')
    expect(document.activeElement).toBe(added)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    line().click()
    const again = popoverIn(box)!.querySelector<HTMLElement>('.qc-drawing-swatch-block--mixed')!
    expect([...again.querySelectorAll<HTMLElement>('.qc-drawing-swatch')].map((c) => c.dataset.qcColor)).toEqual(['#ff00aa', '#123456'])
  })

  it('shows a fresh chart no mixed colors, only the plus, and closes the whole popover on Escape from the editor', () => {
    const { box, drawing, line } = trendLine('dark', memory())
    line().click()
    const panel = popoverIn(box)!
    const mixed = panel.querySelector<HTMLElement>('.qc-drawing-swatch-block--mixed')!
    expect(mixed.querySelectorAll('.qc-drawing-swatch')).toHaveLength(0)
    expect(mixed.querySelectorAll('.qc-drawing-swatch-plus')).toHaveLength(1)
    panel.querySelector<HTMLButtonElement>('.qc-drawing-swatch-plus')!.click()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(popoverIn(box)).toBeNull()
    expect(drawing.style.lineColor).toBe('#2962ff')
    expect(document.activeElement).toBe(line())
  })
})

describe('where the popover stands', () => {
  const rect = (left: number, top: number, width: number, height: number): DOMRect => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect

  /** Give the elements the boxes a laid-out document would: the backdrop over the whole viewport,
   *  the dialog on it, the button, and the popover's own size, then let the popover place itself
   *  again. */
  function layout(dialog: { box: HTMLElement; layer: HTMLElement }, button: HTMLElement, at: { left: number; top: number }, view: { width: number; height: number }): HTMLElement {
    dialog.layer.getBoundingClientRect = () => rect(0, 0, view.width, view.height)
    dialog.box.getBoundingClientRect = () => rect(398, 339, 380, 597)
    button.getBoundingClientRect = () => rect(at.left, at.top, 75, 34)
    const panel = popoverIn(dialog.box)!
    Object.defineProperty(panel, 'offsetWidth', { configurable: true, value: 250 })
    Object.defineProperty(panel, 'offsetHeight', { configurable: true, value: 482 })
    window.dispatchEvent(new Event('resize'))
    return panel
  }

  it('hangs directly under its button, flush with its start, past the bottom of the dialog it opened from', () => {
    const dialog = trendLine()
    dialog.line().click()
    const panel = layout(dialog, dialog.line(), { left: 522.75, top: 463 }, { width: 1249, height: 1277 })
    expect(panel.style.left).toBe('523px')
    expect(panel.style.top).toBe('497px')
    // 497 + 482 stands past the dialog's bottom edge at 339 + 597.
    expect(497 + 482).toBeGreaterThan(339 + 597)
  })

  it('turns over its button where the viewport has no room under it, and keeps inside the viewport', () => {
    const dialog = trendLine()
    dialog.line().click()
    expect(layout(dialog, dialog.line(), { left: 522.75, top: 600 }, { width: 1249, height: 900 }).style.top).toBe(`${600 - 482}px`)
    expect(layout(dialog, dialog.line(), { left: 1100, top: 300 }, { width: 1249, height: 1277 }).style.left).toBe(`${1249 - 250}px`)
  })

  it('stands against the button a rebuilt page put in its place', () => {
    const dialog = trendLine()
    dialog.line().click()
    const panel = layout(dialog, dialog.line(), { left: 522.75, top: 463 }, { width: 1249, height: 1277 })
    swatchOf(panel, '#f23645').click()
    dialog.line().getBoundingClientRect = () => rect(560, 470, 75, 34)
    window.dispatchEvent(new Event('resize'))
    expect([panel.style.left, panel.style.top]).toEqual(['560px', '504px'])
  })
})

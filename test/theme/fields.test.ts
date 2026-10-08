// @vitest-environment happy-dom
// The field box as a document paints it. The composed stylesheet stands over a widget root painted in
// each built-in mode, the surfaces that build fields mount into it, and each field's edge, corner,
// height and focus ring are read back from its computed style and compared with the roles that name
// them, in the palette the root wears. A recipe that paints a field from anything but its role, or a
// rule that outweighs a field's own state, fails here.
//
// Two things about this document's engine shape the reading. It reads neither cascade layers nor
// `:focus-within`, so the sheet is read as one unlayered sheet in the same order, with each
// `:focus-within` written as the `:is(:focus, :has(:focus))` it means, at the same weight. And it
// keeps an element's computed style until the element itself changes, which a focus change does not,
// so every read touches the element first.
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { composeStylesheet, LAYER_ORDER_STATEMENT } from '../../src/theme/css-contract'
import { BUILT_IN_THEMES, DARK_THEME } from '../../src/theme/palettes'
import { THEME_MODES, THEME_ROLES, type SemanticTheme, type ThemeMode } from '../../src/theme/schema'
import { paintThemeRoot } from '../../src/widget/theme'
import { createChartI18n } from '../../src/i18n'
import { openNameDialog } from '../../src/ui/chrome/prompt'
import { openSettingsDialog } from '../../src/ui/drawings/settingsDialog'
import { createPresets } from '../../src/drawings/layer/presets'
import { drawingTools } from '../../src/drawings/index'
import { openInputsEditor } from '../../src/inputsEditor'
import { ownIcons } from '../ownIcons'
import { authoredStylesheet } from './stylesheetSource'

const t = createChartI18n().t

/** The composed sheet as this engine reads it: comments and the layer order dropped, every layer
 *  block opened in place, and `:focus-within` spelled out. */
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

beforeAll(() => {
  const blocks = THEME_MODES.map((mode) => ({ mode, theme: BUILT_IN_THEMES[mode] }))
  const durationRoles = THEME_ROLES.filter((role) => role.kind === 'duration').map((role) => role.id)
  const sheet = document.createElement('style')
  sheet.textContent = readable(composeStylesheet({ blocks, durationRoles, structural: authoredStylesheet() }))
  document.head.appendChild(sheet)
})

const closers: (() => void)[] = []
afterEach(() => {
  for (const close of closers.splice(0)) close()
  document.body.replaceChildren()
})

/** A widget root painted in a mode, as the widget paints its own. */
function rootIn(mode: ThemeMode, theme: SemanticTheme = BUILT_IN_THEMES[mode]): HTMLElement {
  const root = document.body.appendChild(document.createElement('div'))
  paintThemeRoot(root, mode, theme)
  return root
}

let touches = 0
/** The computed style an element wears now. */
function painted(element: Element): CSSStyleDeclaration {
  element.setAttribute('data-qc-read', String(++touches))
  return getComputedStyle(element)
}

/** Nothing holds the keyboard. */
function blur(): void {
  ;(document.activeElement as HTMLElement | null)?.blur?.()
}

/** The ring a focused field wears: its edge and the pixel inside it, in one color. */
const ring = (color: string): string => `inset 0 0 0 1px ${color}`

function nameBoxIn(root: HTMLElement): { box: HTMLElement; input: HTMLInputElement } {
  const dialog = openNameDialog({ host: root, t, icons: ownIcons(), title: 'Save', label: 'Name', verb: 'Save', commit: () => true })
  closers.push(() => dialog.close({ animate: false }))
  return { box: dialog.element.querySelector<HTMLElement>('.qc-name-box')!, input: dialog.element.querySelector<HTMLInputElement>('.qc-name-input')! }
}

/** The drawing settings dialog for a Fibonacci retracement, whose levels carry a number field and a
 *  color well each and whose labels are set by list buttons. `available` false is a page whose
 *  commands are refused. */
function fibSettingsIn(root: HTMLElement, available = true): HTMLElement {
  const drawing = drawingTools.create('fib_retracement', 'f1', [{ time: 1000 as never, price: 100 }, { time: 1060 as never, price: 110 }])!
  const dialog = openSettingsDialog({ chrome: root, t, icons: ownIcons(), drawing, presets: createPresets(null), idBase: 'c1-drawing-settings', run: () => true, available: () => available })
  closers.push(() => dialog.close())
  return root.querySelector<HTMLElement>('[data-role="drawing-settings"]')!
}

/** A field of a drawing settings page that takes typing: the value of a retracement's first level. */
function typedFieldIn(root: HTMLElement, available = true): HTMLInputElement {
  return fibSettingsIn(root, available).querySelector<HTMLInputElement>('.qc-drawing-number')!
}

/** A list button that ends in the chevron: one whose face is words, not a mark. */
const WORDS_SELECT = '.qc-drawing-select:not(.qc-drawing-select--mark)'

for (const mode of THEME_MODES) {
  const theme = BUILT_IN_THEMES[mode]
  const edge = theme['control.fieldEdge']
  const focus = theme['state.focusRing']

  describe(`${mode}: the field box`, () => {
    it('stands the name box on its edge, and rings it over the edge while the caret is in it', () => {
      const root = rootIn(mode)
      const { box, input } = nameBoxIn(root)
      blur()
      const rest = painted(box)
      expect(rest.borderTopColor).toBe(edge)
      expect(rest.borderTopWidth).toBe('1px')
      expect(rest.borderTopLeftRadius).toBe('8px')
      expect(rest.height).toBe('34px')
      expect(rest.backgroundColor).toBe('transparent')
      expect(rest.boxShadow).not.toContain(focus)
      input.focus()
      const focused = painted(box)
      expect(focused.borderTopColor).toBe(focus)
      expect(focused.boxShadow).toBe(ring(focus))
      // The box is the ring; the input inside it draws no outline of its own beside it.
      expect(painted(input).outlineStyle).toBe('none')
    })

    it('stands a drawing number field and select on their edge, and rings each with the keyboard', () => {
      const root = rootIn(mode)
      const dialog = fibSettingsIn(root)
      const fields = ['.qc-drawing-number', WORDS_SELECT].map((selector) => dialog.querySelector<HTMLElement>(selector)!)
      for (const field of fields) {
        blur()
        const rest = painted(field)
        expect(rest.borderTopColor, field.className).toBe(edge)
        expect(rest.borderTopLeftRadius, field.className).toBe('8px')
        expect(rest.height, field.className).toBe('34px')
        expect(rest.backgroundColor, field.className).toBe('transparent')
        field.focus()
        const focused = painted(field)
        expect(focused.borderTopColor, field.className).toBe(focus)
        expect(focused.boxShadow, field.className).toBe(ring(focus))
        expect(focused.outlineStyle, field.className).toBe('none')
      }
    })

    it('turns a refused value the invalid color, at rest and ringed', () => {
      const root = rootIn(mode)
      const field = typedFieldIn(root)
      field.setAttribute('aria-invalid', 'true')
      blur()
      expect(painted(field).borderTopColor).toBe(theme['control.fieldInvalid'])
      field.focus()
      const focused = painted(field)
      expect(focused.borderTopColor).toBe(theme['control.fieldInvalid'])
      expect(focused.boxShadow).toBe(ring(theme['control.fieldInvalid']))
    })

    it('stands a field that cannot be used on the read-only fill, its edge at rest and its words in the disabled ink', () => {
      const root = rootIn(mode)
      const field = typedFieldIn(root, false)
      expect(field.disabled).toBe(true)
      const rest = painted(field)
      expect(rest.backgroundColor).toBe(theme['control.fieldFill'])
      expect(rest.borderTopColor).toBe(edge)
      expect(rest.color).toBe(theme['text.disabled'])
    })

    it('ends a list button with the 18px chevron in the caret ink, in its 20 by 28 slot 2px in from the edge', () => {
      const root = rootIn(mode)
      const field = fibSettingsIn(root).querySelector<HTMLElement>(WORDS_SELECT)!
      const slot = field.querySelector<HTMLElement>(':scope > .qc-select-chevron')!
      const style = painted(slot)
      expect(style.color).toBe(theme['chrome.caret'])
      expect(style.width).toBe('20px')
      expect(style.height).toBe('28px')
      expect(painted(field).paddingRight).toBe('2px')
      expect(field.lastElementChild).toBe(slot)
      expect(slot.querySelector('svg')!.getAttribute('height')).toBe('18')
    })

    it('gives the inputs popover the same 34px boxes, its select ended by the chevron', () => {
      const root = rootIn(mode)
      openInputsEditor(root, { x: 0, y: 0, w: 10, h: 10 }, { length: { kind: 'int', default: 14, min: 1, max: 500 }, source: { kind: 'enum', default: 0, options: ['Close', 'Open'] } }, {}, () => undefined)
      const number = root.querySelector<HTMLInputElement>('.qc-inputs-field')!
      const select = root.querySelector<HTMLSelectElement>('.qc-inputs-select')!
      blur()
      for (const field of [number, select]) {
        const rest = painted(field)
        expect(rest.height, field.className).toBe('34px')
        expect(rest.borderTopColor, field.className).toBe(edge)
      }
      expect(select.nextElementSibling!.classList.contains('qc-select-chevron')).toBe(true)
      number.focus()
      expect(painted(number).boxShadow).toBe(ring(focus))
    })
  })
}

describe('a host palette', () => {
  it('paints every field state from the role that names it, whatever value the role holds', () => {
    // Values no other role holds, so a recipe that read a neighbor sharing a built-in value, such as
    // a grip or a disabled ink, would show here.
    const custom: SemanticTheme = { ...DARK_THEME, 'control.fieldEdge': '#123456', 'control.fieldInvalid': '#a1b2c3', 'control.fieldFill': '#0d0e0f', 'state.focusRing': '#654321' }
    const root = rootIn('dark', custom)
    const { box, input } = nameBoxIn(root)
    blur()
    expect(painted(box).borderTopColor).toBe('#123456')
    input.focus()
    expect(painted(box).boxShadow).toBe(ring('#654321'))
    const field = typedFieldIn(root)
    blur()
    expect(painted(field).borderTopColor).toBe('#123456')
    field.focus()
    expect(painted(field).borderTopColor).toBe('#654321')
    field.setAttribute('aria-invalid', 'true')
    expect(painted(field).boxShadow).toBe(ring('#a1b2c3'))
    const refused = typedFieldIn(rootIn('dark', custom), false)
    expect(painted(refused).backgroundColor).toBe('#0d0e0f')
  })
})

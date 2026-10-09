// @vitest-environment happy-dom
// A leveled tool's Style page as a document paints it, in both built-in modes: the composed
// stylesheet stands over a painted widget root, a fib retracement's dialog opens in it, and the level
// grid, the mark lists, the one color and the bands' opacity track are read back from their computed
// style and compared with the geometry and the roles that name them.
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

let touches = 0
function painted(element: Element): CSSStyleDeclaration {
  element.setAttribute('data-qc-read', String(++touches))
  return getComputedStyle(element)
}

function fibPageIn(mode: ThemeMode): HTMLElement {
  const root = document.body.appendChild(document.createElement('div'))
  paintThemeRoot(root, mode, BUILT_IN_THEMES[mode])
  const drawing = drawingTools.create('fib_retracement', 'f1', [{ time: 1000 as never, price: 100 }, { time: 1060 as never, price: 110 }])!
  const dialog = openSettingsDialog({ chrome: root, t, icons: ownIcons(), drawing, presets: createPresets(null), idBase: 'c1-drawing-settings', run: () => true, available: () => true })
  closers.push(() => dialog.close())
  return root.querySelector<HTMLElement>('[data-role="drawing-settings"] [role="tabpanel"]')!
}

for (const mode of THEME_MODES) {
  const theme = BUILT_IN_THEMES[mode]

  describe(`${mode}: a fib's Style page`, () => {
    it('stands its levels two to a 34px line, 8px apart and 8px under the row above, the second level 48px after the first', () => {
      const page = fibPageIn(mode)
      const [first, second] = [...page.querySelectorAll<HTMLElement>('.qc-drawing-level-row')]
      const line = painted(first!)
      expect(line.minHeight).toBe('34px')
      expect(line.marginBottom).toBe('8px')
      expect(line.marginTop).toBe('8px')
      expect(painted(second!).marginTop).not.toBe('8px')
      expect(painted(first!.children[3]!).marginInlineStart).toBe('40px')
      expect(painted(first!).gap).toBe('8px')
      expect(painted(first!.querySelector('.qc-drawing-number-wrap')!).width).toBe('100px')
    })

    it('stands a level switched off on the read-only fill, its well dimmed', () => {
      const page = fibPageIn(mode)
      const hidden = page.querySelector<HTMLElement>('[aria-label="Level 12 color"]')!
      expect(painted(hidden).backgroundColor).toBe(theme['control.fieldFill'])
      expect(painted(hidden.querySelector('.qc-drawing-well')!).opacity).toBe('0.5')
      const shown = page.querySelector<HTMLElement>('[aria-label="Level 1 color"]')!
      expect(painted(shown.querySelector('.qc-drawing-well')!).opacity).not.toBe('0.5')
    })

    it('faces the thickness list with a 50px bar in a 76px field and the style list with its mark in a 34px field, neither with a chevron', () => {
      const page = fibPageIn(mode)
      const thickness = page.querySelector<HTMLElement>('.qc-drawing-select--mark[data-mark="thickness"]')!
      const style = page.querySelector<HTMLElement>('.qc-drawing-select--mark[data-mark="style"]')!
      expect(painted(thickness).width).toBe('76px')
      expect(painted(style).width).toBe('34px')
      expect(painted(thickness.querySelector('.qc-drawing-thickness-bar')!).width).toBe('50px')
      expect(thickness.querySelector('.qc-select-chevron')).toBeNull()
      expect(style.querySelector('.qc-select-chevron')).toBeNull()
    })

    it('draws the bands opacity as a 148px track 10px tall, edged in the drawings line color', () => {
      const page = fibPageIn(mode)
      const track = painted(page.querySelector('.qc-drawing-band-opacity')!)
      expect(track.width).toBe('148px')
      expect(track.height).toBe('10px')
      expect(track.borderTopColor).toBe(theme['drawing.line'])
      expect(track.borderTopLeftRadius).toBe('5px')
    })

    it('splits the one color well corner to corner while the levels differ', () => {
      const page = fibPageIn(mode)
      const fill = page.querySelector<HTMLElement>('[aria-label="Use one color"] .qc-drawing-well-fill')!
      expect(painted(fill).backgroundImage || painted(fill).background).toContain('linear-gradient')
    })
  })
}

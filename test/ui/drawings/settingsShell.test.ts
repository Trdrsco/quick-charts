// @vitest-environment happy-dom
// The settings dialog's frame as a document paints it, in both built-in modes: the composed
// stylesheet stands over a painted widget root, a trend line's dialog opens in it, and the header,
// the page strip, the page grid, the footer and the lists it opens are read back from their computed
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
import { openImagePicker } from '../../../src/ui/drawings/imagePicker'
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

function trendLineDialogIn(mode: ThemeMode): HTMLElement {
  const root = document.body.appendChild(document.createElement('div'))
  paintThemeRoot(root, mode, BUILT_IN_THEMES[mode])
  const drawing = drawingTools.create('trend_line', 'l1', [{ time: 1000 as never, price: 100 }, { time: 1060 as never, price: 110 }])!
  const dialog = openSettingsDialog({ chrome: root, t, icons: ownIcons(), drawing, presets: createPresets(null), idBase: 'c1-drawing-settings', run: () => true, available: () => true })
  closers.push(() => dialog.close())
  return root.querySelector<HTMLElement>('[data-role="drawing-settings"]')!
}

for (const mode of THEME_MODES) {
  const theme = BUILT_IN_THEMES[mode]

  describe(`${mode}: the settings dialog's frame`, () => {
    it('stands on the dialog ground at least 380px wide, under a 68px header carrying the name at 20 on 28', () => {
      const dialog = trendLineDialogIn(mode)
      const card = painted(dialog)
      expect(card.backgroundColor).toBe(theme['overlay.surface'])
      expect(card.minWidth).toBe('min(380px, calc(100% - 16px))')
      const header = painted(dialog.querySelector('.qc-drawing-dialog-header')!)
      expect(header.height).toBe('68px')
      expect(header.paddingLeft).toBe('20px')
      expect(header.paddingRight).toBe('20px')
      const title = painted(dialog.querySelector('.qc-drawing-dialog-title')!)
      expect(title.fontSize).toBe('20px')
      expect(title.lineHeight).toBe('28px')
      expect(title.fontWeight).toBe('600')
      const pencil = painted(dialog.querySelector('.qc-drawing-rename')!)
      expect(pencil.width).toBe('34px')
      expect(pencil.getPropertyValue('margin-inline-start')).toBe('5px')
      const close = painted(dialog.querySelector('.qc-dialog-close')!)
      expect(close.width).toBe('34px')
      expect(close.getPropertyValue('margin-inline-end')).toBe('-3px')
    })

    it('strips its pages at 16 on 24 over a 4px track, the shown one carried by a bar in the emphasis fill', () => {
      const dialog = trendLineDialogIn(mode)
      const tab = painted(dialog.querySelector('[role="tab"]')!)
      expect(tab.fontSize).toBe('16px')
      expect(tab.lineHeight).toBe('24px')
      expect(tab.fontWeight).toBe('600')
      expect(tab.paddingBottom).toBe('8px')
      expect(tab.color).toBe(theme['text.primary'])
      const second = painted(dialog.querySelectorAll('[role="tab"]')[1]!)
      expect(second.marginLeft).toBe('12px')
      const bar = painted(dialog.querySelector('.qc-drawing-tab-bar')!)
      expect(bar.height).toBe('4px')
      expect(bar.backgroundColor).toBe(theme['control.on'])
      const slot = dialog.querySelector('.qc-drawing-tabs-slot')!
      expect(painted(slot).paddingLeft).toBe('20px')
      const track = painted(slot.querySelector('.qc-drawing-tabs-track')!)
      expect(track.height).toBe('4px')
      expect(track.backgroundColor).toBe(theme['overlay.separator'])
    })

    it('lays the page out in two columns inside 16px by 20px, each row 50px around its controls', () => {
      const dialog = trendLineDialogIn(mode)
      const page = painted(dialog.querySelector('.qc-drawing-page')!)
      expect(page.display).toBe('grid')
      expect(page.gridTemplateColumns).toBe('auto 1fr')
      expect(page.paddingTop).toBe('16px')
      expect(page.paddingLeft).toBe('20px')
      expect(painted(dialog.querySelector('.qc-drawing-page > .qc-drawing-row')!).display).toBe('contents')
      const label = painted(dialog.querySelector('.qc-drawing-row-label')!)
      expect(label.minHeight).toBe('50px')
      expect(label.paddingRight).toBe('20px')
      expect(label.color).toBe(theme['text.primary'])
      const controls = painted(dialog.querySelector('.qc-drawing-row-controls')!)
      expect(controls.gap).toBe('8px')
      expect(controls.paddingTop).toBe('8px')
    })

    it('ends with the footer: the Template list button, then Cancel outlined in the outline role and Ok wearing the emphasis fill', () => {
      const dialog = trendLineDialogIn(mode)
      const footer = painted(dialog.querySelector('.qc-drawing-dialog-footer')!)
      expect(footer.paddingTop).toBe('16px')
      expect(footer.paddingLeft).toBe('20px')
      expect(footer.borderTopColor).toBe(theme['overlay.separator'])
      const template = painted(dialog.querySelector('.qc-drawing-template-button')!)
      expect(template.width).toBe('100px')
      expect(template.height).toBe('34px')
      expect(template.borderTopColor).toBe(theme['control.fieldEdge'])
      const [cancel, ok] = [...dialog.querySelectorAll<HTMLElement>('.qc-drawing-footer-button')]
      const outline = painted(cancel!)
      expect(outline.borderTopColor).toBe(theme['control.outline'])
      expect(outline.color).toBe(theme['control.outline'])
      expect(outline.fontSize).toBe('16px')
      expect(outline.height).toBe('34px')
      expect(outline.borderTopLeftRadius).toBe('8px')
      const filled = painted(ok!)
      expect(filled.backgroundColor).toBe(theme['control.on'])
      expect(filled.color).toBe(theme['text.inverse'])
      expect(filled.getPropertyValue('margin-inline-start')).toBe('12px')
    })

    it("ends the image picker with the settings dialog's footer: Cancel and Ok at the end in the same footer buttons", () => {
      const settings = trendLineDialogIn(mode)
      const root = settings.closest<HTMLElement>('[data-qc-theme]')!
      const close = openImagePicker({
        container: root,
        t,
        icons: ownIcons(),
        assets: { intakeImage: async () => ({ ok: false, error: 'unreadable' }), glyphSource: () => null },
        canPlace: () => true,
        onConfirm: () => undefined,
      })
      closers.push(close)
      const picker = root.querySelector<HTMLElement>('[data-role="drawing-image-picker"]')!
      const footer = painted(picker.querySelector('.qc-drawing-dialog-footer')!)
      expect(footer.justifyContent).toBe('flex-end')
      expect(footer.paddingTop).toBe('16px')
      expect(footer.paddingRight).toBe('20px')
      expect(footer.borderTopColor).toBe(theme['overlay.separator'])
      const read = (dialog: HTMLElement): Record<string, string>[] =>
        [...dialog.querySelectorAll<HTMLElement>('.qc-drawing-dialog-footer .qc-drawing-footer-button')].map((b) => {
          const s = painted(b)
          return { label: b.getAttribute('aria-label') ?? '', height: s.height, radius: s.borderTopLeftRadius, size: s.fontSize, line: s.lineHeight, padding: `${s.paddingTop} ${s.paddingRight}`, gap: s.getPropertyValue('margin-inline-start') }
        })
      // The same two buttons, in the same order, with the same metrics as the settings dialog's.
      const ours = read(picker)
      expect(ours.map((b) => b.label)).toEqual(['Cancel', 'Ok'])
      expect(ours).toEqual(read(settings))
      expect(ours[0]!.height).toBe('34px')
      expect(ours[1]!.gap).toBe('12px')
      // Cancel is outlined in the outline role, as the settings dialog's is.
      const cancel = painted(picker.querySelector('.qc-drawing-cancel')!)
      expect(cancel.borderTopColor).toBe(theme['control.outline'])
      expect(cancel.color).toBe(theme['control.outline'])
      // Nothing stands before them: the footer lays them at its end.
      expect(picker.querySelector('.qc-drawing-dialog-footer')!.firstElementChild!.getAttribute('aria-label')).toBe('Cancel')
    })

    it('stands over an undimmed chart, and opens and leaves at once', () => {
      const dialog = trendLineDialogIn(mode)
      const scrim = dialog.parentElement!
      expect(scrim.classList.contains('qc-dialog-scrim')).toBe(true)
      expect(scrim.dataset.qcVeil).toBe('none')
      expect(painted(scrim).backgroundColor).toBe('transparent')
      // No motion state: the box is shown as it opens, and nothing fades or grows.
      expect(scrim.dataset.state).toBeUndefined()
      expect(painted(dialog).opacity).not.toBe('0')
    })

    it('hangs the Template menu on the backdrop under its button, sized to its words, the button ringed while it is open', () => {
      const dialog = trendLineDialogIn(mode)
      const button = dialog.querySelector<HTMLButtonElement>('.qc-drawing-template-button')!
      button.click()
      expect(button.getAttribute('aria-expanded')).toBe('true')
      const ringed = painted(button)
      expect(ringed.borderTopColor).toBe(theme['state.focusRing'])
      expect(ringed.boxShadow).toBe(`inset 0 0 0 1px ${theme['state.focusRing']}`)
      const panel = dialog.parentElement!.querySelector<HTMLElement>('.qc-drawing-popover--list')!
      expect(dialog.contains(panel)).toBe(false)
      const look = painted(panel)
      expect(look.borderTopLeftRadius).toBe('10px')
      expect(look.backgroundColor).toBe(theme['overlay.surface'])
      const menu = painted(panel.querySelector('[role="menu"]')!)
      expect(menu.minWidth).toBe('0')
      expect(menu.width).toBe('max-content')
      expect(menu.paddingTop).toBe('6px')
      expect(menu.paddingLeft).toBe('6px')
      const row = painted(panel.querySelector('[role="menuitem"]')!)
      expect(row.height).toBe('32px')
      expect(row.paddingLeft).toBe('8px')
      expect(row.lineHeight).toBe('18px')
      expect(row.borderTopLeftRadius).toBe('6px')
      expect(row.color).toBe(theme['text.primary'])
    })

    it('opens its lists on a 10px corner under the control, the chosen row inverted', () => {
      const dialog = trendLineDialogIn(mode)
      const select = [...dialog.querySelectorAll<HTMLButtonElement>('.qc-drawing-select')].find((b) => b.getAttribute('role') === 'combobox')!
      select.click()
      const panel = dialog.parentElement!.querySelector<HTMLElement>('.qc-drawing-popover--list')!
      expect(painted(panel).borderTopLeftRadius).toBe('10px')
      const chosen = painted(panel.querySelector('[aria-selected="true"]')!)
      expect(chosen.backgroundColor).toBe(theme['control.on'])
      expect(chosen.color).toBe(theme['text.inverse'])
      expect(chosen.height).toBe('32px')
    })
  })
}

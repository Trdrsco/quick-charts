// The chart settings dialog's measures, read off its recipes: the card, the rail and its tabs, the
// page grid, the rows, the sub-rows, the hint, the tip, the sliders and the footer, each where the
// dialog's own sheet or the drawing dialogs' sheets it stands on state it.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const testDir = decodeURIComponent(new URL('.', import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1')
const recipes = testDir.replace(/\/test\/ui\/settings\/?$/, '/src/styles/components')
const sheet = (name: string): string => readFileSync(`${recipes}/${name}`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

const settings = sheet('settings.css')
const fields = sheet('drawings-fields.css')
const drawing = sheet('drawings-settings.css')

/** The declarations every rule whose selector list holds `selector` gives it, in sheet order. Rules
 *  inside a media query are left out: the measures are the wide layout's. */
function rule(css: string, selector: string): Record<string, string> {
  const wide = css.replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '')
  const out: Record<string, string> = {}
  let found = false
  for (const match of wide.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = match[1]!.split(',').map((s) => s.trim())
    if (!selectors.includes(selector)) continue
    found = true
    for (const declaration of match[2]!.split(';')) {
      const at = declaration.indexOf(':')
      if (at > 0) out[declaration.slice(0, at).trim()] = declaration.slice(at + 1).trim()
    }
  }
  if (!found) throw new Error(`no rule for ${selector}`)
  return out
}

describe('the chart settings measures', () => {
  it('stands the card at most 750 wide and as tall as the viewport less 40, on a 6px corner', () => {
    const card = rule(settings, '[data-qc-theme] .qc-dialog.qc-chart-settings-dialog')
    expect(card['max-width']).toBe('min(750px, calc(100% - 16px))')
    expect(card['min-width']).toBe('min(610px, calc(100% - 16px))')
    expect(card['max-height']).toBe('calc(100% - 40px)')
    expect(card['border-radius']).toBe('6px')
    expect(card['background']).toBe('var(--qc-overlay-surface)')
  })

  it('reads the header and the footer off the drawing dialogs: a 68px header, a 1px rule and 16 by 20 around the footer', () => {
    expect(rule(drawing, '[data-qc-theme] .qc-drawing-dialog .qc-drawing-dialog-header').height).toBe('68px')
    expect(rule(drawing, '[data-qc-theme] .qc-drawing-dialog-title')['font-size']).toBe('20px')
    expect(rule(drawing, '[data-qc-theme] .qc-drawing-dialog-title')['font-weight']).toBe('600')
    const footer = rule(drawing, '[data-qc-theme] .qc-drawing-dialog-footer')
    expect(footer.padding).toBe('16px 20px')
    expect(footer['border-top']).toBe('1px solid var(--qc-overlay-separator)')
    expect(rule(drawing, '[data-qc-theme] .qc-drawing-template-button').width).toBe('100px')
    expect(rule(drawing, '[data-qc-theme] .qc-drawing-footer-button + .qc-drawing-footer-button')['margin-inline-start']).toBe('12px')
  })

  it('lays the rail out 226 wide with a 206px list of 40px tabs, the icon 28px and 4px before the name', () => {
    const rail = rule(settings, '[data-qc-theme] .qc-chart-settings-nav')
    expect(rail.width).toBe('226px')
    expect(rail.padding).toBe('8px 0 8px 20px')
    expect(rail['overflow-y']).toBe('auto')
    const tab = rule(settings, '[data-qc-theme] .qc-chart-settings-nav-item')
    expect([tab.width, tab.height, tab.padding, tab.gap, tab['border-radius'], tab['font-size'], tab['line-height']]).toEqual(['206px', '40px', '0 16px 0 12px', '4px', '8px', '14px', '18px'])
    expect(rule(settings, '[data-qc-theme] .qc-chart-settings-nav-icon').width).toBe('28px')
    const selected = rule(settings, "[data-qc-theme] .qc-chart-settings-nav-item[aria-selected='true']")
    expect(selected['font-weight']).toBe('600')
    expect(selected.background).toBe('var(--qc-control-neutral)')
    expect(rule(settings, '[data-qc-theme] .qc-chart-settings-nav-item:hover').background).toBe('var(--qc-state-hover)')
  })

  it('makes the page the two-column grid with the label column as wide as the widest label plus 20', () => {
    expect(rule(drawing, '[data-qc-theme] .qc-drawing-page')['grid-template-columns']).toBe('auto minmax(0, 1fr)')
    expect(rule(fields, '[data-qc-theme] .qc-drawing-page .qc-drawing-row-label').padding).toBe('8px 20px 8px 0')
    expect(rule(settings, '[data-qc-theme] .qc-chart-settings-panel').padding).toBe('16px 20px 32px')
  })

  it('stands rows 50px around 34px controls, headings 32px, and sections 16px apart', () => {
    expect(rule(fields, '[data-qc-theme] .qc-drawing-page .qc-drawing-row-label')['min-height']).toBe('50px')
    expect(rule(fields, '[data-qc-theme] .qc-drawing-page .qc-drawing-row-controls')['min-height']).toBe('50px')
    expect(rule(settings, '[data-qc-theme] .qc-settings-check')['min-height']).toBe('50px')
    expect(rule(settings, '[data-qc-theme] .qc-settings-line')['min-height']).toBe('34px')
    expect(rule(fields, '[data-qc-theme] .qc-drawing-page > .qc-drawing-section').height).toBe('32px')
    expect(rule(settings, '[data-qc-theme] .qc-chart-settings-panel > .qc-settings-heading:not(:first-child)')['margin-top']).toBe('16px')
  })

  it('indents a sub-row 26px and pulls it 8px up, and stands a disabled row\'s words at half strength', () => {
    const sub = rule(settings, "[data-qc-theme] .qc-settings-check[data-indent='true']")
    expect(sub['padding-inline-start']).toBe('26px')
    expect(sub['margin-top']).toBe('-8px')
    expect(rule(settings, "[data-qc-theme] [data-disabled='true'] > * > .qc-drawing-toggle > span").opacity).toBe('0.5')
  })

  it('writes a hint at 13 on 18 in the caption ink, and a tip as an 18px mark', () => {
    const hint = rule(settings, '[data-qc-theme] .qc-settings-hint')
    expect([hint['font-size'], hint['line-height'], hint.color]).toEqual(['13px', '18px', 'var(--qc-text-caption)'])
    const tip = rule(settings, '[data-qc-theme] .qc-settings-tip')
    expect([tip.width, tip.height]).toEqual(['18px', '18px'])
    const line = rule(settings, '[data-qc-theme] .qc-dialog-scrim > .qc-settings-tooltip')
    expect([line['font-size'], line['line-height'], line.padding, line['max-width'], line['border-radius']]).toEqual(['13px', '18px', '3px 8px', '310px', '2px'])
    expect(rule(settings, '[data-qc-theme] .qc-drawing-popover.qc-settings-card-popover').width).toBe('352px')
  })

  it('sizes the opacity track 148 by 10 and the volume 136 by 6, and a lone width 34px', () => {
    const opacity = rule(settings, '[data-qc-theme] .qc-settings-opacity')
    expect([opacity.width, opacity.height, opacity['border-radius']]).toEqual(['148px', '10px', '5px'])
    const volume = rule(settings, '[data-qc-theme] .qc-settings-volume')
    expect([volume.width, volume.height]).toEqual(['136px', '6px'])
    expect(rule(settings, '[data-qc-theme] .qc-drawing-select--mark.qc-settings-width').width).toBe('34px')
  })

  it('paints a color that follows the bars in the bars\' two colors', () => {
    expect(rule(settings, "[data-qc-theme] .qc-drawing-swatch-button[data-qc-follows='true'] .qc-drawing-well-fill").background).toBe(
      'linear-gradient(to bottom left, var(--qc-series-up) 50%, var(--qc-series-down) 50%)',
    )
  })
})

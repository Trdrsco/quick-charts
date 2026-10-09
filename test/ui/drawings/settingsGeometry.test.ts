// @vitest-environment happy-dom
// The settings pages' geometry rules that need no layout to read: what a page builds (a switch's
// wells dimmed with it, a price written at the symbol's precision, a tall text box, the rows a list
// of inputs lays out), and the recipes that size the number field's room, the level grid, the drop
// box and every control's font. The painted sizes themselves are read in a browser by
// test/browser/drawingDialogs.spec.ts.
import { afterEach, describe, expect, it } from 'vitest'
import { drawingTools } from '../../../src/drawings/index'
import { createPresets } from '../../../src/drawings/layer/presets'
import type { IDrawing } from '../../../src/internal/drawings/index'
import { openSettingsDialog } from '../../../src/ui/drawings/settingsDialog'
import { ownIcons } from '../../ownIcons'
import { authoredStylesheet } from '../../theme/stylesheetSource'
import { anchors, rig, t } from './settingsRig'

afterEach(() => {
  document.body.replaceChildren()
})

/** The declarations of every rule whose selector list matches, comments dropped. */
function rule(selector: RegExp): string {
  const text = authoredStylesheet().replace(/\/\*[\s\S]*?\*\//g, '')
  const found = [...text.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(([, head]) => selector.test(head!))
  expect(found.length, String(selector)).toBeGreaterThan(0)
  return found.map(([, , body]) => body).join('\n')
}

/** A drawing of a tool prepared before its dialog opens, and its page for a tab. */
function dialogFor(type: string, prepare: (drawing: IDrawing) => void, tab: string): HTMLElement {
  const chrome = document.body.appendChild(document.createElement('div'))
  const drawing = drawingTools.create(type, 'd1', anchors(Math.max(1, drawingTools.get(type)!.anchors)))!
  prepare(drawing)
  openSettingsDialog({ icons: ownIcons(), chrome, t, drawing, presets: createPresets(null), idBase: 'c1-drawing-settings', run: () => true, available: () => true })
  const dialog = chrome.querySelector<HTMLElement>('[data-role="drawing-settings"]')!
  ;[...dialog.querySelectorAll<HTMLElement>('[role="tab"]')].find((x) => x.textContent === tab)!.click()
  return dialog.querySelector<HTMLElement>('[role="tabpanel"]')!
}

const values = (page: HTMLElement, label: string): string[] =>
  [...page.querySelectorAll<HTMLInputElement>('.qc-drawing-number')].filter((i) => i.getAttribute('aria-label')?.startsWith(label)).map((i) => i.value)

describe('a switch and the wells beside it', () => {
  it('dims every well beside a switch that is off, and lights them as it goes on', () => {
    const { page, show } = rig('rectangle')
    show('Style')
    const middle = (): HTMLElement => [...page().querySelectorAll<HTMLElement>('.qc-drawing-row--checked')].find((r) => r.textContent?.startsWith('Middle line'))!
    const well = middle().querySelector<HTMLButtonElement>('.qc-drawing-swatch-button')!
    expect(middle().querySelector<HTMLInputElement>('input')!.checked).toBe(false)
    expect(well.dataset.qcDim).toBe('true')
    // A dimmed well still opens, so a color can be chosen before the switch goes on.
    expect(well.disabled).toBe(false)
    middle().querySelector<HTMLInputElement>('input')!.click()
    expect(middle().querySelector<HTMLElement>('.qc-drawing-swatch-button')!.dataset.qcDim).toBe('false')
    expect(rule(/\.qc-drawing-swatch-button\[data-qc-dim='true'\]\s*$/m)).toMatch(/background:\s*var\(--qc-control-fieldFill\)/)
  })

  it("dims a signpost's emoji well with its switch, the well a 36px box on a 6px corner", () => {
    const { page, show } = rig('signpost')
    show('Style')
    expect(page().querySelector<HTMLElement>('.qc-drawing-emoji-button')!.dataset.qcDim).toBe('true')
    const box = rule(/\.qc-drawing-emoji-button\s*$/m)
    expect(box).toMatch(/width:\s*36px/)
    expect(box).toMatch(/border-radius:\s*6px/)
    expect(rule(/\.qc-drawing-emoji-button\[data-qc-dim='true'\]\s*$/m)).toMatch(/background:\s*var\(--qc-control-fieldFill\)/)
  })
})

describe('a price in a field', () => {
  it("writes a point's price with as many decimals as the symbol's tick", () => {
    const quarter = dialogFor('trend_line', (d) => {
      d.setTickSize(0.25)
      d.updateAnchor(0, { time: 1000 as never, price: 4500.123456 })
    }, 'Coordinates')
    expect(values(quarter, '#1')[0]).toBe('4500.12')
    const whole = dialogFor('trend_line', (d) => {
      d.setTickSize(1)
      d.updateAnchor(0, { time: 1000 as never, price: 4500.6 })
    }, 'Coordinates')
    expect(values(whole, '#1')[0]).toBe('4501')
    // Cents where the host states no tick.
    const unstated = dialogFor('trend_line', (d) => d.updateAnchor(0, { time: 1000 as never, price: 81963.09244805641 }), 'Coordinates')
    expect(values(unstated, '#1')[0]).toBe('81963.09')
  })

  it("writes a position's entry, target and stop at the symbol's precision, so none outgrows its field", () => {
    const page = dialogFor('long_position', (d) => {
      d.setTickSize(0.01)
      d.updateAnchor(0, { time: 1000 as never, price: 81963.09244805641 })
    }, 'Inputs')
    expect(values(page, 'Entry price')).toEqual(['81963.09'])
    for (const price of values(page, 'Price')) expect(price).toMatch(/^\d+\.\d{2}$/)
  })
})

describe('the rows a page lays out', () => {
  it('stands a text box 172px tall for a tool that is its words, and 100px for every other', () => {
    for (const type of ['text', 'note', 'callout']) expect(dialogFor(type, () => undefined, 'Text').querySelector('textarea')!.dataset.size).toBe('tall')
    expect(dialogFor('trend_line', () => undefined, 'Text').querySelector('textarea')!.dataset.size).toBeUndefined()
    expect(rule(/\.qc-drawing-textarea\s*$/m)).toMatch(/height:\s*100px/)
    expect(rule(/\.qc-drawing-textarea\[data-size='tall'\]/)).toMatch(/height:\s*172px/)
  })

  it('keeps a list of inputs compact: 34px switches, nested rows 26px in, a band on one line', () => {
    const regression = dialogFor('regression_trend', () => undefined, 'Inputs')
    expect([...regression.querySelectorAll('.qc-drawing-toggle--compact')].map((x) => x.textContent)).toEqual(['Use Upper Deviation', 'Use Lower Deviation'])
    const profile = dialogFor('fixed_range_volume_profile', () => undefined, 'Style')
    expect(profile.querySelector('.qc-drawing-toggle--compact')!.textContent).toBe('Volume profile')
    expect([...profile.querySelectorAll('.qc-drawing-row--nested > .qc-drawing-row-label')].map((x) => x.textContent)).toEqual([
      'Values',
      'Width (% of the box)',
      'Placement',
      'Up Volume',
      'Down Volume',
      'Value Area Up',
      'Value Area Down',
    ])
    const vwap = dialogFor('anchored_vwap', () => undefined, 'Inputs')
    expect(vwap.firstElementChild!.classList.contains('qc-drawing-section--row')).toBe(true)
    const bands = [...vwap.querySelectorAll<HTMLElement>('.qc-drawing-band-row')]
    expect(bands.map((b) => [b.querySelector('label')!.textContent, !!b.querySelector('.qc-drawing-number-wrap')])).toEqual([
      ['Bands Multiplier #1', true],
      ['Bands Multiplier #2', true],
      ['Bands Multiplier #3', true],
    ])
    expect(rule(/\.qc-drawing-page > \.qc-drawing-toggle--compact/)).toMatch(/min-height:\s*34px/)
    expect(rule(/\.qc-drawing-page > \.qc-drawing-row--nested > \.qc-drawing-row-label/)).toMatch(/padding-inline-start:\s*26px/)
    expect(rule(/\.qc-drawing-page > \.qc-drawing-section--row/)).toMatch(/height:\s*50px/)
    expect(rule(/\.qc-drawing-page > \.qc-drawing-band-row > \.qc-drawing-toggle/)).toMatch(/gap:\s*16px/)
  })

  it('stands a level grid 412px across, its page grid taking the width rather than overshooting it', () => {
    expect(rule(/\.qc-drawing-page > \.qc-drawing-level-row\s*$/m)).toMatch(/min-width:\s*412px/)
    expect(rule(/\.qc-drawing-page > \.qc-drawing-ratio-row\s*$/m)).toMatch(/min-width:\s*412px/)
    expect(rule(/\.qc-drawing-page\s*$/m)).toMatch(/grid-template-columns:\s*auto minmax\(0, 1fr\)/)
  })

  it('ends each group of a position and a range meter with the room a group keeps', () => {
    const position = dialogFor('long_position', () => undefined, 'Inputs')
    const kinds = [...position.children].map((c) => (c.matches('.qc-drawing-group-gap') ? 'gap' : c.matches('.qc-drawing-section') ? 'section' : 'row'))
    expect(kinds.filter((k) => k === 'gap')).toHaveLength(4)
    expect(kinds[kinds.length - 1]).toBe('gap')
    for (const type of ['long_position', 'price_range']) expect(dialogFor(type, () => undefined, 'Style').lastElementChild!.matches('.qc-drawing-group-gap')).toBe(true)
  })
})

describe('the recipes the fields read', () => {
  it("lays a drop box's words out as captured: the call at 16 on 24 with 8px around and under it, the limits at 14 on 21", () => {
    expect(rule(/\.qc-drawing-drop\s*$/m)).toMatch(/border-radius:\s*4px/)
    const words = rule(/\.qc-drawing-drop-words\s*$/m)
    expect(words).toMatch(/font-size:\s*var\(--qc-text-fontSizeBase\)/)
    expect(words).toMatch(/line-height:\s*21px/)
    const call = rule(/\.qc-drawing-drop-title\s*$/m)
    expect(call).toMatch(/font-size:\s*16px/)
    expect(call).toMatch(/line-height:\s*24px/)
    expect(call).toMatch(/padding:\s*8px/)
    expect(call).toMatch(/margin-bottom:\s*8px/)
  })

  it("reads every control in the chart's own font, whatever the browser gives a control", () => {
    const controls = rule(/\[data-qc-theme\] button,\s*\[data-qc-theme\] input,\s*\[data-qc-theme\] select,\s*\[data-qc-theme\] textarea\s*$/m)
    expect(controls).toMatch(/font-family:\s*inherit/)
    // The disabled ink is the role's own.
    expect(rule(/\.qc-field:disabled,/)).toMatch(/color:\s*var\(--qc-text-disabled\)/)
  })
})

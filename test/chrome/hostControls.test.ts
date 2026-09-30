// @vitest-environment happy-dom
// A host's own control in the top bar, made by the chart as one of its own: it wears the bar's
// recipe without the host writing a class of the chart's, it announces its states the way the bar's
// own controls do, its glyph is a host factory drawn on the bar's icon box, a factory that fails
// costs the glyph and says why once, and the row re-fits its labels when a host control arrives.
import { afterEach, describe, expect, it } from 'vitest'
import { createToolbarButton, type ToolbarButtonOptions } from '../../src/ui/chrome/hostControls'
import { createIconDiagnostics } from '../../src/ui/icons/draw'
import type { ChartIconContext, ChartIconFactory } from '../../src/ui/icons/contract'
import { mountTopBar } from '../../src/ui/chrome/topBar'
import { memoryChartStorage } from '../../src/storage'
import { fakeWidget, settle } from './harness'
import { ownIcons } from '../ownIcons'

afterEach(() => {
  document.body.replaceChildren()
})

const SVG = 'http://www.w3.org/2000/svg'
/** A bell on its own grid, drawn with the document the chart hands the factory. */
const bell: ChartIconFactory = ({ document }) => {
  const svg = document.createElementNS(SVG, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  const path = document.createElementNS(SVG, 'path')
  path.setAttribute('d', 'M12 3a6 6 0 0 0-6 6v4l-2 3h16l-2-3V9a6 6 0 0 0-6-6Z')
  path.setAttribute('fill', 'currentColor')
  svg.append(path)
  return svg
}

function make(options: Partial<ToolbarButtonOptions> = {}) {
  const diagnostics = createIconDiagnostics()
  const presses: string[] = []
  const control = createToolbarButton({ label: 'Price alerts', onClick: () => void presses.push('press'), ...options }, ownIcons(undefined, diagnostics, () => 'rtl'))
  document.body.appendChild(control.element)
  return { control, diagnostics, presses }
}

describe('a host control made as one of the bar’s', () => {
  it('wears the bar’s recipe and names itself in the host’s words', () => {
    const { control, presses } = make({ text: 'Alert' })
    expect(control.element.tagName).toBe('BUTTON')
    expect(control.element.type).toBe('button')
    expect(control.element.classList.contains('qc-toolbar-button')).toBe(true)
    expect(control.element.getAttribute('aria-label')).toBe('Price alerts')
    expect(control.element.title).toBe('Price alerts')
    expect(control.element.querySelector('.qc-button-text')!.textContent).toBe('Alert')
    // A host's words leave before the bar's own last label.
    expect(control.element.dataset.qcLabel).toBe('drop')
    control.element.click()
    expect(presses).toEqual(['press'])
  })

  it('draws a glyph-only control without words to give up', () => {
    const { control } = make({ icon: bell })
    expect(control.element.querySelector('.qc-button-text')).toBeNull()
    expect(control.element.dataset.qcLabel).toBeUndefined()
  })

  it('announces a toggle, a disabled control and a popup the way the bar’s own do', () => {
    const toggle = make({ pressed: false }).control
    expect(toggle.element.getAttribute('aria-pressed')).toBe('false')
    toggle.update({ pressed: true })
    expect(toggle.element.getAttribute('aria-pressed')).toBe('true')

    const off = make({ disabled: true })
    expect(off.control.element.disabled).toBe(true)
    expect(off.control.element.getAttribute('aria-disabled')).toBe('true')
    off.control.element.click()
    expect(off.presses).toEqual([])
    off.control.update({ disabled: false })
    expect(off.control.element.disabled).toBe(false)
    expect(off.control.element.hasAttribute('aria-disabled')).toBe(false)

    const door = make({ popup: 'dialog' }).control
    expect(door.element.getAttribute('aria-haspopup')).toBe('dialog')
    expect(door.element.getAttribute('aria-expanded')).toBe('false')
    door.update({ expanded: true })
    expect(door.element.getAttribute('aria-expanded')).toBe('true')
    // A control that opens nothing says nothing about being open.
    const plain = make().control
    plain.update({ expanded: true })
    expect(plain.element.hasAttribute('aria-expanded')).toBe(false)
  })

  it('rewords itself, gains words, and changes or drops its glyph', () => {
    const { control } = make({ icon: bell })
    control.update({ label: 'Alerts: 2 active', text: 'Alerts' })
    expect(control.element.getAttribute('aria-label')).toBe('Alerts: 2 active')
    expect(control.element.querySelector('.qc-button-text')!.textContent).toBe('Alerts')
    expect(control.element.dataset.qcLabel).toBe('drop')
    control.update({ icon: null })
    expect(control.element.querySelector('.qc-icon')).toBeNull()
    control.update({ icon: bell })
    expect(control.element.querySelectorAll('.qc-icon')).toHaveLength(1)
  })
})

describe('the glyph a host draws', () => {
  it('is drawn with the chart’s document on the bar’s icon box, for the widget’s reading direction', () => {
    let asked: ChartIconContext | null = null
    const { control } = make({
      icon: (context) => {
        asked = context
        return bell(context)
      },
    })
    expect(asked).toMatchObject({ document, width: 28, height: 28, direction: 'rtl' })
    const svg = control.element.querySelector('.qc-icon > svg')!
    expect(svg.getAttribute('width')).toBe('28')
    expect(svg.getAttribute('height')).toBe('28')
    expect(svg.getAttribute('viewBox')).toBe('0 0 24 24')
    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expect(control.element.querySelector('.qc-icon')!.getAttribute('aria-hidden')).toBe('true')
  })

  it.each([
    ['threw', (() => { throw new Error('no art') }) as ChartIconFactory],
    ['not-svg', (({ document }) => document.createElement('span') as unknown as SVGSVGElement) as ChartIconFactory],
    ['in-use', (() => document.body.appendChild(document.createElementNS(SVG, 'svg'))) as ChartIconFactory],
  ])('costs the glyph and reports %s once, and the control still stands', (code, factory) => {
    const { control, diagnostics } = make({ icon: factory, text: 'Alert' })
    expect(control.element.querySelector('.qc-icon')).toBeNull()
    expect(control.element.getAttribute('aria-label')).toBe('Price alerts')
    control.update({ icon: factory })
    expect(diagnostics.list()).toEqual([{ icon: 'toolbarButton', code, message: expect.stringContaining('toolbarButton') }])
  })

  it('refuses an element it was handed before, so a second control cannot take it from the first', () => {
    const shared = bell({ document, width: 28, height: 28, direction: 'ltr' })
    const first = make({ icon: () => shared })
    const second = make({ icon: () => shared })
    expect(first.control.element.querySelector('svg')).toBe(shared)
    expect(second.control.element.querySelector('svg')).toBeNull()
    expect(second.diagnostics.list().map((d) => d.code)).toEqual(['in-use'])
  })
})

describe('a host control in a slot', () => {
  it('reaches the widget through chrome.toolbarButton and takes part in the row’s label fit', async () => {
    const w = fakeWidget()
    const bar = mountTopBar({ ...w.ctx, ...w.topBarParts, ui: w.ui, storage: memoryChartStorage(), preferences: {}, saveLoad: null, autosave: w.autosave, openSearch: () => undefined, notify: () => undefined })
    document.body.appendChild(bar.element)
    expect(bar.element.dataset.qcLabels).toBe('all')
    // A row that is narrower than its contents once anything more arrives.
    let contents = 100
    Object.defineProperty(bar.element, 'clientWidth', { configurable: true, get: () => 100 })
    Object.defineProperty(bar.element, 'scrollWidth', { configurable: true, get: () => contents })
    const control = w.widget.chrome.toolbarButton({ label: 'Price alerts', text: 'Alert', icon: bell, onClick: () => undefined })
    contents = 140
    bar.slot('afterIndicators').appendChild(control.element)
    await settle()
    expect(bar.element.dataset.qcLabels).not.toBe('all')
    // Taking it out gives the room back.
    contents = 100
    control.element.remove()
    await settle()
    expect(bar.element.dataset.qcLabels).toBe('all')
    bar.destroy()
    w.dispose()
  })
})

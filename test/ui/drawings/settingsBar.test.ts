// @vitest-environment happy-dom
// The settings bar: hidden without a selection, the controls the tool has and not the ones it
// lacks, every action a command, and the menus it opens.
import { afterEach, describe, expect, it } from 'vitest'
import { createChartI18n } from '../../../src/i18n'
import { createPresets } from '../../../src/drawings/layer/presets'
import type { SelectedDrawing } from '../../../src/drawings'
import { mountSettingsBar } from '../../../src/ui/drawings/settingsBar'

const t = createChartI18n().t

const selection = (over: Partial<SelectedDrawing> = {}): SelectedDrawing => ({
  id: 'd1',
  type: 'trend_line',
  lineColor: '#4c98fb',
  lineWidth: 2,
  lineStyle: 'solid',
  fillColor: '#4c98fb',
  fillOpacity: 0,
  textColor: 'rgba(229, 231, 235, 1)',
  fontSize: 13,
  bold: false,
  italic: false,
  locked: false,
  hasText: true,
  hasCells: false,
  ...over,
})

function rig(selected: SelectedDrawing | null, props: Record<string, unknown> | null = null) {
  const chrome = document.createElement('div')
  document.body.appendChild(chrome)
  const ran: [string, unknown][] = []
  const state = { selected, props, position: null as { x: number; y: number } | null, stack: { atFront: true, atBack: false } }
  const presets = createPresets(null)
  const bar = mountSettingsBar({
    chrome,
    t,
    selected: () => state.selected,
    selectedProps: () => state.props,
    presets,
    run: (command, arg) => {
      ran.push([command, arg])
      return true
    },
    stackPosition: () => state.stack,
    canPaste: () => false,
    position: () => state.position,
    onMove: (p) => {
      state.position = p
    },
  })
  const root = chrome.querySelector<HTMLElement>('[data-role="drawing-settings-bar"]')!
  const labels = () => [...root.querySelectorAll<HTMLElement>('.qc-drawing-settings-controls button')].map((b) => b.getAttribute('aria-label'))
  const byLabel = (label: string) => [...root.querySelectorAll<HTMLElement>('button')].find((b) => b.getAttribute('aria-label') === label)!
  const popover = () => chrome.querySelector<HTMLElement>('[data-role="drawing-popover"]')
  return { chrome, root, bar, state, ran, presets, labels, byLabel, popover }
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('the settings bar', () => {
  it('hides without a selection and shows the stroke controls for a line', () => {
    const { root, bar, state, labels } = rig(null)
    expect(root.hidden).toBe(true)
    state.selected = selection()
    bar.render()
    expect(root.hidden).toBe(false)
    expect(labels()).toEqual(['Drawing templates', 'Drawing color', 'Text color', 'Line thickness', 'Line style', 'Drawing settings', 'Lock drawing', 'Delete drawing', 'More drawing actions'])
  })

  it('offers no stroke for a glyph mark, and the table its row and column shortcuts', () => {
    const a = rig(selection({ type: 'emoji', hasText: false }))
    expect(a.labels()).toEqual(['Drawing templates', 'Drawing settings', 'Lock drawing', 'Delete drawing', 'More drawing actions'])
    const b = rig(selection({ type: 'table', hasText: false, hasCells: true }))
    expect(b.labels()).toEqual(['Drawing templates', 'Add row', 'Add column', 'Drawing color', 'Background color', 'Text color', 'Drawing settings', 'Lock drawing', 'Delete drawing', 'More drawing actions'])
    b.byLabel('Add row').click()
    expect(b.ran).toEqual([['chart.drawings.tableAddRow', undefined]])
    const c = rig(selection({ type: 'rectangle', hasText: false }))
    expect(c.labels()).toContain('Background color')
    const d = rig(selection({ type: 'text', hasText: true }))
    expect(d.labels()).toContain('Font size')
    expect(d.labels()).not.toContain('Drawing color')
  })

  it('runs the settings, lock and delete commands, and names the lock by its state', () => {
    const { byLabel, ran, state, bar } = rig(selection())
    byLabel('Drawing settings').click()
    byLabel('Lock drawing').click()
    byLabel('Delete drawing').click()
    expect(ran).toEqual([
      ['chart.drawings.settings', undefined],
      ['chart.drawings.lock', true],
      ['chart.drawings.deleteSelected', undefined],
    ])
    state.selected = selection({ locked: true })
    bar.render()
    expect(byLabel('Unlock drawing').getAttribute('aria-pressed')).toBe('true')
  })

  it('a color pick restyles and recolors every level of a leveled tool', () => {
    const { byLabel, ran, popover } = rig(selection({ type: 'fib_retracement', hasText: false }), { levels: [{ value: 0.5, visible: true, color: '#111111' }] })
    byLabel('Drawing color').click()
    popover()!.querySelector<HTMLButtonElement>('[aria-label="Color #000000"]')!.click()
    expect(ran).toEqual([
      ['chart.drawings.style', { lineColor: '#000000' }],
      ['chart.drawings.props', { levels: [{ value: 0.5, visible: true, color: '#000000' }] }],
    ])
  })

  it('thickness and line style menus restyle, and the More menu runs the stacking and visibility verbs', () => {
    const { byLabel, ran, popover } = rig(selection())
    byLabel('Line thickness').click()
    ;[...popover()!.querySelectorAll<HTMLElement>('[role="menuitem"]')][3]!.click()
    expect(ran[0]).toEqual(['chart.drawings.style', { lineWidth: 4 }])
    byLabel('Line style').click()
    ;[...popover()!.querySelectorAll<HTMLElement>('[role="menuitem"]')][1]!.click()
    expect(ran[1]).toEqual(['chart.drawings.style', { lineStyle: 'dashed' }])
    byLabel('More drawing actions').click()
    const rows = [...popover()!.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
    expect(rows.map((r) => r.textContent)).toEqual([
      'Bring to front',
      'Send to back',
      'Bring forward',
      'Send backward',
      'Current interval and above',
      'Current interval and below',
      'Current interval only',
      'All intervals',
      'CloneCtrl + Drag',
      'CopyCtrl + C',
      'PasteCtrl + V',
      'Hide',
    ])
    expect(rows[0]!.disabled).toBe(true) // already at the front
    expect(rows[1]!.disabled).toBe(false)
    expect(rows[10]!.disabled).toBe(true) // nothing on the clipboard
    rows[1]!.click()
    expect(ran[2]).toEqual(['chart.drawings.sendToBack', undefined])
    byLabel('More drawing actions').click()
    ;[...popover()!.querySelectorAll<HTMLElement>('[role="menuitem"]')][6]!.click()
    expect(ran[3]).toEqual(['chart.drawings.visibility', 'current-only'])
    byLabel('More drawing actions').click()
    ;[...popover()!.querySelectorAll<HTMLElement>('[role="menuitem"]')][11]!.click()
    expect(ran[4]).toEqual(['chart.drawings.hideSelected', undefined])
  })

  it('the templates menu applies the default, applies and removes a saved one, and opens the name dialog', async () => {
    const { chrome, byLabel, ran, popover, presets } = rig(selection())
    await presets.saveTemplate('trend_line', 'Thick red', { style: { lineWidth: 4 } })
    byLabel('Drawing templates').click()
    const rows = [...popover()!.querySelectorAll<HTMLElement>('[role="menuitem"]')]
    expect(rows.map((r) => r.textContent)).toEqual(['Save drawing template as...', 'Apply default drawing template', 'Thick red'])
    rows[2]!.click()
    expect(ran[0]).toEqual(['chart.drawings.template.apply', 'Thick red'])
    byLabel('Drawing templates').click()
    ;[...popover()!.querySelectorAll<HTMLElement>('[role="menuitem"]')][1]!.click()
    expect(ran[1]).toEqual(['chart.drawings.template.apply', null])
    byLabel('Drawing templates').click()
    popover()!.querySelector<HTMLButtonElement>('[aria-label="Remove template Thick red"]')!.click()
    chrome.querySelector<HTMLButtonElement>('[data-role="drawing-template-delete"] button[aria-label="Delete"]')!.click()
    expect(ran[2]).toEqual(['chart.drawings.template.remove', 'Thick red'])
    byLabel('Drawing templates').click()
    ;[...popover()!.querySelectorAll<HTMLElement>('[role="menuitem"]')][0]!.click()
    const input = chrome.querySelector<HTMLInputElement>('[data-role="drawing-template-name"] input')!
    input.value = 'Mine'
    input.dispatchEvent(new Event('input'))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(ran[3]).toEqual(['chart.drawings.template.save', 'Mine'])
  })

  it('sits where it was dragged to', () => {
    const { root, state, bar } = rig(selection())
    state.position = { x: 30, y: 40 }
    bar.render()
    expect(root.style.left).toBe('30px')
    expect(root.style.top).toBe('40px')
  })
})

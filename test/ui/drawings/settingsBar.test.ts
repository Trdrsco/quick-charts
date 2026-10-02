// @vitest-environment happy-dom
// The settings bar: hidden without a selection, the controls the tool has and not the ones it
// lacks, every action a command, and the menus it opens.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createChartI18n } from '../../../src/i18n'
import { createPresets } from '../../../src/drawings/layer/presets'
import type { SelectedDrawing } from '../../../src/drawings'
import { mountSettingsBar } from '../../../src/ui/drawings/settingsBar'
import { ownIcons } from '../../ownIcons'

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

function rig(selected: SelectedDrawing | null, props: Record<string, unknown> | null = null, deny: string[] = []) {
  const chrome = document.createElement('div')
  document.body.appendChild(chrome)
  const ran: [string, unknown][] = []
  const state = { selected, props, position: null as { x: number; y: number } | null, stack: { atFront: true, atBack: false } }
  const presets = createPresets(null)
  /** What the mount remembers of the colours the mixer made. */
  const mixed: string[] = []
  const bar = mountSettingsBar({
    icons: ownIcons(),
    chrome,
    t,
    selected: () => state.selected,
    selectedProps: () => state.props,
    presets,
    run: (command, arg) => {
      ran.push([command, arg])
      return true
    },
    available: (command) => !deny.includes(command),
    stackPosition: () => state.stack,
    position: () => state.position,
    onMove: (p) => {
      state.position = p
    },
    recentColors: () => mixed,
    onMixColor: (hex) => {
      mixed.unshift(hex)
    },
  })
  const root = chrome.querySelector<HTMLElement>('[data-role="drawing-settings-bar"]')!
  const labels = () => [...root.querySelectorAll<HTMLElement>('.qc-drawing-settings-controls button')].map((b) => b.getAttribute('aria-label'))
  const byLabel = (label: string) => [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.getAttribute('aria-label') === label)!
  const popover = () => chrome.querySelector<HTMLElement>('[data-role="drawing-popover"]')
  const popovers = () => [...chrome.querySelectorAll<HTMLElement>('[data-role="drawing-popover"]')]
  const rows = (panel: HTMLElement | null | undefined) => [...(panel?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])]
  return { chrome, root, bar, state, ran, presets, labels, byLabel, popover, popovers, rows }
}

const hover = (node: Element, type: 'mouseenter' | 'mouseleave'): void => {
  node.dispatchEvent(new MouseEvent(type))
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
    // The text IS the drawing; the card behind it is the text's own, set on its Text tab.
    expect(d.labels()).not.toContain('Background color')
  })

  // What each tool's bar offers, held against one rule table rather than
  // against how the sets happened to be written. A tool whose ink is its text offers no stroke; a
  // stroke that is always solid offers no dash; a fill is offered only where the paint encloses.
  it.each([
    ['brush', ['Drawing color', 'Background color', 'Line thickness'], ['Line style']],
    ['callout', ['Background color', 'Text color', 'Font size'], ['Drawing color', 'Line thickness']],
    ['comment', ['Background color', 'Text color', 'Font size'], ['Drawing color', 'Line thickness']],
    ['note', ['Drawing color', 'Text color', 'Font size'], ['Background color']],
    ['price_label', ['Background color', 'Text color', 'Font size'], ['Drawing color', 'Line thickness', 'Line style']],
    ['signpost', ['Drawing color', 'Font size'], ['Line thickness', 'Line style']],
    ['curve', ['Drawing color', 'Background color', 'Line thickness', 'Line style'], []],
    ['double_curve', ['Drawing color', 'Background color', 'Line thickness', 'Line style'], []],
    ['price_range', ['Drawing color', 'Background color', 'Line thickness'], ['Line style']],
    ['date_range', ['Drawing color', 'Background color', 'Line thickness'], ['Line style']],
    ['date_and_price_range', ['Drawing color', 'Background color', 'Line thickness'], ['Line style']],
  ])('%s offers the controls its paint actually has', (type, offers, withholds) => {
    const { labels } = rig(selection({ type, hasText: false }))
    for (const control of offers) expect(labels(), `${type} offers ${control}`).toContain(control)
    for (const control of withholds) expect(labels(), `${type} withholds ${control}`).not.toContain(control)
  })

  // A plan paints two zones, so it offers two fills of its own and no stroke: the entry rule is
  // part of the plan rather than a line the viewer draws.
  it.each(['long_position', 'short_position'])('%s offers its own two zones and the word on the plan', (type) => {
    const { labels } = rig(selection({ type, hasText: true }), { profitColor: '#089981', stopColor: '#f23645' })
    expect(labels()).toEqual(['Drawing templates', 'Text color', 'Target zone color', 'Stop zone color', 'Drawing settings', 'Lock drawing', 'Delete drawing', 'More drawing actions'])
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

  it('renders a control whose command the registry refuses disabled, never hidden, on the bar and in its menus', () => {
    const { byLabel, labels, popover } = rig(selection(), null, ['chart.drawings.style', 'chart.drawings.deleteSelected', 'chart.drawings.clone', 'chart.drawings.template.save'])
    expect(labels()).toHaveLength(9)
    expect(byLabel('Drawing color').disabled).toBe(true)
    expect(byLabel('Line thickness').disabled).toBe(true)
    expect(byLabel('Delete drawing').disabled).toBe(true)
    expect(byLabel('Lock drawing').disabled).toBe(false)
    expect(byLabel('Drawing settings').disabled).toBe(false)
    byLabel('More drawing actions').click()
    const rows = [...popover()!.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
    expect(rows.find((r) => r.textContent?.startsWith('Clone'))!.disabled).toBe(true)
    expect(rows.find((r) => r.textContent?.startsWith('Copy'))!.disabled).toBe(false)
    byLabel('Drawing templates').click()
    const templates = [...popover()!.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
    expect(templates.map((r) => r.disabled)).toEqual([true, false])
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

  it('the thickness and line style menus mark the current value and restyle, drawn with the bar glyphs', () => {
    const { byLabel, ran, popover, rows } = rig(selection())
    // The thickness mark is an 18 by N bar, on the control and in every row of its menu.
    expect(byLabel('Line thickness').querySelector('svg')?.getAttribute('width')).toBe('18')
    expect(byLabel('Line thickness').querySelector('svg')?.getAttribute('height')).toBe('2')
    byLabel('Line thickness').click()
    const widths = rows(popover())
    expect(widths.map((r) => r.querySelector('svg')?.getAttribute('width'))).toEqual(['18', '18', '18', '18'])
    expect(widths.map((r) => r.dataset.qcActive)).toEqual([undefined, 'true', undefined, undefined])
    // No row carries a phantom mark column: the glyph sits at its own width beside the label.
    expect(widths[0]!.querySelector('.qc-menu-icon')?.textContent).toBe('')
    widths[3]!.click()
    expect(ran[0]).toEqual(['chart.drawings.style', { lineWidth: 4 }])
    // The line styles are 28-grid glyphs worn at 22.
    expect(byLabel('Line style').querySelector('svg')?.getAttribute('height')).toBe('28')
    byLabel('Line style').click()
    const styles = rows(popover())
    expect(styles.map((r) => r.querySelector('svg')?.getAttribute('viewBox'))).toEqual(['0 0 28 28', '0 0 28 28', '0 0 28 28'])
    expect(styles.map((r) => r.dataset.qcActive)).toEqual(['true', undefined, undefined])
    styles[1]!.click()
    expect(ran[1]).toEqual(['chart.drawings.style', { lineStyle: 'dashed' }])
  })

  it('offers highlighter widths from 8 to 96 pixels with 20 selected', () => {
    const { byLabel, popover, rows, ran } = rig(selection({ type: 'highlighter', lineWidth: 20 }))
    byLabel('Line thickness').click()
    const widths = rows(popover())
    expect(widths.map((row) => row.textContent)).toEqual(['8px', '12px', '20px', '32px', '48px', '64px', '80px', '96px'])
    expect(widths.every((row) => row.querySelector('svg') === null)).toBe(true)
    expect(widths.map((row) => row.dataset.qcActive)).toEqual([undefined, undefined, 'true', undefined, undefined, undefined, undefined, undefined])
    widths[7]!.click()
    expect(ran[0]).toEqual(['chart.drawings.style', { lineWidth: 96 }])
  })

  it('the More menu is two submenus, then clone and copy with their hotkeys, then hide', () => {
    const { byLabel, ran, popover, popovers, rows } = rig(selection())
    expect(byLabel('More drawing actions').innerHTML).toContain('M7.5 13a1.5 1.5 0 1 0 0 3') // three dots in a row
    byLabel('More drawing actions').click()
    const menu = rows(popover())
    expect(menu.map((r) => r.textContent)).toEqual(['Visual order', 'Visibility on timeframes', 'CloneCtrl + Drag', 'CopyCtrl + C', 'Hide'])
    expect(menu.map((r) => r.getAttribute('aria-haspopup'))).toEqual(['menu', 'menu', null, null, null])
    // A submenu row points at where its panel appears; a row without a mark of its own takes a
    // spacer so the labels share a column; a leaf row carries no arrow.
    expect(menu.map((r) => r.querySelector('.qc-drawing-bar-arrow') !== null)).toEqual([true, true, false, false, false])
    expect(menu.map((r) => r.querySelector('.qc-menu-icon')?.childElementCount)).toEqual([1, 0, 1, 0, 1])
    expect(popovers()).toHaveLength(1)
    // The pointer over Visual order raises the stacking moves beside it; picking one runs its
    // command and closes the whole menu.
    hover(menu[0]!, 'mouseenter')
    expect(popovers()).toHaveLength(2)
    const moves = rows(popovers()[1])
    expect(moves.map((r) => r.textContent)).toEqual(['Bring to front', 'Send to back', 'Bring forward', 'Send backward'])
    expect(moves.map((r) => r.disabled)).toEqual([true, false, true, false]) // already at the front
    moves[1]!.click()
    expect(ran[0]).toEqual(['chart.drawings.sendToBack', undefined])
    expect(popovers()).toHaveLength(0)
    byLabel('More drawing actions').click()
    hover(rows(popover())[1]!, 'mouseenter')
    const presets = rows(popovers()[1])
    expect(presets.map((r) => r.textContent)).toEqual(['Current timeframe and above', 'Current timeframe and below', 'Current timeframe only', 'All timeframes'])
    presets[2]!.click()
    expect(ran[1]).toEqual(['chart.drawings.visibility', 'current-only'])
    expect(popovers()).toHaveLength(0)
    byLabel('More drawing actions').click()
    rows(popover())[4]!.click()
    expect(ran[2]).toEqual(['chart.drawings.hideSelected', undefined])
  })

  it('keeps a submenu up while the pointer crosses into it, lets it go after the grace, and drops it at once over a leaf row', () => {
    vi.useFakeTimers()
    const { byLabel, popover, popovers, rows } = rig(selection())
    byLabel('More drawing actions').click()
    const menu = rows(popover())
    hover(menu[0]!, 'mouseenter')
    expect(popovers()).toHaveLength(2)
    // Leaving the row starts the grace; arriving in the panel before it runs out cancels it.
    hover(menu[0]!, 'mouseleave')
    hover(popovers()[1]!.firstElementChild!, 'mouseenter')
    vi.advanceTimersByTime(400)
    expect(popovers()).toHaveLength(2)
    // A press inside the submenu is not a press outside the menu that opened it.
    rows(popovers()[1])[1]!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    expect(popovers()).toHaveLength(2)
    // Leaving the panel with nowhere to go lets it close after the grace.
    hover(popovers()[1]!.firstElementChild!, 'mouseleave')
    expect(popovers()).toHaveLength(2)
    vi.advanceTimersByTime(400)
    expect(popovers()).toHaveLength(1)
    // Over a leaf row there is no submenu to keep: it goes at once.
    hover(menu[1]!, 'mouseenter')
    expect(popovers()).toHaveLength(2)
    hover(menu[2]!, 'mouseenter')
    expect(popovers()).toHaveLength(1)
    // Closing the menu takes an open submenu down with it.
    hover(menu[0]!, 'mouseenter')
    expect(popovers()).toHaveLength(2)
    byLabel('More drawing actions').click()
    expect(popovers()).toHaveLength(0)
    vi.useRealTimers()
  })

  it('the templates menu applies the default, applies and removes a saved one, and opens the name dialog', async () => {
    const { chrome, byLabel, ran, popover, presets } = rig(selection())
    await presets.saveTemplate('trend_line', 'Thick red', { style: { lineWidth: 4 } })
    byLabel('Drawing templates').click()
    const rows = [...popover()!.querySelectorAll<HTMLElement>('[role="menuitem"]')]
    expect(rows.map((r) => r.textContent)).toEqual(['Save drawing template as...', 'Apply default drawing template', 'Thick red'])
    // A row with nothing to mark it carries no mark column: the label starts at the row's edge.
    expect(rows.map((r) => r.querySelector('.qc-menu-icon'))).toEqual([null, null, null])
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

  it('names the Command key in its hints on an Apple platform, and Control elsewhere', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel')
    const { byLabel, popover } = rig(selection())
    byLabel('More drawing actions').click()
    const hints = [...popover()!.querySelectorAll<HTMLElement>('.qc-menu-hint')].map((h) => h.textContent)
    expect(hints).toEqual(['Cmd + Drag', 'Cmd + C'])
    vi.restoreAllMocks()
  })

  it('paints the color strip through the style API, never through markup', () => {
    const { byLabel } = rig(selection({ lineColor: 'rgb(1, 2, 3)' }))
    const strip = byLabel('Drawing color').querySelector<HTMLElement>('.qc-drawing-color-strip')!
    expect(strip.style.getPropertyValue('--qcd-swatch')).toBe('rgb(1, 2, 3)')
    // A stored value that reads like markup stays a value: it cannot close the attribute it sits in.
    const hostile = rig(selection({ lineColor: 'red" onmouseover="x' }))
    expect(hostile.byLabel('Drawing color').querySelector('[onmouseover]')).toBeNull()
    expect(hostile.byLabel('Drawing color').querySelector<HTMLElement>('.qc-drawing-color-strip')!.hasAttribute('onmouseover')).toBe(false)
  })

  it('sits where it was dragged to', () => {
    const { root, state, bar } = rig(selection())
    state.position = { x: 30, y: 40 }
    bar.render()
    expect(root.style.left).toBe('30px')
    expect(root.style.top).toBe('40px')
  })
})

describe('moving the bar', () => {
  /** A pointer event that BUBBLES, as a real one does. */
  const pointer = (type: string, x: number, y: number): PointerEvent =>
    new PointerEvent(type, { clientX: x, clientY: y, bubbles: true, pointerId: 1 })

  it('ends the drag when the pointer is released over the bar itself', () => {
    const { root, bar, state, byLabel } = rig(selection())
    bar.render()
    const grip = byLabel('Move toolbar')

    grip.dispatchEvent(pointer('pointerdown', 100, 100))
    window.dispatchEvent(pointer('pointermove', 140, 130))
    const settled = root.style.left
    expect(settled).not.toBe('')

    // Released ON THE GRIP, which is where a hand lets go: the bar has followed the pointer, so the
    // grip is still under it. The surface stops pointer events reaching the chart underneath, and a
    // drag that listened for its own release behind that guard would never hear one.
    grip.dispatchEvent(pointer('pointerup', 140, 130))
    expect(state.position).not.toBeNull()

    // The drag is over, so the bar stays where it was let go rather than following the pointer on.
    window.dispatchEvent(pointer('pointermove', 400, 400))
    expect(root.style.left).toBe(settled)
  })
})

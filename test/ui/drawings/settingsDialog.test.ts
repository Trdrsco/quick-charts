// @vitest-environment happy-dom
// The settings dialog over a live drawing: the pages a tool gets, live edits with Cancel
// restoring the snapshot and Ok committing, the rows that follow the tool's own props and the
// capability sets, and the footer's template menu.
import { afterEach, describe, expect, it } from 'vitest'
import { createChartI18n } from '../../../src/i18n'
import { drawingTools } from '../../../src/drawings/index'
import { createPresets } from '../../../src/drawings/layer/presets'
import { openSettingsDialog } from '../../../src/ui/drawings/settingsDialog'
import { firstTabFor, tabsFor } from '../../../src/ui/drawings/settingsRows'

const t = createChartI18n().t
const anchors = (n: number) => Array.from({ length: n }, (_, i) => ({ time: (1000 + i * 60) as never, price: 100 + i }))

function rig(type: string, props: Record<string, unknown> = {}, deny: string[] = []) {
  const chrome = document.createElement('div')
  document.body.appendChild(chrome)
  const def = drawingTools.get(type)!
  const drawing = drawingTools.create(type, 'd1', anchors(Math.max(1, def.anchors)))!
  if (Object.keys(props).length) drawing.applyProps(props)
  const presets = createPresets(null)
  const out: string[] = []
  const ran: [string, unknown][] = []
  const handle = openSettingsDialog({
    chrome,
    t,
    drawing,
    presets,
    idBase: 'c1-drawing-settings',
    run: (command, arg) => {
      ran.push([command, arg])
      return !deny.includes(command)
    },
    available: (command) => !deny.includes(command),
    onClose: (outcome) => out.push(outcome),
  })
  const dialog = chrome.querySelector<HTMLElement>('[data-role="drawing-settings"]')!
  const tabs = () => [...dialog.querySelectorAll<HTMLElement>('[role="tab"]')]
  const tab = (label: string) => tabs().find((x) => x.textContent === label)!
  const labels = () => [...dialog.querySelectorAll<HTMLElement>('.qc-drawing-row-label, .qc-drawing-toggle span, .qc-dialog-heading')].map((x) => x.textContent)
  return { chrome, drawing, dialog, handle, out, ran, presets, tabs, tab, labels }
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('the pages a tool gets', () => {
  it('follow the capabilities and the props', () => {
    const line = drawingTools.create('trend_line', 'a', anchors(2))!
    expect(tabsFor(line)).toEqual(['Style', 'Text', 'Coordinates', 'Visibility'])
    expect(firstTabFor(line)).toBe('Style')
    const text = drawingTools.create('text', 'b', anchors(1))!
    expect(tabsFor(text)).toEqual(['Text', 'Coordinates', 'Visibility'])
    expect(firstTabFor(text)).toBe('Text')
    const table = drawingTools.create('table', 'c', anchors(1))!
    expect(tabsFor(table)).toEqual(['Style', 'Table', 'Coordinates', 'Visibility'])
    const profile = drawingTools.create('fixed_range_volume_profile', 'd', anchors(2))!
    expect(tabsFor(profile)).toEqual(['Inputs', 'Style', 'Coordinates', 'Visibility'])
  })
})

describe('the dialog', () => {
  it('opens on the tool name with its pages, and switches pages', () => {
    const { dialog, tabs, tab } = rig('trend_line')
    expect(dialog.getAttribute('aria-label')).toBe('Trend line settings')
    expect(tabs().map((x) => x.textContent)).toEqual(['Style', 'Text', 'Coordinates', 'Visibility'])
    expect(tab('Style').getAttribute('aria-selected')).toBe('true')
    // Each tab names the one page it fills, and the page names the tab that fills it.
    const page = dialog.querySelector<HTMLElement>('[role="tabpanel"]')!
    expect(page.id).toBe('c1-drawing-settings-page')
    expect(tab('Style').getAttribute('aria-controls')).toBe('c1-drawing-settings-page')
    expect(page.getAttribute('aria-labelledby')).toBe(tab('Style').id)
    tab('Coordinates').click()
    expect(tab('Coordinates').getAttribute('aria-selected')).toBe('true')
    expect(page.getAttribute('aria-labelledby')).toBe(tab('Coordinates').id)
    expect(dialog.querySelectorAll('.qc-drawing-row')).toHaveLength(2) // one row per anchor
  })

  it('applies edits live, restores them on Cancel, and commits on Ok', () => {
    const a = rig('trend_line')
    const middle = [...a.dialog.querySelectorAll<HTMLElement>('.qc-drawing-toggle')].find((x) => x.textContent === 'Middle point')!
    const check = middle.querySelector('input')!
    const before = a.drawing.props.middlePoint
    check.click()
    expect(a.drawing.props.middlePoint).toBe(!before)
    a.dialog.querySelector<HTMLButtonElement>('button[aria-label="Cancel"]')!.click()
    expect(a.drawing.props.middlePoint).toBe(before)
    expect(a.out).toEqual(['cancel'])
    const b = rig('trend_line')
    b.dialog.querySelector<HTMLButtonElement>('button[aria-label="Ok"]')!.click()
    expect(b.ran).toEqual([['chart.drawings.commitEdit', undefined]])
    expect(b.out).toEqual(['commit'])
    expect(document.querySelector('[data-role="drawing-settings"]')).toBeNull()
  })

  it('renders Ok and the template verbs disabled when the registry refuses them, and a refused commit keeps nothing', async () => {
    const a = rig('trend_line', {}, ['chart.drawings.commitEdit', 'chart.drawings.template.save', 'chart.drawings.template.remove'])
    await a.presets.saveTemplate('trend_line', 'Dashed', { style: { lineStyle: 'dashed' } })
    const ok = a.dialog.querySelector<HTMLButtonElement>('button[aria-label="Ok"]')!
    expect(ok.disabled).toBe(true)
    expect(a.dialog.querySelector<HTMLButtonElement>('button[aria-label="Cancel"]')!.disabled).toBe(false)
    a.dialog.querySelector<HTMLButtonElement>('button[aria-label="Template"]')!.click()
    const rows = [...a.dialog.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
    expect(rows.map((r) => [r.textContent, r.disabled])).toEqual([
      ['Save as...', true],
      ['Apply defaults', false],
      ['Dashed', false],
    ])
    expect(a.dialog.querySelector<HTMLButtonElement>('[aria-label="Remove template Dashed"]')!.disabled).toBe(true)
    // The disabled Ok cannot be pressed; were the commit refused at the door, the session ends as a cancel.
    const middle = [...a.dialog.querySelectorAll<HTMLElement>('.qc-drawing-toggle')].find((x) => x.textContent === 'Middle point')!
    const before = a.drawing.props.middlePoint
    middle.querySelector('input')!.click()
    expect(a.drawing.props.middlePoint).toBe(!before)
    ok.disabled = false
    ok.click()
    expect(a.ran).toEqual([['chart.drawings.commitEdit', undefined]])
    expect(a.out).toEqual(['cancel'])
    expect(a.drawing.props.middlePoint).toBe(before)
  })

  it('renders every control of a page disabled while the registry would not run the commands the page previews for', () => {
    const { dialog, tab } = rig('trend_line', {}, ['chart.drawings.style'])
    const controls = () => [...dialog.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement>('[role="tabpanel"] button, [role="tabpanel"] input, [role="tabpanel"] select')]
    expect(controls().length).toBeGreaterThan(3)
    expect(controls().every((c) => c.disabled)).toBe(true)
    // The Coordinates page previews through props alone, which is still permitted.
    tab('Coordinates').click()
    expect(controls().length).toBeGreaterThan(0)
    expect(controls().every((c) => !c.disabled)).toBe(true)
    // The tabs themselves and Cancel stay live: the session can still be left.
    expect((tab('Style') as HTMLButtonElement).disabled).toBe(false)
    expect(dialog.querySelector<HTMLButtonElement>('button[aria-label="Cancel"]')!.disabled).toBe(false)
  })

  it('Escape cancels once, and a second close is inert', () => {
    const { dialog, out, handle } = rig('rectangle')
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(out).toEqual(['cancel'])
    handle.close()
    expect(out).toEqual(['cancel'])
  })

  it('shows the fib levels with their colors, adds one, and hides the rows a tool ignores', () => {
    const { dialog, drawing, labels } = rig('fib_retracement')
    expect(labels()).toContain('Levels')
    const before = (drawing.props.levels as unknown[]).length
    dialog.querySelector<HTMLButtonElement>('button[aria-label="Add level"]')!.click()
    expect((drawing.props.levels as unknown[]).length).toBe(before + 1)
    expect(dialog.querySelectorAll('.qc-drawing-level')).toHaveLength(before + 1)
    const timezone = rig('fib_timezone')
    expect(timezone.labels()).not.toContain('Prices') // an inert prop shows no row
  })

  it('splits inputs from style for a volume profile, and lists the risk inputs for a position', () => {
    const profile = rig('fixed_range_volume_profile')
    expect(profile.tab('Inputs').getAttribute('aria-selected')).toBe('false')
    profile.tab('Inputs').click()
    expect(profile.labels()).toEqual(expect.arrayContaining(['Rows layout', 'Row size', 'Volume', 'Value area volume', 'Extend right']))
    profile.tab('Style').click()
    expect(profile.labels()).toEqual(expect.arrayContaining(['Width %', 'Placement', 'Point of control']))
    const position = rig('long_position')
    position.tab('Inputs').click()
    expect(position.labels()).toEqual(expect.arrayContaining(['Risk', 'Account size', 'Lot size', 'Leverage', 'Compact stats mode']))
  })

  it('the Text page edits the words quietly, and the Table page grows the grid', () => {
    const text = rig('text', { text: 'Hi' })
    const area = text.dialog.querySelector<HTMLTextAreaElement>('textarea')!
    area.value = 'Hi there'
    area.dispatchEvent(new Event('input'))
    expect(text.drawing.props.text).toBe('Hi there')
    expect(text.labels()).toEqual(expect.arrayContaining(['Color', 'Size', 'Weight', 'Background']))
    const table = rig('table')
    table.tab('Table').click()
    const cells = table.drawing.props.cells as string[][]
    table.dialog.querySelector<HTMLButtonElement>('button[aria-label="Add column"]')!.click()
    expect((table.drawing.props.cells as string[][])[0]!.length).toBe(cells[0]!.length + 1)
  })

  it('pins the last enabled interval on the Visibility page', () => {
    const { dialog, tab, drawing } = rig('rectangle')
    tab('Visibility').click()
    const checks = () => [...dialog.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')]
    expect(checks()).toHaveLength(7)
    // The page rebuilds after every edit, so each click reads the row again.
    for (let i = 1; i < 7; i++) checks()[i]!.click()
    const visibility = drawing.options.visibility
    expect(visibility.ticks).toBe(true)
    expect(visibility.months.on).toBe(false)
    const ticks = dialog.querySelector<HTMLInputElement>('input[type="checkbox"]')!
    expect(ticks.disabled).toBe(true)
    expect(dialog.textContent).toContain('A drawing stays on at least one interval')
  })

  it('the footer template menu saves the current setup under a name, applies the default, and removes a saved one', async () => {
    const { chrome, dialog, presets, ran, drawing } = rig('ray')
    expect(drawing.style.lineStyle).toBe('solid')
    await presets.saveTemplate('ray', 'Dashed', { style: { lineStyle: 'dashed' } })
    const template = dialog.querySelector<HTMLButtonElement>('button[aria-label="Template"]')!
    template.click()
    const rows = [...dialog.querySelectorAll<HTMLElement>('[role="menuitem"]')]
    expect(rows.map((r) => r.textContent)).toEqual(['Save as...', 'Apply defaults', 'Dashed'])
    // A template applies through the registry onto the selection, which is this drawing.
    rows[2]!.click()
    expect(ran[0]).toEqual(['chart.drawings.template.apply', 'Dashed'])
    template.click()
    ;[...dialog.querySelectorAll<HTMLElement>('[role="menuitem"]')][1]!.click()
    expect(ran[1]).toEqual(['chart.drawings.template.apply', null])
    template.click()
    ;[...dialog.querySelectorAll<HTMLElement>('[role="menuitem"]')][0]!.click()
    // The name dialog stands on the settings dialog's own box, so it closes with it.
    const nameDialog = dialog.querySelector<HTMLElement>('[data-role="drawing-template-name"]')!
    const input = nameDialog.querySelector<HTMLInputElement>('input')!
    input.value = 'Mine'
    input.dispatchEvent(new Event('input'))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(ran[2]).toEqual(['chart.drawings.template.save', 'Mine'])
    template.click()
    dialog.querySelector<HTMLButtonElement>('[aria-label="Remove template Dashed"]')!.click()
    dialog.querySelector<HTMLButtonElement>('[data-role="drawing-template-delete"] button[aria-label="Delete"]')!.click()
    expect(ran[3]).toEqual(['chart.drawings.template.remove', 'Dashed'])
    expect(chrome.querySelector('[data-role="drawing-template-delete"]')).toBeNull()
    expect(drawing.style.lineStyle).toBe('solid')
  })
})

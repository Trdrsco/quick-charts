// @vitest-environment happy-dom
// Editing more than one thing on a page. A table's cells and a fibonacci's levels are ARRAYS the
// model replaces whole on every change, so each field derives its next value from the drawing as it
// stands rather than from the copy its row was built with. Typing in one cell and then another,
// adding a row after typing, or renaming a level and then editing another keeps every earlier edit,
// and the input the trader is in is never rebuilt underneath them.
import { afterEach, describe, expect, it } from 'vitest'
import { createChartI18n } from '../../../src/i18n'
import { drawingTools } from '../../../src/drawings/index'
import { createPresets } from '../../../src/drawings/layer/presets'
import { openSettingsDialog } from '../../../src/ui/drawings/settingsDialog'
import { ownIcons } from '../../ownIcons'

const t = createChartI18n().t
const anchors = (n: number) => Array.from({ length: n }, (_, i) => ({ time: (1000 + i * 60) as never, price: 100 + i }))

function rig(type: string, props: Record<string, unknown> = {}) {
  const chrome = document.createElement('div')
  document.body.appendChild(chrome)
  const def = drawingTools.get(type)!
  const drawing = drawingTools.create(type, 'd1', anchors(Math.max(1, def.anchors)))!
  if (Object.keys(props).length) drawing.applyProps(props)
  const out: string[] = []
  const ran: [string, unknown][] = []
  const handle = openSettingsDialog({
    icons: ownIcons(),
    chrome,
    t,
    drawing,
    presets: createPresets(null),
    idBase: 'c1-drawing-settings',
    run: (command, arg) => {
      ran.push([command, arg])
      return true
    },
    available: () => true,
    onClose: (outcome) => out.push(outcome),
  })
  const dialog = chrome.querySelector<HTMLElement>('[data-role="drawing-settings"]')!
  const tab = (label: string) => [...dialog.querySelectorAll<HTMLElement>('[role="tab"]')].find((x) => x.textContent === label)!
  const button = (label: string) => dialog.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!
  const field = (label: string) => dialog.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!
  const type_ = (label: string, value: string): HTMLInputElement => {
    const input = field(label)
    input.value = value
    input.dispatchEvent(new Event('input', { bubbles: true }))
    return input
  }
  return { chrome, drawing, dialog, handle, out, ran, tab, button, field, type: type_ }
}

const cellsOf = (drawing: { props: Record<string, unknown> }): string[][] => drawing.props.cells as string[][]
const levelsOf = (drawing: { props: Record<string, unknown> }): { value: number; text?: string; visible: boolean }[] =>
  drawing.props.levels as { value: number; text?: string; visible: boolean }[]

afterEach(() => {
  document.body.replaceChildren()
})

describe('a table with several cells edited in turn', () => {
  it('keeps the first cell when the second is typed into', () => {
    const r = rig('table')
    r.tab('Table').click()
    r.type('Cell 1,1', 'alpha')
    r.type('Cell 1,2', 'beta')
    expect(cellsOf(r.drawing)[0]!.slice(0, 2)).toEqual(['alpha', 'beta'])
  })

  it('keeps typed cells when a row and then a column are added', () => {
    const r = rig('table')
    r.tab('Table').click()
    const columns = cellsOf(r.drawing)[0]!.length
    r.type('Cell 1,1', 'alpha')
    r.button('Add row').click()
    expect(cellsOf(r.drawing)[0]![0]).toBe('alpha')

    r.type('Cell 1,2', 'beta')
    r.button('Add column').click()
    expect(cellsOf(r.drawing)[0]!.slice(0, 2)).toEqual(['alpha', 'beta'])
    expect(cellsOf(r.drawing)[0]).toHaveLength(columns + 1)
  })

  it('keeps a typed cell when the header switch is flipped, and rolls the whole session back on Cancel', () => {
    const r = rig('table')
    const before = cellsOf(r.drawing).map((line) => [...line])
    r.tab('Table').click()
    r.type('Cell 1,1', 'alpha')
    r.dialog.querySelector<HTMLInputElement>('.qc-drawing-toggle input')!.click()
    expect(cellsOf(r.drawing)[0]![0]).toBe('alpha')

    r.handle.close()
    expect(r.out).toEqual(['cancel'])
    expect(cellsOf(r.drawing)).toEqual(before)
  })

  it('leaves the input the trader is typing in exactly where it was', () => {
    const r = rig('table')
    r.tab('Table').click()
    const first = r.field('Cell 1,1')
    r.type('Cell 1,1', 'alpha')
    r.type('Cell 1,2', 'beta')
    expect(r.field('Cell 1,1')).toBe(first)
    expect(first.value).toBe('alpha')
  })

  it('commits the whole session as one edit on Ok', () => {
    const r = rig('table')
    r.tab('Table').click()
    r.type('Cell 1,1', 'alpha')
    r.type('Cell 1,2', 'beta')
    r.dialog.querySelector<HTMLButtonElement>('.qc-button--primary')!.click()
    expect(r.ran.filter(([command]) => command === 'chart.drawings.commitEdit')).toHaveLength(1)
    expect(r.out).toEqual(['commit'])
    expect(cellsOf(r.drawing)[0]!.slice(0, 2)).toEqual(['alpha', 'beta'])
  })
})

describe('a fibonacci with several levels edited in turn', () => {
  it('keeps a level label when the next label is typed', () => {
    const r = rig('fib_retracement')
    const levels = levelsOf(r.drawing)
    r.type(`Level ${levels[0]!.value} text`, 'first')
    r.type(`Level ${levels[1]!.value} text`, 'second')
    expect(levelsOf(r.drawing).slice(0, 2).map((l) => l.text)).toEqual(['first', 'second'])
  })

  it('keeps a typed label when a level is toggled, renumbered or added afterwards', () => {
    const r = rig('fib_retracement')
    const levels = levelsOf(r.drawing)
    r.type(`Level ${levels[0]!.value} text`, 'first')

    const check = r.dialog.querySelector<HTMLInputElement>(`input[aria-label="Level ${levels[1]!.value} visible"]`)!
    check.click()
    expect(levelsOf(r.drawing)[0]?.text).toBe('first')
    expect(levelsOf(r.drawing)[1]?.visible).toBe(!levels[1]!.visible)

    r.type(`Level ${levels[2]!.value} text`, 'third')
    r.dialog.querySelector<HTMLButtonElement>('button[aria-label="Add level"]')!.click()
    expect(levelsOf(r.drawing).map((l) => l.text).slice(0, 3)).toEqual(['first', undefined, 'third'])
    expect(levelsOf(r.drawing)).toHaveLength(levels.length + 1)
  })

  it('rolls every level edit back on Cancel', () => {
    const r = rig('fib_retracement')
    const before = JSON.stringify(levelsOf(r.drawing))
    r.type(`Level ${levelsOf(r.drawing)[0]!.value} text`, 'first')
    r.handle.close()
    expect(JSON.stringify(levelsOf(r.drawing))).toBe(before)
  })
})

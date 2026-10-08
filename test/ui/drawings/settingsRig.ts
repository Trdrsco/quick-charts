// The settings dialog over a new drawing of a tool, and its pages read as row signatures, for the
// tests that pin each tool's pages row by row.
//
// A page is read as a list of row signatures: `Label: kinds` for a labelled row, `[x] Label` for a
// checkbox row, `[x] Label: kinds` for a row whose label is a checkbox, `full: kinds` for a row
// across both columns, `## Title` for a section and `gap` for the room a group keeps after it.
// Among a row's kinds, a switch with words of its own reads `[x] words`.
import { createChartI18n } from '../../../src/i18n'
import { drawingTools } from '../../../src/drawings/index'
import { createPresets } from '../../../src/drawings/layer/presets'
import { openSettingsDialog } from '../../../src/ui/drawings/settingsDialog'
import { ownIcons } from '../../ownIcons'

export const t = createChartI18n().t
export const anchors = (n: number) => Array.from({ length: n }, (_, i) => ({ time: (1000 + i * 60) as never, price: 100 + i }))

/** A new drawing of a tool and its settings dialog, opened on its first page. */
export function rig(type: string) {
  const chrome = document.createElement('div')
  document.body.appendChild(chrome)
  const def = drawingTools.get(type)!
  const drawing = drawingTools.create(type, 'd1', anchors(Math.max(1, def.anchors)))!
  const handle = openSettingsDialog({ icons: ownIcons(), chrome, t, drawing, presets: createPresets(null), idBase: 'c1-drawing-settings', run: () => true, available: () => true })
  const dialog = chrome.querySelector<HTMLElement>('[data-role="drawing-settings"]')!
  const tabs = (): string[] => [...dialog.querySelectorAll<HTMLElement>('[role="tab"]')].map((x) => x.textContent ?? '')
  const show = (label: string): void => [...dialog.querySelectorAll<HTMLElement>('[role="tab"]')].find((x) => x.textContent === label)!.click()
  const page = (): HTMLElement => dialog.querySelector<HTMLElement>('[role="tabpanel"]')!
  return { chrome, dialog, drawing, handle, tabs, show, page }
}

/** What a control is, as the signature names it. */
export function kind(control: Element): string {
  if (control.matches('.qc-drawing-swatch-button')) return control.querySelector('.qc-drawing-stroke') ? 'colorWithThickness' : 'color'
  if (control.matches('.qc-drawing-line-end')) return 'lineEnd'
  if (control.matches('.qc-drawing-select--mark')) return `mark(${control.getAttribute('data-mark')})`
  if (control.matches('.qc-drawing-band-opacity')) return 'opacity'
  if (control.matches('input[type="checkbox"]')) return `check(${(control as HTMLInputElement).checked ? 'x' : ' '})`
  if (control.matches('label.qc-drawing-toggle')) return `${(control.querySelector('input') as HTMLInputElement).checked ? '[x]' : '[ ]'} ${control.textContent}`
  if (control.matches('.qc-drawing-select[role="combobox"]')) return `select(${control.textContent})`
  if (control.matches('.qc-drawing-select')) return `multi(${control.textContent})`
  if (control.matches('.qc-drawing-number-wrap')) return 'number'
  if (control.matches('.qc-drawing-font-toggle')) return 'toggle'
  if (control.matches('.qc-drawing-dual')) return 'range'
  if (control.matches('textarea')) return 'textarea'
  return control.tagName.toLowerCase()
}

const kinds = (cell: Element): string => [...cell.children].map(kind).join(' ')
const ticked = (box: Element): string => ((box.querySelector('input') as HTMLInputElement).checked ? '[x]' : '[ ]')

/** The page as row signatures. */
export function signature(page: HTMLElement): string[] {
  return [...page.children].map((child) => {
    if (child.matches('.qc-drawing-row--checked')) {
      const label = child.querySelector('.qc-drawing-row-label')!
      return `${ticked(label)} ${label.textContent}: ${kinds(child.querySelector('.qc-drawing-row-controls')!)}`
    }
    if (child.matches('.qc-drawing-row')) return `${child.querySelector('.qc-drawing-row-label')!.textContent}: ${kinds(child.querySelector('.qc-drawing-row-controls')!)}`
    if (child.matches('label.qc-drawing-toggle')) return `${ticked(child)} ${child.textContent}`
    if (child.matches('.qc-drawing-row-full')) return `full: ${kinds(child)}`
    if (child.matches('.qc-drawing-section')) return `## ${child.textContent}`
    if (child.matches('.qc-drawing-group-gap')) return 'gap'
    return child.className
  })
}

/** The list a list button has open: it hangs on the dialog's backdrop, past the box. */
export function openList(dialog: HTMLElement): HTMLElement {
  return dialog.parentElement!.querySelector<HTMLElement>('.qc-drawing-popover:last-of-type [role="listbox"], .qc-drawing-popover:last-of-type [role="menu"]')!
}

/** The choices a list button offers, in their order: their words, or their names where a choice is
 *  a mark alone. */
export function choices(dialog: HTMLElement, button: HTMLElement): string[] {
  button.click()
  const out = [...openList(dialog).querySelectorAll<HTMLElement>('[role="option"], [role="menuitemcheckbox"]')].map((o) => o.textContent || o.getAttribute('aria-label') || '')
  button.click()
  return out
}

/** The choice a list button holds, as its open list marks it. */
export function chosen(dialog: HTMLElement, button: HTMLElement): string {
  button.click()
  const row = openList(dialog).querySelector<HTMLElement>('[aria-selected="true"]')
  const out = row ? row.textContent || row.getAttribute('aria-label') || '' : ''
  button.click()
  return out
}

/** Pick a choice by its words or its name from a list button's list. */
export function pick(dialog: HTMLElement, button: HTMLElement, name: string): void {
  button.click()
  const rows = [...openList(dialog).querySelectorAll<HTMLElement>('[role="option"], [role="menuitemcheckbox"]')]
  rows.find((o) => (o.textContent || o.getAttribute('aria-label')) === name)!.click()
}

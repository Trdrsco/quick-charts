// @vitest-environment happy-dom
// The settings pages of the line, shape and curve tools, row by row: which pages each tool gets,
// every row's label, the kind of every control in it and the value it opens on, the choices each
// list offers in their order, and the look and setup a new drawing of each tool starts with.
//
// A page is read as a list of row signatures: `Label: kinds` for a labelled row, `[x] Label` for a
// checkbox row, `[x] Label: kinds` for a row whose label is a checkbox, `full: kinds` for a row
// across both columns, `## Title` for a section and `gap` for the room a group keeps after it.
import { afterEach, describe, expect, it } from 'vitest'
import { createChartI18n } from '../../../src/i18n'
import { drawingTools } from '../../../src/drawings/index'
import { createPresets } from '../../../src/drawings/layer/presets'
import { openSettingsDialog } from '../../../src/ui/drawings/settingsDialog'
import { ownIcons } from '../../ownIcons'

const t = createChartI18n().t
const anchors = (n: number) => Array.from({ length: n }, (_, i) => ({ time: (1000 + i * 60) as never, price: 100 + i }))

function rig(type: string) {
  const chrome = document.createElement('div')
  document.body.appendChild(chrome)
  const def = drawingTools.get(type)!
  const drawing = drawingTools.create(type, 'd1', anchors(Math.max(1, def.anchors)))!
  openSettingsDialog({ icons: ownIcons(), chrome, t, drawing, presets: createPresets(null), idBase: 'c1-drawing-settings', run: () => true, available: () => true })
  const dialog = chrome.querySelector<HTMLElement>('[data-role="drawing-settings"]')!
  const tabs = (): string[] => [...dialog.querySelectorAll<HTMLElement>('[role="tab"]')].map((x) => x.textContent ?? '')
  const show = (label: string): void => [...dialog.querySelectorAll<HTMLElement>('[role="tab"]')].find((x) => x.textContent === label)!.click()
  const page = (): HTMLElement => dialog.querySelector<HTMLElement>('[role="tabpanel"]')!
  return { chrome, dialog, drawing, tabs, show, page }
}

afterEach(() => {
  document.body.replaceChildren()
})

/** What a control is, as the signature names it. */
function kind(control: Element): string {
  if (control.matches('.qc-drawing-swatch-button')) return control.querySelector('.qc-drawing-stroke') ? 'colorWithThickness' : 'color'
  if (control.matches('.qc-drawing-line-end')) return 'lineEnd'
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
function signature(page: HTMLElement): string[] {
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

/** The choices a list button offers, in their order. */
function choices(dialog: HTMLElement, button: HTMLElement): string[] {
  button.click()
  // A list hangs on the dialog's backdrop, past the box.
  const list = dialog.parentElement!.querySelector<HTMLElement>('.qc-drawing-popover:last-of-type [role="listbox"], .qc-drawing-popover:last-of-type [role="menu"]')!
  const out = [...list.querySelectorAll<HTMLElement>('[role="option"], [role="menuitemcheckbox"]')].map((o) => o.textContent ?? '')
  button.click()
  return out
}

const LINE_TEXT = ['full: color select(14) toggle toggle', 'full: textarea', 'Text alignment: select(Top) select(Center)']
const TWO_POINTS = ['#1 (price, bar): number number', '#2 (price, bar): number number']
const lineStyle = (extend: string, stats: string, position: string, always: string): string[] => [
  'Line: colorWithThickness lineEnd lineEnd',
  `Extend: multi(${extend})`,
  '[ ] Middle point',
  '[ ] Price labels',
  '## Info',
  `Stats: multi(${stats})`,
  `Stats position: select(${position})`,
  `${always} Always show stats`,
  'gap',
]

/** Every tool of the line, shape and curve families: its pages, and the rows of each page. */
const PAGES: Record<string, { tabs: string[]; Style: string[]; Text?: string[]; Coordinates?: string[] }> = {
  trend_line: { tabs: ['Style', 'Text', 'Coordinates', 'Visibility'], Style: lineStyle("Don't extend", 'Hidden', 'Right', '[ ]'), Text: LINE_TEXT, Coordinates: TWO_POINTS },
  ray: { tabs: ['Style', 'Text', 'Coordinates', 'Visibility'], Style: lineStyle('Extend right line', 'Hidden', 'Right', '[ ]'), Text: LINE_TEXT, Coordinates: TWO_POINTS },
  info_line: {
    tabs: ['Style', 'Text', 'Coordinates', 'Visibility'],
    Style: lineStyle("Don't extend", 'Price range, percent change, change in pips, bars range, date/time range, angle', 'Center', '[x]'),
    Text: LINE_TEXT,
    Coordinates: TWO_POINTS,
  },
  extended: { tabs: ['Style', 'Text', 'Coordinates', 'Visibility'], Style: lineStyle('Extend left line, extend right line', 'Hidden', 'Right', '[ ]'), Text: LINE_TEXT, Coordinates: TWO_POINTS },
  arrow: { tabs: ['Style', 'Text', 'Coordinates', 'Visibility'], Style: lineStyle("Don't extend", 'Hidden', 'Right', '[ ]'), Text: LINE_TEXT, Coordinates: TWO_POINTS },
  trend_angle: {
    tabs: ['Style', 'Coordinates', 'Visibility'],
    Style: ['Line: colorWithThickness', ...lineStyle("Don't extend", 'Hidden', 'Right', '[ ]').slice(1)],
    Coordinates: ['#1 (price, bar): number number', 'Angle: number'],
  },
  horizontal_line: {
    tabs: ['Style', 'Text', 'Coordinates', 'Visibility'],
    Style: ['Line: colorWithThickness', '[x] Price label'],
    Text: ['full: color select(12) toggle toggle', 'full: textarea', 'Text alignment: select(Middle) select(Center)'],
    Coordinates: ['#1 (price): number'],
  },
  horizontal_ray: {
    tabs: ['Style', 'Text', 'Coordinates', 'Visibility'],
    Style: ['Line: colorWithThickness', '[x] Price label'],
    Text: ['full: color select(12) toggle toggle', 'full: textarea', 'Text alignment: select(Bottom) select(Center)'],
    Coordinates: ['#1 (price, bar): number number'],
  },
  vertical_line: {
    tabs: ['Style', 'Text', 'Coordinates', 'Visibility'],
    Style: ['Line: colorWithThickness', '[x] Time label'],
    Text: ['full: color select(14) toggle toggle', 'full: textarea', 'Text alignment: select(Middle) select(Center)', 'Text orientation: select(Vertical)'],
    Coordinates: ['#1 (bar): number'],
  },
  cross_line: {
    tabs: ['Style', 'Coordinates', 'Visibility'],
    Style: ['Line: colorWithThickness', '[x] Price label', '[x] Time label'],
    Coordinates: ['#1 (price, bar): number number'],
  },
  rectangle: {
    tabs: ['Style', 'Text', 'Coordinates', 'Visibility'],
    Style: ["Extend: multi(Don't extend)", 'Border: colorWithThickness', '[ ] Middle line: colorWithThickness', '[x] Background: color'],
    Text: ['full: color select(14) toggle toggle', 'full: textarea', 'Text alignment: select(Inside) select(Center)'],
    Coordinates: TWO_POINTS,
  },
  rotated_rectangle: { tabs: ['Style', 'Visibility'], Style: ['Border: colorWithThickness', '[x] Background: color'] },
  arc: { tabs: ['Style', 'Visibility'], Style: ['Border: colorWithThickness', '[x] Background: color'] },
  polyline: { tabs: ['Style', 'Visibility'], Style: ['Border: colorWithThickness', '[x] Background: color'] },
  triangle: {
    tabs: ['Style', 'Coordinates', 'Visibility'],
    Style: ['Border: colorWithThickness', '[x] Background: color'],
    Coordinates: [...TWO_POINTS, '#3 (price, bar): number number'],
  },
  ellipse: { tabs: ['Style', 'Text', 'Visibility'], Style: ['Border: colorWithThickness', '[x] Background: color'], Text: ['full: color select(14) toggle toggle', 'full: textarea'] },
  circle: {
    tabs: ['Style', 'Text', 'Coordinates', 'Visibility'],
    Style: ['Border: colorWithThickness', '[x] Background: color'],
    Text: ['full: color select(14) toggle toggle', 'full: textarea'],
    Coordinates: TWO_POINTS,
  },
  curve: {
    tabs: ['Style', 'Coordinates', 'Visibility'],
    Style: ['Line: colorWithThickness lineEnd lineEnd', "Extend: multi(Don't extend)", '[ ] Background: color'],
    Coordinates: [...TWO_POINTS, '#3 (price, bar): number number'],
  },
  double_curve: {
    tabs: ['Style', 'Coordinates', 'Visibility'],
    Style: ['Line: colorWithThickness lineEnd lineEnd', "Extend: multi(Don't extend)", '[ ] Background: color'],
    Coordinates: [...TWO_POINTS, '#3 (price, bar): number number', '#4 (price, bar): number number'],
  },
}

describe('the pages and rows of the line, shape and curve tools', () => {
  for (const [type, expected] of Object.entries(PAGES)) {
    it(type, () => {
      const { tabs, show, page } = rig(type)
      expect(tabs()).toEqual(expected.tabs)
      expect(signature(page())).toEqual(expected.Style)
      for (const tab of ['Text', 'Coordinates'] as const) {
        if (!expected[tab]) continue
        show(tab)
        expect(signature(page()), `${type} ${tab}`).toEqual(expected[tab])
      }
    })
  }

  it('lists the Visibility page as a checkbox row for ticks and a range row per timeframe', () => {
    const { show, page } = rig('trend_line')
    show('Visibility')
    expect(signature(page())).toEqual([
      '[x] Ticks',
      '[x] Seconds: number range number',
      '[x] Minutes: number range number',
      '[x] Hours: number range number',
      '[x] Days: number range number',
      '[x] Weeks: number range number',
      '[x] Months: number range number',
    ])
  })
})

describe('the choices each list offers, in order', () => {
  it('a line: its ends, its extensions, its stats and where they stand', () => {
    const { dialog, page } = rig('trend_line')
    const [color, left] = [...page().querySelectorAll<HTMLElement>('.qc-drawing-row-controls')[0]!.children] as HTMLElement[]
    expect(color!.getAttribute('aria-label')).toBe('Line')
    expect(choices(dialog, left!)).toEqual(['Normal', 'Arrow'])
    const lists = [...page().querySelectorAll<HTMLElement>('.qc-drawing-select')]
    expect(choices(dialog, lists[0]!)).toEqual(['Extend left line', 'Extend right line'])
    expect(choices(dialog, lists[1]!)).toEqual(['Price range', 'Percent change', 'Change in pips', 'Bars range', 'Date/time range', 'Angle'])
    expect(choices(dialog, lists[2]!)).toEqual(['Left', 'Center', 'Right', 'Auto'])
  })

  it('a trend angle: the stats that read on its own line', () => {
    const { dialog, page } = rig('trend_angle')
    const lists = [...page().querySelectorAll<HTMLElement>('.qc-drawing-select')]
    expect(choices(dialog, lists[1]!)).toEqual(['Price range', 'Percent change', 'Change in pips', 'Bars range'])
  })

  it('the Text page: the sizes, where the words stand and which way they read', () => {
    const line = rig('vertical_line')
    line.show('Text')
    const [size, across, along, orientation] = [...line.page().querySelectorAll<HTMLElement>('.qc-drawing-select')]
    expect(choices(line.dialog, size!)).toEqual(['8', '10', '11', '12', '14', '16', '18', '20', '22', '24', '28', '32', '40'])
    expect(choices(line.dialog, across!)).toEqual(['Top', 'Middle', 'Bottom'])
    expect(choices(line.dialog, along!)).toEqual(['Left', 'Center', 'Right'])
    expect(choices(line.dialog, orientation!)).toEqual(['Horizontal', 'Vertical'])
    const box = rig('rectangle')
    box.show('Text')
    expect(choices(box.dialog, box.page().querySelectorAll<HTMLElement>('.qc-drawing-select')[1]!)).toEqual(['Top', 'Inside', 'Bottom'])
    box.show('Style')
    expect(choices(box.dialog, box.page().querySelector<HTMLElement>('.qc-drawing-select')!)).toEqual(['Extend left', 'Extend right'])
  })
})

describe('what the rows write', () => {
  it('ticks extensions and stats quietly, keeping the list open', () => {
    const { dialog, drawing, page } = rig('trend_line')
    const stats = page().querySelectorAll<HTMLElement>('.qc-drawing-select')[1]!
    stats.click()
    const items = [...dialog.parentElement!.querySelectorAll<HTMLElement>('[role="menuitemcheckbox"]')]
    items[2]!.click()
    items[5]!.click()
    expect(drawing.props.showPipsChange).toBe(true)
    expect(drawing.props.showAngle).toBe(true)
    expect(stats.textContent).toBe('Change in pips, angle')
    expect(dialog.parentElement!.querySelector('[role="menu"]')).not.toBeNull()
  })

  it('switches a background and a middle line on and off, keeping their colors', () => {
    const { drawing, page } = rig('rectangle')
    // The page rebuilds after each switch, so each one is read from the page as it stands.
    const checked = (): HTMLElement[] => [...page().querySelectorAll<HTMLElement>('.qc-drawing-row--checked')]
    checked()[1]!.querySelector('input')!.click()
    expect(drawing.props.fillBackground).toBe(false)
    expect(drawing.style.fillOpacity).toBe(0.2)
    expect(checked()[1]!.querySelector('input')!.checked).toBe(false)
    checked()[0]!.querySelector('input')!.click()
    expect(drawing.props.middleLine).toBe(true)
    expect(drawing.props.middleLineColor).toBe('#9c27b0')
  })

  it('holds the weight and slant as pressed toggles of the field box', () => {
    const { drawing, show, page } = rig('trend_line')
    show('Text')
    const [bold, italic] = [...page().querySelectorAll<HTMLButtonElement>('.qc-drawing-font-toggle')]
    expect(bold!.getAttribute('aria-pressed')).toBe('false')
    bold!.click()
    expect(drawing.style.bold).toBe(true)
    expect(page().querySelector('.qc-drawing-font-toggle')!.getAttribute('aria-pressed')).toBe('true')
    expect(italic!.getAttribute('aria-label')).toBe('Italic')
    expect(page().querySelector('.qc-drawing-font-toggle svg')).not.toBeNull()
  })
})

/** The look and setup each tool opens with: the factory look of its kind. */
describe('what a new drawing of each tool starts with', () => {
  const look = (type: string) => {
    const d = drawingTools.create(type, 'x', anchors(drawingTools.get(type)!.anchors))!
    return { line: d.style.lineColor, width: d.style.lineWidth, fill: d.style.fillOpacity > 0 ? `${d.style.fillColor} ${d.style.fillOpacity}` : null, text: d.style.textColor, size: d.style.fontSize, props: d.props }
  }

  it('draws a line tool in one blue at 2px, its words at 14px', () => {
    for (const type of ['trend_line', 'ray', 'info_line', 'extended', 'arrow', 'vertical_line', 'cross_line']) {
      const l = look(type)
      expect([l.line, l.width, l.text, l.size], type).toEqual(['#2962ff', 2, '#2962ff', 14])
    }
    for (const type of ['trend_angle', 'horizontal_line', 'horizontal_ray']) expect(look(type).size, type).toBe(12)
    expect(look('ray').props).toMatchObject({ extendLeft: false, extendRight: true })
    expect(look('arrow').props).toMatchObject({ leftEnd: 'normal', rightEnd: 'arrow' })
    expect(look('info_line').props).toMatchObject({ alwaysShowStats: true, statsPosition: 'center', showPipsChange: true, showDateTimeRange: true })
    expect(look('trend_line').props).toMatchObject({ statsPosition: 'right', alwaysShowStats: false, textVAlign: 'top', textHAlign: 'center' })
    expect(look('vertical_line').props).toMatchObject({ textOrientation: 'vertical', textVAlign: 'middle', showTime: true })
  })

  it('draws a shape in its own hue with a background at a fifth, a curve with its background off', () => {
    const hues: Record<string, string> = {
      rectangle: '#9c27b0',
      rotated_rectangle: '#4caf50',
      ellipse: '#f23645',
      circle: '#ff9800',
      triangle: '#089981',
      arc: '#e91e63',
      polyline: '#00bcd4',
      curve: '#2962ff',
      double_curve: '#673ab7',
    }
    for (const [type, hue] of Object.entries(hues)) {
      const l = look(type)
      expect([l.line, l.width, l.fill], type).toEqual([hue, 2, `${hue} 0.2`])
      expect(l.props.fillBackground, type).toBe(type !== 'curve' && type !== 'double_curve')
    }
    expect(look('rectangle').props).toMatchObject({ middleLine: false, middleLineWidth: 1, middleLineStyle: 'dashed', textVAlign: 'middle' })
  })
})

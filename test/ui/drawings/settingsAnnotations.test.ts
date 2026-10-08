// @vitest-environment happy-dom
// The settings pages of the text tools, the annotation tools and the marks, row by row: which pages
// each tool gets, every row's label, the kind of every control in it and the value it opens on, what
// the rows write, and the look and setup a new drawing of each tool starts with.
//
// Each page is read as row signatures; settingsRig.ts says how.
import { afterEach, describe, expect, it } from 'vitest'
import { drawingTools } from '../../../src/drawings/index'
import { toolRegistry } from '../../../src/internal/drawings/index'
import { anchors, choices, rig, signature } from './settingsRig'

afterEach(() => {
  document.body.replaceChildren()
})

const ONE_POINT = ['#1 (price, bar): number number']
const TWO_POINTS = [...ONE_POINT, '#2 (price, bar): number number']
/** A mark's Text page: its words' color, size, weight and slant, then its words. */
const markText = (size: number): string[] => [`full: color select(${size}) toggle toggle`, 'full: textarea']

/** Every tool's pages, the page it opens on first, and the rows of each. */
const PAGES: Record<string, { tabs: string[]; first: string[]; Text?: string[]; Coordinates?: string[] }> = {
  text: { tabs: ['Text', 'Visibility'], first: ['full: color select(14) toggle toggle', 'full: textarea', '[ ] Background: color', '[ ] Border: color', '[ ] Text wrap'] },
  comment: { tabs: ['Text', 'Coordinates', 'Visibility'], first: ['Text: color select(16)', 'full: textarea', 'Background: color', 'Border: color'], Coordinates: ONE_POINT },
  callout: {
    tabs: ['Text', 'Coordinates', 'Visibility'],
    first: ['full: color select(14) toggle toggle', 'full: textarea', 'Background: color', 'Border: colorWithThickness', '[ ] Text wrap'],
    Coordinates: TWO_POINTS,
  },
  price_label: { tabs: ['Style', 'Coordinates', 'Visibility'], first: ['Text: color select(14)', 'Background: color', 'Border: color'], Coordinates: ONE_POINT },
  note: {
    tabs: ['Style', 'Text', 'Coordinates', 'Visibility'],
    first: ['[x] Label background: color', '[ ] Label border: color', 'Line color: color'],
    Text: ['Text: color select(14) toggle toggle', 'full: textarea'],
    Coordinates: TWO_POINTS,
  },
  price_note: {
    tabs: ['Style', 'Text', 'Coordinates', 'Visibility'],
    first: ['Label text: color select(12) toggle toggle', 'Label background: color', 'Label border: color', 'Line color: color'],
    Text: ['full: color select(14) toggle toggle', 'full: textarea', 'Text alignment: select(Top) select(Center)'],
    Coordinates: TWO_POINTS,
  },
  pin: {
    tabs: ['Style', 'Text', 'Coordinates', 'Visibility'],
    first: ['Label: color'],
    Text: ['full: color select(14) toggle toggle', 'full: textarea', '[x] Background: color', '[ ] Border: color'],
    Coordinates: ONE_POINT,
  },
  signpost: {
    tabs: ['Style', 'Text', 'Coordinates', 'Visibility'],
    first: ['[ ] Emoji pin: button color'],
    Text: ['full: select(12) toggle toggle', 'full: textarea'],
    Coordinates: ['#1 (vertical position %, bar): number number'],
  },
  table: { tabs: ['Style', 'Visibility'], first: ['Background: color', 'Border: color', 'Text: color select(14)', 'Text alignment: select(Left)'] },
  arrow_up: { tabs: ['Style', 'Text', 'Coordinates', 'Visibility'], first: ['Arrow: color'], Text: markText(14), Coordinates: ONE_POINT },
  arrow_down: { tabs: ['Style', 'Text', 'Coordinates', 'Visibility'], first: ['Arrow: color'], Text: markText(14), Coordinates: ONE_POINT },
  arrow_marker: { tabs: ['Style', 'Text', 'Coordinates', 'Visibility'], first: ['Color: color'], Text: markText(16), Coordinates: TWO_POINTS },
  flag: { tabs: ['Style', 'Coordinates', 'Visibility'], first: ['Flag: color'], Coordinates: ONE_POINT },
}

describe('the pages and rows of the text and annotation tools and the marks', () => {
  for (const [type, expected] of Object.entries(PAGES)) {
    it(type, () => {
      const { tabs, show, page } = rig(type)
      expect(tabs()).toEqual(expected.tabs)
      expect(signature(page())).toEqual(expected.first)
      for (const tab of ['Text', 'Coordinates'] as const) {
        if (!expected[tab]) continue
        show(tab)
        expect(signature(page()), `${type} ${tab}`).toEqual(expected[tab])
      }
    })
  }

  it('offers a table its cells’ three alignments', () => {
    const { dialog, page } = rig('table')
    // The words' size, then where they stand across each cell.
    expect(choices(dialog, [...page().querySelectorAll<HTMLElement>('.qc-drawing-select')].at(-1)!)).toEqual(['Left', 'Center', 'Right'])
  })
})

describe('what the rows write', () => {
  /** The color a well stands for. */
  const well = (b: Element): string => b.querySelector<HTMLElement>('.qc-drawing-well-fill')!.style.getPropertyValue('--qcd-swatch')

  it('switches a text’s background, border and wrap, keeping the background’s color', () => {
    const { drawing, page } = rig('text')
    const checks = (): HTMLInputElement[] => [...page().querySelectorAll<HTMLInputElement>('input[type="checkbox"]')]
    checks()[0]!.click()
    checks()[1]!.click()
    checks()[2]!.click()
    expect(drawing.props).toMatchObject({ fillBackground: true, drawBorder: true, wordWrap: true })
    expect([drawing.style.fillColor, drawing.style.fillOpacity]).toEqual(['#2962ff', 0.25])
  })

  it('draws a callout’s border at the drawing’s width, and a note’s label border in a color of its own', () => {
    const callout = rig('callout')
    const border = callout.page().querySelectorAll('.qc-drawing-swatch-button')[2]!
    expect(border.getAttribute('aria-label')).toBe('Border')
    expect(border.querySelector('.qc-drawing-stroke-seg')!.getAttribute('style')).toContain('height: 2px')
    const note = rig('note')
    const [, labelBorder, line] = [...note.page().querySelectorAll('.qc-drawing-swatch-button')]
    expect([well(labelBorder!), well(line!)]).toEqual(['#4a4a4a', '#dbdbdb'])
  })

  it('sets a price note’s tag in a text style of its own', () => {
    const { drawing, page, dialog } = rig('price_note')
    const size = page().querySelector<HTMLElement>('.qc-drawing-select')!
    size.click()
    ;[...dialog.parentElement!.querySelectorAll<HTMLElement>('[role="option"]')].find((o) => o.textContent === '16')!.click()
    page().querySelector<HTMLButtonElement>('.qc-drawing-font-toggle')!.click()
    expect(drawing.props).toMatchObject({ labelFontSize: 16, labelBold: true })
    expect([drawing.style.fontSize, drawing.style.bold]).toEqual([14, false])
  })

  it('switches a signpost’s emoji and picks it from the picker, and types its height over its bar', () => {
    const { drawing, page, dialog, show } = rig('signpost')
    page().querySelector<HTMLInputElement>('input[type="checkbox"]')!.click()
    expect(drawing.props.showImage).toBe(true)
    page().querySelector<HTMLButtonElement>('.qc-drawing-emoji-button')!.click()
    dialog.parentElement!.querySelector<HTMLButtonElement>('.qc-drawing-glyph-cell')!.click()
    expect(drawing.props.emoji).toBe('😀')
    expect(dialog.parentElement!.querySelector('.qc-drawing-glyphs')).toBeNull()
    show('Coordinates')
    const field = page().querySelector<HTMLInputElement>('.qc-drawing-number')!
    field.value = '12.5'
    field.dispatchEvent(new Event('change'))
    expect(drawing.props.position).toBe(12.5)
  })

  it('stands a table’s words where its alignment says', () => {
    const { drawing, page, dialog } = rig('table')
    ;[...page().querySelectorAll<HTMLElement>('.qc-drawing-select')].at(-1)!.click()
    ;[...dialog.parentElement!.querySelectorAll<HTMLElement>('[role="option"]')].find((o) => o.textContent === 'Right')!.click()
    expect(drawing.props.textHAlign).toBe('right')
  })

  it('names a mark’s one color for what it paints', () => {
    const wellOf = (type: string): string => well(rig(type).page().querySelector('.qc-drawing-swatch-button')!)
    expect([wellOf('arrow_up'), wellOf('arrow_down'), wellOf('arrow_marker'), wellOf('flag')]).toEqual(['#089981', '#cc2f3c', '#1e53e5', '#2962ff'])
  })
})

/** The look and setup each tool opens with: the factory look of its kind. */
describe('what a new drawing of each tool starts with', () => {
  const look = (type: string) => {
    const d = drawingTools.create(type, 'x', anchors(drawingTools.get(type)!.anchors))!
    const s = d.style
    return { line: s.lineColor, width: s.lineWidth, fill: `${s.fillColor} ${s.fillOpacity}`, text: s.textColor, size: s.fontSize, bold: s.bold, props: d.props, anchors: d.anchors.length }
  }

  it('opens a text blue at 14px with its background, border and wrap off', () => {
    const l = look('text')
    expect([l.text, l.size, l.fill, l.line]).toEqual(['#2962ff', 14, '#2962ff 0.25', '#707070'])
    expect(l.props).toEqual({ text: '', fillBackground: false, drawBorder: false, wordWrap: false, wordWrapWidth: 200, savedLook: null })
  })

  it('opens a comment, a callout and a price label in their own boxes', () => {
    const comment = look('comment')
    expect([comment.text, comment.size, comment.fill, comment.line]).toEqual(['#ffffff', 16, '#2962ff 1', '#2962ff'])
    const callout = look('callout')
    expect([callout.text, callout.size, callout.fill, callout.line, callout.width]).toEqual(['#ffffff', 14, '#0097a7 0.7', '#0097a7', 2])
    expect(callout.props).toEqual({ text: '', wordWrap: false, wordWrapWidth: 200, borderWidth: null })
    const label = look('price_label')
    expect([label.text, label.size, label.bold, label.fill, label.line]).toEqual(['#ffffff', 14, true, '#2962ff 1', '#2962ff'])
  })

  it('opens a note and a pin with their labels on a dark background and no border', () => {
    const note = look('note')
    expect([note.line, note.text, note.size, note.fill, note.anchors]).toEqual(['#dbdbdb', '#dbdbdb', 14, '#2e2e2e 1', 2])
    const pin = look('pin')
    expect([pin.line, pin.text, pin.size, pin.fill]).toEqual(['#2962ff', '#dbdbdb', 14, '#2e2e2e 1'])
    for (const l of [note, pin]) expect(l.props).toEqual({ text: '', fillBackground: true, drawBorder: false, borderColor: '#4a4a4a' })
  })

  it('opens a price note blue with a white tag above its line', () => {
    const l = look('price_note')
    expect([l.line, l.text, l.size]).toEqual(['#2962ff', '#2962ff', 14])
    expect(l.props).toEqual({
      text: '',
      textVAlign: 'top',
      textHAlign: 'center',
      labelTextColor: '#ffffff',
      labelFontSize: 12,
      labelBold: false,
      labelItalic: false,
      labelBackgroundColor: '#2962ff',
      labelBorderColor: '#2962ff',
      savedLook: null,
    })
  })

  it('opens a signpost on a blue plate without its emoji, standing where it is first placed', () => {
    const l = look('signpost')
    expect([l.line, l.size]).toEqual(['#2962ff', 12])
    expect(l.props).toEqual({ text: '', showImage: false, emoji: '🙂', position: null, savedLook: null })
  })

  it('opens a table of three by three dark cells, its words to the left', () => {
    const l = look('table')
    expect([l.fill, l.line, l.text, l.size]).toEqual(['#0f0f0f 1', '#575757', '#dbdbdb', 14])
    expect(l.props).toMatchObject({ cells: [['', '', ''], ['', '', ''], ['', '', '']], headerRow: false, textHAlign: 'left' })
  })

  it('opens each mark in its own color', () => {
    expect([look('arrow_up').line, look('arrow_up').text, look('arrow_up').size]).toEqual(['#089981', '#089981', 14])
    expect([look('arrow_down').line, look('arrow_down').text]).toEqual(['#cc2f3c', '#cc2f3c'])
    const marker = look('arrow_marker')
    expect([marker.line, marker.text, marker.size, marker.bold]).toEqual(['#1e53e5', '#1e53e5', 16, true])
    expect(look('flag').line).toBe('#2962ff')
  })

  it('restores a text and a note saved at format 2 with their alignment, their background and border, and a one-point note’s label on its point', () => {
    const saved = (type: string, props: Record<string, unknown>) => ({ ...toolRegistry.create(type, type, anchors(1))!.toJSON(), v: 2 as const, anchors: anchors(1), props })
    const text = toolRegistry.restore(saved('text', { text: 'Hi', align: 'center' }))!
    expect(text.props).toEqual({ text: 'Hi', align: 'center', fillBackground: true, drawBorder: false, wordWrap: false, wordWrapWidth: 200, savedLook: {} })
    const note = toolRegistry.restore(saved('note', { text: 'Hi', align: 'left' }))!
    expect(note.props).toEqual({ text: 'Hi', align: 'left', fillBackground: true, drawBorder: true, borderColor: note.style.lineColor })
    expect(note.anchors).toEqual([anchors(1)[0], anchors(1)[0]])
  })
})

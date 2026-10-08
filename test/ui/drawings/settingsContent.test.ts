// @vitest-environment happy-dom
// The settings pages of the strokes (the brush, the path and the highlighter) and of the content
// tools (the emoji, the sticker, the content card, the icon and the image), row by row: which pages
// each tool gets, every row's label, the kind of every control in it and the value it opens on, what
// the rows write, and the look and setup a new drawing of each tool starts with.
//
// Each page is read as row signatures; settingsRig.ts says how.
import { afterEach, describe, expect, it } from 'vitest'
import { drawingTools } from '../../../src/drawings/index'
import { anchors, choices, rig, signature } from './settingsRig'

afterEach(() => {
  document.body.replaceChildren()
})

/** Every tool's pages and the rows of the page it opens on. */
const PAGES: Record<string, { tabs: string[]; first: string[] }> = {
  brush: { tabs: ['Style', 'Visibility'], first: ['Line: colorWithThickness lineEnd lineEnd', '[ ] Background: color'] },
  path: { tabs: ['Style', 'Visibility'], first: ['Line: colorWithThickness lineEnd lineEnd'] },
  highlighter: { tabs: ['Style', 'Visibility'], first: ['Line: color', 'Thickness: select(20px)'] },
  icon: { tabs: ['Style', 'Visibility'], first: ['Color: color'] },
  image: { tabs: ['Style', 'Visibility'], first: ['Image: input', 'qc-drawing-drop', 'qc-negative qc-drawing-note', 'Transparency: opacity'] },
}

describe('the pages and rows of the strokes and the content tools', () => {
  for (const [type, expected] of Object.entries(PAGES)) {
    it(type, () => {
      const { tabs, page } = rig(type)
      expect(tabs()).toEqual(expected.tabs)
      expect(signature(page())).toEqual(expected.first)
    })
  }

  it('opens an emoji, a sticker and a content card on their Visibility page alone', () => {
    for (const type of ['emoji', 'sticker', 'content_card']) {
      const { tabs, page } = rig(type)
      expect(tabs(), type).toEqual(['Visibility'])
      expect(signature(page())[0], type).toBe('[x] Ticks')
    }
  })

  it('offers a highlighter its widths from 8 to 96 pixels', () => {
    const { dialog, page } = rig('highlighter')
    expect(choices(dialog, page().querySelector<HTMLElement>('.qc-drawing-select')!)).toEqual(['8px', '12px', '20px', '32px', '48px', '64px', '80px', '96px'])
  })

  it('reads on an image’s box what it takes, as the Image tool’s picker does', () => {
    const { page } = rig('image')
    const box = page().querySelector<HTMLButtonElement>('.qc-drawing-drop')!
    expect([...box.querySelectorAll('.qc-drawing-drop-words > span')].map((l) => l.textContent)).toEqual(['Choose image', 'JPG, PNG or WEBP', 'Max size 2MB'])
    // Without a host to take a picture, the box chooses nothing.
    expect(box.disabled).toBe(true)
  })
})

describe('what the rows write', () => {
  it('switches a brush’s background on, keeping its color', () => {
    const { drawing, page } = rig('brush')
    page().querySelector<HTMLInputElement>('input[type="checkbox"]')!.click()
    expect(drawing.props.fillBackground).toBe(true)
    expect([drawing.style.fillColor, drawing.style.fillOpacity]).toEqual(['#00bcd4', 0.5])
  })

  it('sets a highlighter’s width in pixels', () => {
    const { drawing, page, dialog } = rig('highlighter')
    page().querySelector<HTMLElement>('.qc-drawing-select')!.click()
    ;[...dialog.parentElement!.querySelectorAll<HTMLElement>('[role="option"]')].find((o) => o.textContent === '48px')!.click()
    expect(drawing.style.lineWidth).toBe(48)
  })

  it('sets how see-through an image is drawn', () => {
    const { drawing, page } = rig('image')
    const track = page().querySelector<HTMLInputElement>('.qc-drawing-band-opacity')!
    expect(track.getAttribute('aria-label')).toBe('Transparency')
    track.value = '40'
    track.dispatchEvent(new Event('input'))
    expect(drawing.props.opacity).toBe(0.4)
  })
})

/** The look and setup each tool opens with: the factory look of its kind. */
describe('what a new drawing of each tool starts with', () => {
  const make = (type: string) => drawingTools.create(type, 'x', anchors(Math.max(1, drawingTools.get(type)!.anchors)))!

  it('opens a brush in teal at 2px with its background off, and a path in blue with an arrow at its end', () => {
    const brush = make('brush')
    expect([brush.style.lineColor, brush.style.lineWidth, brush.style.fillColor, brush.style.fillOpacity]).toEqual(['#00bcd4', 2, '#00bcd4', 0.5])
    expect(brush.props).toEqual({ fillBackground: false, leftEnd: 'normal', rightEnd: 'normal' })
    const path = make('path')
    expect([path.style.lineColor, path.style.lineWidth]).toEqual(['#2962ff', 2])
    expect(path.props).toEqual({ leftEnd: 'normal', rightEnd: 'arrow' })
  })

  it('opens a highlighter red at a fifth, 20px wide', () => {
    const l = make('highlighter')
    expect([l.style.lineColor, l.style.lineWidth]).toEqual(['rgba(242, 54, 69, 0.2)', 20])
  })

  it('opens an emoji and a sticker at 72px and an icon in blue at 40px', () => {
    expect(make('emoji').props.size).toBe(72)
    expect(make('sticker').props.size).toBe(72)
    const icon = make('icon')
    expect([icon.style.lineColor, icon.props.size]).toEqual(['#2962ff', 40])
  })
})

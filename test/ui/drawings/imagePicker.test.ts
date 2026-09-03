// @vitest-environment happy-dom
// The image picker over a host's asset port: the limits stated before a file is chosen, a refusal
// resolved through the catalog with the size it quotes, a picture previewed with its dimensions,
// the transparency slider, and Ok disabled until there is something to place.
import { afterEach, describe, expect, it } from 'vitest'
import { createChartI18n } from '../../../src/i18n'
import type { DrawingAssetPort } from '../../../src/drawings/index'
import type { PlacedImage } from '../../../src/drawings'
import { firstImageFile, humanSize, openImagePicker } from '../../../src/ui/drawings/imagePicker'

const t = createChartI18n().t
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

function rig(assets: DrawingAssetPort, canPlace = true) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const placed: PlacedImage[] = []
  let closed = 0
  const close = openImagePicker({ container, t, assets, canPlace: () => canPlace, onConfirm: (image) => placed.push(image), onClose: () => closed++ })
  const dialog = container.querySelector<HTMLElement>('[data-role="drawing-image-picker"]')!
  return { container, dialog, placed, close, closed: () => closed }
}

const okPort: DrawingAssetPort = {
  intakeImage: async (file) => ({ ok: true, asset: { dataUrl: `data:${file.type};base64,AA`, width: 640, height: 480, downscaled: false } }),
  glyphSource: () => null,
}

describe('the registry gate', () => {
  it('keeps Ok disabled while the registry would not place an image, and its refusals are a live region', async () => {
    const { dialog, placed } = rig(okPort, false)
    const file = dialog.querySelector<HTMLInputElement>('input[type="file"]')!
    Object.defineProperty(file, 'files', { value: [new File(['x'], 'a.png', { type: 'image/png' })] })
    file.dispatchEvent(new Event('change'))
    await settle()
    expect(dialog.querySelector<HTMLImageElement>('.qc-drawing-drop-preview')!.hidden).toBe(false)
    const ok = dialog.querySelector<HTMLButtonElement>('button[aria-label="Ok"]')!
    expect(ok.disabled).toBe(true)
    ok.click()
    expect(placed).toEqual([])
    const error = dialog.querySelector<HTMLElement>('.qc-drawing-note.qc-negative')!
    expect(error.getAttribute('role')).toBe('status')
    expect(error.getAttribute('aria-live')).toBe('polite')
  })
})

afterEach(() => {
  document.body.replaceChildren()
})

describe('the image picker', () => {
  it('states the limits, disables Ok, and closes as a dialog', () => {
    const { dialog, closed } = rig(okPort)
    expect(dialog.getAttribute('role')).toBe('dialog')
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.textContent).toContain('JPG or PNG')
    expect(dialog.textContent).toContain('Max size 2MB')
    const ok = dialog.querySelector<HTMLButtonElement>('button[aria-label="Ok"]')!
    expect(ok.disabled).toBe(true)
    dialog.querySelector<HTMLButtonElement>('button[aria-label="Close"]')!.click()
    expect(document.querySelector('[data-role="drawing-image-picker"]')).toBeNull()
    expect(closed()).toBe(1)
  })

  it('takes a dropped picture, previews it with its dimensions, and places it with the chosen opacity', async () => {
    const { dialog, placed } = rig(okPort)
    const file = new File(['x'], 'pic.png', { type: 'image/png' })
    const zone = dialog.querySelector<HTMLElement>('.qc-drawing-drop')!
    const drop = new Event('drop', { bubbles: true, cancelable: true }) as DragEvent
    Object.defineProperty(drop, 'dataTransfer', { value: { files: [file] } })
    zone.dispatchEvent(drop)
    await settle()
    await settle()
    expect(dialog.textContent).toContain('640 x 480')
    const preview = dialog.querySelector<HTMLImageElement>('.qc-drawing-drop-preview')!
    expect(preview.hidden).toBe(false)
    const slider = dialog.querySelector<HTMLInputElement>('input[type="range"]')!
    slider.value = '40'
    slider.dispatchEvent(new Event('input'))
    const ok = dialog.querySelector<HTMLButtonElement>('button[aria-label="Ok"]')!
    expect(ok.disabled).toBe(false)
    ok.click()
    expect(placed).toEqual([{ dataUrl: 'data:image/png;base64,AA', width: 640, height: 480, opacity: 0.4 }])
    expect(document.querySelector('[data-role="drawing-image-picker"]')).toBeNull()
  })

  it('tells a refusal in the chart language, with the size the port reported', async () => {
    const refusing: DrawingAssetPort = { intakeImage: async () => ({ ok: false, error: 'too-large', bytes: 3 * 1024 * 1024 }), glyphSource: () => null }
    const { dialog } = rig(refusing)
    const input = dialog.querySelector<HTMLInputElement>('input[type="file"]')!
    Object.defineProperty(input, 'files', { value: [new File(['x'], 'big.png', { type: 'image/png' })], configurable: true })
    input.dispatchEvent(new Event('change'))
    await settle()
    await settle()
    expect(dialog.textContent).toContain('That image is 3.0MB. The limit is 2MB.')
    expect(dialog.querySelector<HTMLButtonElement>('button[aria-label="Ok"]')!.disabled).toBe(true)
  })

  it('picks the first image among mixed items and writes sizes as people read them', () => {
    const text = new File(['x'], 'notes.txt', { type: 'text/plain' })
    const png = new File(['x'], 'pic.png', { type: 'image/png' })
    expect(firstImageFile([text, png])).toBe(png)
    expect(firstImageFile([text])).toBeNull()
    expect(firstImageFile(null)).toBeNull()
    expect(humanSize(512 * 1024)).toBe('512KB')
    expect(humanSize(1.5 * 1024 * 1024)).toBe('1.5MB')
  })
})

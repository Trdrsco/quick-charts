// The one color control the chart offers, wherever a color is chosen: the drawing toolbar and its
// settings dialog, the chart settings menu, and the indicator plot, level and fill editors. It
// replaces the native color input, which opened the operating system's own dialog: a different
// window on every machine, unstyleable, and jarring over a dark chart.
//
// The control owns transient interaction state only. It reports a typed edit and is updated and
// destroyed explicitly by its consumer, which owns persistence, previews, commits and
// cancellation: the drawing toolbar commits at once, the indicator dialog collects for Apply. A
// value update repaints in place, so neither a new value nor a theme change remounts an open
// panel, and a drag on the square or the strip reports nothing until it is committed, so one drag
// is one edit rather than one per pointer move.
import { button, el, focusFirst } from '../../drawings/dom'
import type { ChartTranslate } from '../../../i18n'
import { CUSTOM_COLOR_FALLBACK, GREY_RAMP, hexOf, hexToHsv, hsvToHex, isHex, readColor, SWATCH_BLOCKS, type Hsv } from './palette'

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n))

/** How many mixed colours the panel keeps, newest first: three rows of the grid less the cell the
 *  plus stands in. A viewer reaching past thirty is reaching for the mixer, not for a memory. */
export const RECENT_COLOR_LIMIT = 29

export interface ControlHandle<E extends HTMLElement = HTMLElement> {
  element: E
  destroy(): void
}

export interface CustomColorHandle extends ControlHandle {
  /** Repaint from a value the consumer now holds, without rebuilding the editor. */
  update(value: string): void
}

export interface OpacityHandle extends ControlHandle {
  update(color: string, value: number): void
}

/** The opacity control: a range over a track that fades into the color, beside the same value as a
 *  figure the viewer may type over. Both carry the percent and both report the fraction, so which
 *  one a hand reaches for is the only difference between them. */
export function createOpacitySlider(t: ChartTranslate, color: string, value: number, onChange: (v: number) => void): OpacityHandle {
  const track = el('input', { type: 'range', min: '0', max: '100', class: 'qc-drawing-opacity', 'aria-label': t('drawing.opacity') }) as HTMLInputElement
  const figure = el('input', { class: 'qc-drawing-opacity-readout', 'aria-label': t('drawing.opacity'), inputmode: 'numeric', spellcheck: 'false' }) as HTMLInputElement
  track.value = String(Math.round(clamp01(value) * 100))
  figure.value = track.value
  track.style.setProperty('--qcd-swatch', hexOf(color))
  track.addEventListener('input', () => {
    figure.value = track.value
    onChange(Number(track.value) / 100)
  })
  // The field takes figures alone and holds the range as it is typed, so a hundred is the most a
  // hand can reach. An emptied field reports nothing until there is a number to report.
  figure.addEventListener('input', () => {
    const digits = figure.value.replace(/[^0-9]/g, '').slice(0, 3)
    if (digits === '') {
      figure.value = ''
      return
    }
    const next = Math.min(100, Number(digits))
    figure.value = String(next)
    track.value = figure.value
    onChange(next / 100)
  })
  figure.addEventListener('blur', () => {
    figure.value = track.value
  })
  const element = el(
    'div',
    { class: 'qc-drawing-opacity-row' },
    track,
    el('span', { class: 'qc-drawing-opacity-field' }, figure, el('span', { class: 'qc-drawing-opacity-unit', 'aria-hidden': 'true', text: '%' })),
  )
  return {
    element,
    update(nextColor, nextValue) {
      track.style.setProperty('--qcd-swatch', hexOf(nextColor))
      if (document.activeElement !== track) track.value = String(Math.round(clamp01(nextValue) * 100))
      if (document.activeElement !== figure) figure.value = track.value
    },
    destroy() {
      element.remove()
    },
  }
}

/** The custom color editor behind the palette's plus cell: a live swatch, a hex field and an Add
 *  button on one row, then a saturation and value square beside a hue strip. Both tracks take the
 *  pointer and the keyboard; the pointer is captured by the track, so a drag that leaves the panel
 *  still tracks, a cancelled gesture releases, and no listener outlives the editor. */
export function createCustomColorPicker(t: ChartTranslate, initial: string, onAdd: (hex: string) => void): CustomColorHandle {
  const startOf = (value: string): string => readColor(value)?.hex ?? CUSTOM_COLOR_FALLBACK
  let hsv: Hsv = hexToHsv(startOf(initial))
  const hex = (): string => hsvToHex(hsv.h, hsv.s, hsv.v)

  const swatch = el('span', { class: 'qc-drawing-custom-swatch' })
  const field = el('input', { class: 'qc-drawing-hex', 'aria-label': t('drawing.hexColor'), spellcheck: 'false' }) as HTMLInputElement
  const commit = (): void => {
    if (isHex(field.value)) onAdd(`#${field.value.toLowerCase()}`)
  }
  const add = button({ class: 'qc-button qc-button--primary qc-drawing-add', label: t('drawing.add'), text: t('drawing.add'), onClick: commit })
  const square = el('div', { class: 'qc-drawing-sv', role: 'slider', tabindex: '0', 'aria-label': t('drawing.saturationValue') })
  const squareDot = el('span', { class: 'qc-drawing-sv-dot' })
  const strip = el('div', { class: 'qc-drawing-hue', role: 'slider', tabindex: '0', 'aria-label': t('drawing.hue'), 'aria-valuemin': '0', 'aria-valuemax': '360' })
  const stripDot = el('span', { class: 'qc-drawing-hue-dot' })
  square.appendChild(squareDot)
  strip.appendChild(stripDot)

  /** Repaint from the HSV state. A paint that follows typing leaves the field as typed, so a
   *  half-typed hex is never overwritten under the viewer's hands. */
  const paint = (typed = false): void => {
    const h = hex()
    swatch.style.setProperty('--qcd-swatch', h)
    square.style.setProperty('--qcd-hue', hsvToHex(hsv.h, 1, 1))
    squareDot.style.left = `${hsv.s * 100}%`
    squareDot.style.top = `${(1 - hsv.v) * 100}%`
    stripDot.style.top = `${(hsv.h / 360) * 100}%`
    square.setAttribute('aria-valuetext', h)
    strip.setAttribute('aria-valuenow', String(Math.round(hsv.h)))
    if (!typed) field.value = h.slice(1)
    add.disabled = !isHex(field.value)
  }
  field.addEventListener('input', () => {
    field.value = field.value.replace(/[^0-9a-f]/gi, '').slice(0, 6)
    if (isHex(field.value)) hsv = hexToHsv(`#${field.value}`)
    paint(true)
  })
  field.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') commit()
  })

  /** A drag on a track. The track captures the pointer for the gesture, so the move and the
   *  release arrive at the track itself whether or not the pointer is still over it. */
  const drag = (track: HTMLElement, onPos: (x: number, y: number) => void): void => {
    let pointer: number | null = null
    const at = (event: PointerEvent): void => {
      const r = track.getBoundingClientRect()
      onPos(clamp01((event.clientX - r.left) / (r.width || 1)), clamp01((event.clientY - r.top) / (r.height || 1)))
      paint()
    }
    track.addEventListener('pointerdown', (event) => {
      if (pointer !== null) return
      pointer = event.pointerId
      track.setPointerCapture?.(event.pointerId)
      track.focus({ preventScroll: true })
      at(event)
      event.preventDefault()
    })
    track.addEventListener('pointermove', (event) => {
      if (pointer !== event.pointerId) return
      at(event)
    })
    const release = (event: PointerEvent): void => {
      if (pointer !== event.pointerId) return
      pointer = null
      if (track.hasPointerCapture?.(event.pointerId)) track.releasePointerCapture?.(event.pointerId)
    }
    track.addEventListener('pointerup', release)
    track.addEventListener('pointercancel', release)
    track.addEventListener('lostpointercapture', release)
  }
  drag(square, (x, y) => {
    hsv = { ...hsv, s: x, v: 1 - y }
  })
  drag(strip, (_x, y) => {
    hsv = { ...hsv, h: y * 360 }
  })

  // The keyboard on the two tracks: the arrows move the axis a track owns, Shift moves it by the
  // coarse step, Home and End reach its ends, Enter commits as it does from the field.
  square.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      commit()
      return
    }
    const size = event.shiftKey ? 0.1 : 0.02
    if (event.key === 'ArrowRight') hsv = { ...hsv, s: clamp01(hsv.s + size) }
    else if (event.key === 'ArrowLeft') hsv = { ...hsv, s: clamp01(hsv.s - size) }
    else if (event.key === 'ArrowUp') hsv = { ...hsv, v: clamp01(hsv.v + size) }
    else if (event.key === 'ArrowDown') hsv = { ...hsv, v: clamp01(hsv.v - size) }
    else if (event.key === 'Home') hsv = { ...hsv, s: 0, v: 1 }
    else if (event.key === 'End') hsv = { ...hsv, s: 1, v: 0 }
    else return
    event.preventDefault()
    event.stopPropagation()
    paint()
  })
  strip.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      commit()
      return
    }
    const size = event.shiftKey ? 20 : 2
    const move = (h: number): void => {
      hsv = { ...hsv, h: Math.min(360, Math.max(0, h)) }
    }
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') move(hsv.h + size)
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') move(hsv.h - size)
    else if (event.key === 'Home') move(0)
    else if (event.key === 'End') move(360)
    else return
    event.preventDefault()
    event.stopPropagation()
    paint()
  })
  paint()

  const element = el(
    'div',
    { class: 'qc-drawing-custom' },
    el('div', { class: 'qc-drawing-custom-row' }, swatch, el('span', { class: 'qc-drawing-hex-wrap' }, el('span', { class: 'qc-muted', text: '#' }), field), add),
    el('div', { class: 'qc-drawing-custom-tracks' }, square, strip),
  )
  return {
    element,
    update(value) {
      // A repaint while the field has the keyboard would overwrite what is being typed.
      if (document.activeElement === field) return
      hsv = hexToHsv(startOf(value))
      paint()
    },
    destroy() {
      element.remove()
    },
  }
}

export interface PaletteOptions {
  value: string
  onPick(color: string): void
  /** The colours this viewer has mixed, newest first, and how a new one joins them. The control
   *  reads and writes through this rather than holding a store: what a chart remembers is the
   *  chart's to keep. Absent, the panel shows no remembered row and the mixer still applies. */
  recents?: { list(): readonly string[]; add(hex: string): void }
  /** 0..1 opacity; omit to hide the slider row. A value whose notation carries no alpha the
   *  control reads has no opacity row, and its declaration stands until a valid edit. */
  opacity?: number
  onOpacity?(value: number): void
}

export interface PaletteHandle extends ControlHandle {
  /** The value, and the opacity where the consumer supplies one, without a rebuild. */
  update(value: string, opacity?: number): void
}

/** The palette: the offered colours on a ten-wide grid, the ones this viewer mixed under a rule,
 *  and the opacity beneath. The plus does not grow the panel: it turns it over to the mixer, so
 *  the surface holding it never changes size under the pointer.
 *
 *  A block is a group of rows that stand together. The greys and the ten bases are what a viewer
 *  reaches for first; the ramps are a second reading of the same ten. */
export function createColorPalette(t: ChartTranslate, options: PaletteOptions): PaletteHandle {
  let value = options.value
  const grid = el('div', { class: 'qc-drawing-swatches', role: 'group', 'aria-label': t('drawing.pickColor') })
  const cells: HTMLButtonElement[] = []
  let lastRememberedCount = 0
  const swatch = (c: string): HTMLButtonElement => {
    const b = button({ class: 'qc-drawing-swatch', label: t('drawing.colorSwatch', { hex: c }), onClick: () => options.onPick(c) })
    b.style.setProperty('--qcd-swatch', c)
    b.dataset.qcColor = c
    // The palest cell of all would otherwise have no edge against a light panel.
    if (c === GREY_RAMP[0]) b.dataset.qcPale = 'true'
    cells.push(b)
    return b
  }
  /** One block's cells, ten to a row, appended to whatever holds it. A trailing control is laid
   *  out as one more cell, so it takes the next free place in the last row and wraps with the
   *  colours rather than standing on a row of its own. */
  const rowsOf = (host: HTMLElement, colors: readonly string[], trailing?: HTMLElement): void => {
    const row: HTMLElement[] = colors.map(swatch)
    if (trailing) row.push(trailing)
    for (let i = 0; i < row.length; i += 10) host.appendChild(el('div', { class: 'qc-drawing-swatch-row' }, ...row.slice(i, i + 10)))
  }
  for (const block of SWATCH_BLOCKS) {
    const box = el('div', { class: 'qc-drawing-swatch-block' })
    rowsOf(box, block.flat())
    grid.appendChild(box)
  }
  const markActive = (): void => {
    const base = hexOf(value)
    for (const b of cells) {
      if (b.dataset.qcColor === base) b.dataset.qcActive = 'true'
      else delete b.dataset.qcActive
    }
  }
  markActive()

  // The plus stands in the remembered row, in the next free cell: it is one of the colours a
  // viewer reaches along, not a control parked under them.
  const plus = button({ class: 'qc-drawing-swatch qc-drawing-swatch-plus', label: t('drawing.customColor') })
  plus.setAttribute('aria-haspopup', 'true')
  const remembered = el('div', { class: 'qc-drawing-swatch-block' })
  const paintRemembered = (): void => {
    remembered.replaceChildren()
    const kept = (options.recents?.list() ?? []).slice(0, RECENT_COLOR_LIMIT)
    for (const cell of cells.splice(cells.length - lastRememberedCount)) void cell
    lastRememberedCount = kept.length
    rowsOf(remembered, kept, plus)
    markActive()
  }
  grid.appendChild(el('div', { class: 'qc-drawing-separator', role: 'presentation' }))
  grid.appendChild(remembered)

  const element = el('div', { class: 'qc-drawing-palette' }, grid)

  // The mixer TURNS THE PANEL OVER rather than growing it: the swatches stand down, the mixer
  // takes their place at the same anchor, and committing a colour brings the swatches back with
  // the new one already remembered. A panel that grew instead would move every row under the
  // pointer that opened it.
  let custom: CustomColorHandle | null = null
  const closeCustom = (): void => {
    if (!custom) return
    custom.destroy()
    custom = null
    grid.hidden = false
    opacityRow?.removeAttribute('hidden')
    plus.focus({ preventScroll: true })
  }
  plus.addEventListener('click', () => {
    if (custom) {
      closeCustom()
      return
    }
    custom = createCustomColorPicker(t, value, (hex) => {
      options.recents?.add(hex)
      closeCustom()
      paintRemembered()
      options.onPick(hex)
    })
    grid.hidden = true
    opacityRow?.setAttribute('hidden', '')
    element.appendChild(custom.element)
    focusFirst(custom.element)
  })
  // Escape leaves the mixer for the swatches it replaced, before the surface holding the palette
  // sees the press and closes everything.
  element.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !custom) return
    event.stopPropagation()
    event.preventDefault()
    closeCustom()
  })

  let opacity: OpacityHandle | null = null
  let opacityRow: HTMLElement | null = null
  if (options.opacity !== undefined && options.onOpacity) {
    opacity = createOpacitySlider(t, hexOf(value), options.opacity, options.onOpacity)
    opacityRow = el('div', { class: 'qc-drawing-palette-opacity' }, el('span', { class: 'qc-drawing-section-title', text: t('drawing.opacity') }), opacity.element)
    element.appendChild(opacityRow)
  }
  paintRemembered()
  return {
    element,
    update(next, nextOpacity) {
      value = next
      paintRemembered()
      custom?.update(next)
      if (opacity && nextOpacity !== undefined) opacity.update(hexOf(next), nextOpacity)
    },
    destroy() {
      closeCustom()
      opacity?.destroy()
      element.remove()
    },
  }
}

/** How a consumer mounts the panel the control opens: it places `content` against `anchor`, calls
 *  `onClosed` whenever the panel goes for any reason, and returns its own close. The control never
 *  mounts an overlay itself, so overlay lifetime stays with the surface that owns it. */
export type OpenColorPanel = (anchor: HTMLElement, content: HTMLElement, onClosed: () => void) => () => void

export interface ColorControlOptions {
  label: string
  value: string
  onPick(color: string): void
  opacity?: number
  onOpacity?(value: number): void
  disabled?: boolean
  /** Close the panel as soon as a swatch is picked. A panel that also carries stroke rows stays. */
  closeOnPick?: boolean
  /** Extra rows the consumer appends below the palette, such as thickness and line style. */
  extraRows?(panel: HTMLElement): void
  openPanel: OpenColorPanel
}

export interface ColorControlHandle extends ControlHandle<HTMLButtonElement> {
  update(value: string, opacity?: number): void
}

/** The color field: a well showing the value over a checkerboard, which opens the palette. */
export function createColorControl(t: ChartTranslate, options: ColorControlOptions): ColorControlHandle {
  let value = options.value
  let opacity = options.opacity
  const fill = el('span', { class: 'qc-drawing-well-fill' })
  const well = el('span', { class: 'qc-drawing-well' }, fill)
  const face = (): void => {
    fill.style.setProperty('--qcd-swatch', value)
    fill.style.opacity = String(opacity ?? 1)
  }
  face()
  const element = button({ class: 'qc-field qc-drawing-swatch-button', label: options.label, disabled: options.disabled })
  element.setAttribute('aria-haspopup', 'dialog')
  element.setAttribute('aria-expanded', 'false')
  element.appendChild(well)

  let palette: PaletteHandle | null = null
  let close: (() => void) | null = null
  element.addEventListener('click', () => {
    if (close) {
      close()
      return
    }
    const panel = el('div', { class: 'qc-drawing-swatch-panel' })
    palette = createColorPalette(t, {
      value,
      onPick: (c) => {
        options.onPick(c)
        if (options.closeOnPick) close?.()
      },
      ...(opacity !== undefined && options.onOpacity ? { opacity, onOpacity: options.onOpacity } : {}),
    })
    panel.appendChild(palette.element)
    options.extraRows?.(panel)
    close = options.openPanel(element, panel, () => {
      palette?.destroy()
      palette = null
      close = null
    })
    focusFirst(panel)
  })

  return {
    element,
    update(next, nextOpacity) {
      value = next
      if (nextOpacity !== undefined) opacity = nextOpacity
      face()
      palette?.update(next, nextOpacity)
    },
    destroy() {
      close?.()
      element.remove()
    },
  }
}

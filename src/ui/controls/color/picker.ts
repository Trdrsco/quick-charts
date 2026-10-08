// The one color control the chart offers, wherever a color is chosen: the drawing settings bar and
// the settings dialog's color popover, the chart settings menu, and the indicator plot, level and
// fill editors. It replaces the native color input, which opened the operating system's own dialog:
// a different window on every machine, unstyleable, and jarring over a dark chart.
//
// The control owns transient interaction state only. It reports a typed edit and is updated and
// destroyed explicitly by its consumer, which owns persistence, previews, commits and
// cancellation: the drawing surfaces apply at once, the indicator dialog collects for Apply. A
// value update repaints in place, so neither a new value nor a theme change remounts an open
// panel, and a drag on the custom editor's area or strip reports nothing until the color is added,
// so one drag is one edit rather than one per pointer move.
import { button, dragUntilRelease, el, focusFirst } from '../../drawings/dom'
import { isRtl } from '../dom'
import type { ChartTranslate } from '../../../i18n'
import type { ColorMemory } from './memory'
import { CUSTOM_COLOR_FALLBACK, GREY_RAMP, hexFromText, hexOf, hexToHsv, hsvToHex, readColor, SWATCH_BLOCKS, type Hsv } from './palette'

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n))

/** How many mixed colors the palette keeps, newest first: three rows of the grid less the cell the
 *  plus stands in. A viewer reaching past thirty is reaching for the mixer, not for a memory. */
export const RECENT_COLOR_LIMIT = 29

/** The grid's width in cells, the same for every row the palette lays out. */
const COLUMNS = 10

/** The opacity knob's width: it travels the track less its own width, so it never pokes past an end. */
const KNOB = 12

export interface ControlHandle<E extends HTMLElement = HTMLElement> {
  element: E
  destroy(): void
}

export interface CustomColorHandle extends ControlHandle {
  /** Repaint from a value the consumer now holds, without rebuilding the editor. */
  update(value: string): void
}

export interface OpacityHandle extends ControlHandle {
  /** Repaint from the color and the opacity the consumer now holds. */
  update(color: string, value: number): void
}

const percentOf = (value: number): number => Math.round(clamp01(value) * 100)

/** The keys that step a slider, by how far each moves it along its axis. */
const STEPS: Readonly<Record<string, number>> = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 10, PageDown: -10 }

/** The opacity control: a track that fades from nothing into the color over a checked ground, a knob
 *  riding it, and beside it the same value as a percent the viewer may type over. Both report the
 *  fraction, so which one a hand reaches for is the only difference between them.
 *
 *  The track is a slider of its own rather than a native range, so the knob travels exactly the
 *  track's width less its own. A press anywhere on the track takes the knob there and follows the
 *  pointer until it is released; the arrows step a percent, Page Up and Page Down ten, and Home and
 *  End reach the ends. The figure takes digits alone and holds a hundred at most as it is typed, the
 *  up and down arrows step it (ten with Shift), and Enter or leaving it puts back the value it
 *  stands for. */
export function createOpacitySlider(t: ChartTranslate, color: string, value: number, onChange: (v: number) => void): OpacityHandle {
  let percent = percentOf(value)
  let ink = hexOf(color)
  const knob = el('span', { class: 'qc-drawing-opacity-knob' })
  const track = el(
    'div',
    { class: 'qc-drawing-opacity', role: 'slider', tabindex: '0', 'aria-label': t('drawing.opacity'), 'aria-valuemin': '0', 'aria-valuemax': '100' },
    el('span', { class: 'qc-drawing-opacity-fade' }),
    el('span', { class: 'qc-drawing-opacity-travel' }, knob),
  )
  const figure = el('input', { class: 'qc-drawing-opacity-readout', 'aria-label': t('drawing.opacity'), inputmode: 'numeric', spellcheck: 'false', autocomplete: 'off', maxlength: '3' }) as HTMLInputElement

  const paint = (): void => {
    track.style.setProperty('--qcd-swatch', ink)
    knob.style.setProperty('inset-inline-start', `${percent}%`)
    track.setAttribute('aria-valuenow', String(percent))
    track.setAttribute('aria-valuetext', `${percent}%`)
    if (document.activeElement !== figure) figure.value = String(percent)
  }
  const set = (next: number): void => {
    const p = Math.round(Math.min(100, Math.max(0, next)))
    if (p === percent) return
    percent = p
    paint()
    onChange(p / 100)
  }

  /** The percent under the pointer: where the knob's middle would stand. */
  const under = (event: PointerEvent): number => {
    const r = track.getBoundingClientRect()
    const along = isRtl(track) ? r.right - event.clientX : event.clientX - r.left
    return ((along - KNOB / 2) / Math.max(1, r.width - KNOB)) * 100
  }
  track.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return
    event.preventDefault()
    track.focus({ preventScroll: true })
    track.dataset.qcDragging = 'true'
    set(under(event))
    dragUntilRelease(
      (move) => set(under(move)),
      () => delete track.dataset.qcDragging,
    )
  })
  track.addEventListener('keydown', (event) => {
    const step = STEPS[event.key]
    // The knob moves the way the arrow points, so a right-to-left track takes the sideways arrows
    // the other way round.
    if (step !== undefined) set(percent + ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && isRtl(track) ? -step : step))
    else if (event.key === 'Home') set(0)
    else if (event.key === 'End') set(100)
    else return
    event.preventDefault()
  })

  figure.addEventListener('input', () => {
    const digits = figure.value.replace(/\D/g, '')
    // An emptied field reports nothing until there is a number to report.
    if (digits === '') {
      figure.value = ''
      return
    }
    const typed = Math.min(100, Number(digits))
    figure.value = String(typed)
    set(typed)
  })
  figure.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      figure.value = String(percent)
      return
    }
    const step = event.key === 'ArrowUp' ? 1 : event.key === 'ArrowDown' ? -1 : 0
    if (!step) return
    event.preventDefault()
    set(percent + step * (event.shiftKey ? 10 : 1))
    figure.value = String(percent)
  })
  figure.addEventListener('blur', () => {
    figure.value = String(percent)
  })

  const element = el(
    'div',
    { class: 'qc-drawing-opacity-row' },
    track,
    el('span', { class: 'qc-drawing-opacity-field' }, figure, el('span', { class: 'qc-drawing-opacity-unit', 'aria-hidden': 'true', text: '%' })),
  )
  paint()
  return {
    element,
    update(nextColor, nextValue) {
      ink = hexOf(nextColor)
      // A drag in flight owns the knob; what it reported comes back as this same value.
      if (track.dataset.qcDragging !== 'true') percent = percentOf(nextValue)
      paint()
    },
    destroy() {
      element.remove()
    },
  }
}

/** The custom color editor behind the palette's plus: the color it holds in a well, that color's hex
 *  in a field the viewer may type over, and Add, on one row; under them a saturation and brightness
 *  area beside a hue strip.
 *
 *  The field reads three or six hex digits, with or without the hash, and repaints the area and the
 *  strip from a value it can read as it is typed. Asked to add anything else, it refuses it in the
 *  field's invalid state until the text names a color again. A press on the area or the strip takes
 *  its knob there and follows the pointer until it is released, and the arrows step either from the
 *  keyboard (Shift steps further). Nothing is reported until Add, or Enter, adds the color. */
export function createCustomColorPicker(t: ChartTranslate, initial: string, onAdd: (hex: string) => void): CustomColorHandle {
  const startOf = (value: string): string => readColor(value)?.hex ?? CUSTOM_COLOR_FALLBACK
  let hsv: Hsv = hexToHsv(startOf(initial))
  const held = (): string => hsvToHex(hsv.h, hsv.s, hsv.v)

  const well = el('span', { class: 'qc-drawing-custom-swatch' })
  const field = el('input', { class: 'qc-drawing-hex', 'aria-label': t('drawing.hexColor'), spellcheck: 'false', autocomplete: 'off', maxlength: '7' }) as HTMLInputElement
  const add = button({ class: 'qc-button qc-button--primary qc-drawing-add', label: t('drawing.add'), text: t('drawing.add'), onClick: () => commit() })
  const areaKnob = el('span', { class: 'qc-drawing-sv-dot' })
  const area = el('div', { class: 'qc-drawing-sv', role: 'slider', tabindex: '0', 'aria-label': t('drawing.saturationValue') }, areaKnob)
  const stripKnob = el('span', { class: 'qc-drawing-hue-dot' })
  const stripTravel = el('span', { class: 'qc-drawing-hue-travel' }, stripKnob)
  const strip = el('div', { class: 'qc-drawing-hue', role: 'slider', tabindex: '0', 'aria-label': t('drawing.hue'), 'aria-valuemin': '0', 'aria-valuemax': '360', 'aria-orientation': 'vertical' }, stripTravel)

  /** Repaint from the color held. A paint that follows typing leaves the field as typed, so a
   *  three-digit hex is never spelled out under the viewer's hands. */
  const paint = (typed = false): void => {
    const hex = held()
    well.style.setProperty('--qcd-swatch', hex)
    area.style.setProperty('--qcd-hue', hsvToHex(hsv.h, 1, 1))
    areaKnob.style.setProperty('inset-inline-start', `${hsv.s * 100}%`)
    areaKnob.style.top = `${(1 - hsv.v) * 100}%`
    stripKnob.style.top = `${(hsv.h / 360) * 100}%`
    area.setAttribute('aria-valuetext', hex)
    strip.setAttribute('aria-valuenow', String(Math.round(hsv.h)))
    if (typed) return
    field.value = hex.slice(1)
    field.removeAttribute('aria-invalid')
  }
  const commit = (): void => {
    const hex = hexFromText(field.value)
    if (!hex) {
      field.setAttribute('aria-invalid', 'true')
      field.focus({ preventScroll: true })
      return
    }
    onAdd(hex)
  }
  field.addEventListener('input', () => {
    const hex = hexFromText(field.value)
    if (!hex) return
    field.removeAttribute('aria-invalid')
    hsv = hexToHsv(hex)
    paint(true)
  })
  field.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return
    event.preventDefault()
    commit()
  })

  /** A press on a slider takes its knob to the pointer and follows it until the release. `frame` is
   *  the box the knob travels, which for the strip is its track inside the ends. */
  const follow = (target: HTMLElement, frame: HTMLElement, onPos: (x: number, y: number) => void): void => {
    target.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return
      event.preventDefault()
      target.focus({ preventScroll: true })
      const at = (e: PointerEvent): void => {
        const r = frame.getBoundingClientRect()
        const x = clamp01((e.clientX - r.left) / (r.width || 1))
        onPos(isRtl(target) ? 1 - x : x, clamp01((e.clientY - r.top) / (r.height || 1)))
        paint()
      }
      target.dataset.qcDragging = 'true'
      at(event)
      dragUntilRelease(at, () => delete target.dataset.qcDragging)
    })
  }
  follow(area, area, (x, y) => {
    hsv = { ...hsv, s: x, v: 1 - y }
  })
  follow(strip, stripTravel, (_x, y) => {
    hsv = { ...hsv, h: y * 360 }
  })

  // The area moves saturation sideways and brightness up and down; Home is white and End is black.
  // The strip's arrows move the hue up and down its range, Home and End reach its ends.
  area.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      commit()
      return
    }
    const size = event.shiftKey ? 0.1 : 0.02
    const across = isRtl(area) ? -size : size
    if (event.key === 'ArrowRight') hsv = { ...hsv, s: clamp01(hsv.s + across) }
    else if (event.key === 'ArrowLeft') hsv = { ...hsv, s: clamp01(hsv.s - across) }
    else if (event.key === 'ArrowUp') hsv = { ...hsv, v: clamp01(hsv.v + size) }
    else if (event.key === 'ArrowDown') hsv = { ...hsv, v: clamp01(hsv.v - size) }
    else if (event.key === 'Home') hsv = { ...hsv, s: 0, v: 1 }
    else if (event.key === 'End') hsv = { ...hsv, s: 1, v: 0 }
    else return
    event.preventDefault()
    paint()
  })
  strip.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault()
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
    paint()
  })
  paint()

  const element = el(
    'div',
    { class: 'qc-drawing-custom' },
    el('div', { class: 'qc-drawing-custom-row' }, well, el('span', { class: 'qc-drawing-hex-wrap' }, el('span', { class: 'qc-drawing-hex-mark', 'aria-hidden': 'true', text: '#' }), field), add),
    el('div', { class: 'qc-drawing-custom-tracks' }, area, strip),
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
  /** The colors this viewer has mixed, newest first, and how a new one joins them. The control reads
   *  and writes through this rather than holding a store: what a chart remembers is the chart's to
   *  keep. Absent, the palette offers no mixed colors and the mixer still applies. */
  recents?: ColorMemory | null
  /** 0..1 opacity; omit to leave the opacity out. A value whose notation carries no alpha the
   *  control reads has no opacity, and its declaration stands until a valid edit. */
  opacity?: number
  onOpacity?(value: number): void
  /** Told when the palette turns over to the custom editor and back, for a surface that stands rows
   *  of its own beside it and stands them down while the editor shows. */
  onMixing?(mixing: boolean): void
}

export interface PaletteHandle extends ControlHandle {
  /** The value, and the opacity where the consumer supplies one, without a rebuild. */
  update(value: string, opacity?: number): void
}

/** The palette: the offered colors on a ten-wide grid (the greys and the ten hues, then six ramps of
 *  them), a rule, the colors this viewer mixed with the plus after them, and the opacity beneath.
 *
 *  The grid is one stop for the keyboard: the arrows move along a row and between rows, Home and
 *  End reach its first and last cells, and Enter or Space picks. The chosen color is ringed, and a
 *  pick moves the ring at once. The plus turns the palette over to the custom editor at the same
 *  anchor, and adding a color there brings the palette back with the color remembered and chosen. */
export function createColorPalette(t: ChartTranslate, options: PaletteOptions): PaletteHandle {
  let value = options.value
  const memory = options.recents ?? null
  const grid = el('div', { class: 'qc-drawing-swatches', role: 'group', 'aria-label': t('drawing.pickColor') })
  const swatch = (c: string): HTMLButtonElement => {
    const b = el('button', { type: 'button', class: 'qc-drawing-swatch', 'aria-label': t('drawing.colorSwatch', { hex: c }) }) as HTMLButtonElement
    b.addEventListener('click', () => pick(c))
    b.style.setProperty('--qcd-swatch', c)
    b.dataset.qcColor = c
    // The palest cell of all would otherwise have no edge against a light panel.
    if (c === GREY_RAMP[0]) b.dataset.qcPale = 'true'
    return b
  }
  /** A block of cells, ten to a row. A trailing control is laid out as one more cell, so it takes the
   *  next free place in the last row rather than standing on a row of its own. */
  const blockOf = (cells: readonly HTMLElement[], className = 'qc-drawing-swatch-block'): HTMLElement => {
    const block = el('div', { class: className })
    for (let i = 0; i < cells.length; i += COLUMNS) block.appendChild(el('div', { class: 'qc-drawing-swatch-row' }, ...cells.slice(i, i + COLUMNS)))
    return block
  }
  for (const rows of SWATCH_BLOCKS) grid.appendChild(blockOf(rows.flat().map(swatch)))
  grid.appendChild(el('div', { class: 'qc-drawing-separator', role: 'presentation' }))

  // The plus stands after the mixed colors, in the next free cell: it is one more place a viewer's
  // colors come from, not a control parked under them.
  const plus = button({ class: 'qc-drawing-swatch-plus', label: t('drawing.addCustomColor'), onClick: () => openMixer() })
  plus.setAttribute('aria-haspopup', 'true')
  let mixed: readonly string[] | null = null
  let mixedBlock = blockOf([plus], 'qc-drawing-swatch-block qc-drawing-swatch-block--mixed')
  grid.appendChild(mixedBlock)
  /** Lay out the mixed colors again when the list has moved, and only then: a block rebuilt under a
   *  focused cell would drop the keyboard. */
  const paintMixed = (): void => {
    const list = (memory?.list() ?? []).slice(0, RECENT_COLOR_LIMIT)
    if (mixed && list.length === mixed.length && list.every((c, i) => c === mixed![i])) return
    mixed = list
    const next = blockOf([...list.map(swatch), plus], 'qc-drawing-swatch-block qc-drawing-swatch-block--mixed')
    mixedBlock.replaceWith(next)
    mixedBlock = next
  }

  const cells = (): HTMLElement[] => [...grid.querySelectorAll<HTMLElement>('.qc-drawing-swatch, .qc-drawing-swatch-plus')]
  /** The grid's one tab stop: the chosen cell, or the first. */
  const markChosen = (): void => {
    const base = hexOf(value)
    let stop: HTMLElement | null = null
    for (const cell of cells()) {
      const chosen = cell.dataset.qcColor === base
      if (chosen) {
        cell.dataset.qcActive = 'true'
        stop ??= cell
      } else delete cell.dataset.qcActive
      if (cell.dataset.qcColor) cell.setAttribute('aria-pressed', String(chosen))
    }
    const focused = cells().find((cell) => cell === document.activeElement)
    rove(focused ?? stop ?? cells()[0] ?? null)
  }
  const rove = (to: HTMLElement | null): void => {
    for (const cell of cells()) cell.tabIndex = cell === to ? 0 : -1
  }
  const pick = (c: string): void => {
    value = c
    markChosen()
    options.onPick(c)
  }
  grid.addEventListener('focusin', (event) => {
    const cell = event.target as HTMLElement
    if (cells().includes(cell)) rove(cell)
  })
  grid.addEventListener('keydown', (event) => {
    const list = cells()
    const at = list.indexOf(document.activeElement as HTMLElement)
    if (at < 0) return
    const rtl = isRtl(grid)
    let to = at
    if (event.key === 'ArrowRight') to = at + (rtl ? -1 : 1)
    else if (event.key === 'ArrowLeft') to = at + (rtl ? 1 : -1)
    else if (event.key === 'ArrowDown') to = at + COLUMNS < list.length ? at + COLUMNS : Math.floor(at / COLUMNS) < Math.floor((list.length - 1) / COLUMNS) ? list.length - 1 : at
    else if (event.key === 'ArrowUp') to = at - COLUMNS >= 0 ? at - COLUMNS : at
    else if (event.key === 'Home') to = 0
    else if (event.key === 'End') to = list.length - 1
    else return
    event.preventDefault()
    const target = list[Math.min(list.length - 1, Math.max(0, to))]!
    rove(target)
    target.focus({ preventScroll: true })
  })

  const element = el('div', { class: 'qc-drawing-palette' }, grid)

  let opacity: OpacityHandle | null = null
  let opacityBlock: HTMLElement | null = null
  if (options.opacity !== undefined && options.onOpacity) {
    opacity = createOpacitySlider(t, hexOf(value), options.opacity, options.onOpacity)
    opacityBlock = el('div', { class: 'qc-drawing-palette-opacity' }, el('div', { class: 'qc-drawing-section-title', text: t('drawing.opacity') }), opacity.element)
    element.appendChild(opacityBlock)
  }

  // The mixer TURNS THE PALETTE OVER rather than growing it: the grid and the opacity stand down,
  // the editor takes their place at the same anchor, and adding a color brings them back with the
  // new one remembered and chosen.
  let mixer: CustomColorHandle | null = null
  const closeMixer = (): void => {
    if (!mixer) return
    mixer.destroy()
    mixer = null
    grid.hidden = false
    if (opacityBlock) opacityBlock.hidden = false
    options.onMixing?.(false)
  }
  const openMixer = (): void => {
    if (mixer) return
    mixer = createCustomColorPicker(t, value, (hex) => {
      memory?.add(hex)
      closeMixer()
      paintMixed()
      pick(hex)
      ;(mixedBlock.querySelector<HTMLElement>(`[data-qc-color="${hex}"]`) ?? grid.querySelector<HTMLElement>('[data-qc-active="true"]') ?? plus).focus({ preventScroll: true })
    })
    grid.hidden = true
    if (opacityBlock) opacityBlock.hidden = true
    element.appendChild(mixer.element)
    options.onMixing?.(true)
    focusFirst(mixer.element)
  }

  paintMixed()
  markChosen()
  return {
    element,
    update(next, nextOpacity) {
      value = next
      paintMixed()
      markChosen()
      mixer?.update(next)
      if (opacity && nextOpacity !== undefined) opacity.update(hexOf(next), nextOpacity)
    },
    destroy() {
      closeMixer()
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
  /** Close the panel as soon as a swatch is picked. */
  closeOnPick?: boolean
  /** The colors this viewer mixed, offered beside the palette's own. */
  recents?: ColorMemory | null
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
      recents: options.recents ?? null,
      ...(opacity !== undefined && options.onOpacity ? { opacity, onOpacity: options.onOpacity } : {}),
    })
    panel.appendChild(palette.element)
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

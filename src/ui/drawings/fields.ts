// The field primitives the settings surfaces are built from: a labeled row, a checkbox row, a
// dropdown, a number field with its stepper, the color swatch button and the palette it opens,
// the custom color panel, the opacity slider, a line-end picker, the dialog's tab strip, and one
// interval-visibility row. Each builds real elements, reads its words from the chart's language,
// and reports a value; none holds chart state.
import type { LineStyle } from '../../internal/drawings/index'
import { alphaOf, withAlpha } from '../../internal/drawings/index'
import type { ChartTranslate } from '../../i18n'
import { button, dismissOnOutside, el, focusFirst, menuKeys, ownPointer, placePanel } from './dom'
import { hexOf, hexToHsv, hsvToHex, isHex, SWATCH_ROWS } from './color'
import { iconSvg } from './icons'
import { trackOverlay } from './overlays'

/** A settings row: the label in a fixed column, the controls left-aligned beside it. */
export function row(label: string, ...controls: HTMLElement[]): HTMLElement {
  const cell = el('div', { class: 'qc-drawing-row-controls' }, ...controls)
  return el('div', { class: 'qc-drawing-row' }, el('span', { class: 'qc-secondary qc-drawing-row-label', text: label }), cell)
}

/** A boolean row: a checkbox and its label, the whole line one click target. */
export function toggleRow(label: string, value: boolean, onChange: (v: boolean) => void, disabled = false): HTMLElement {
  const input = el('input', { type: 'checkbox', class: 'qc-drawing-check', 'aria-label': label }) as HTMLInputElement
  input.checked = value
  input.disabled = disabled
  input.addEventListener('change', () => onChange(input.checked))
  return el('label', { class: 'qc-drawing-toggle', 'data-disabled': disabled ? 'true' : undefined }, input, el('span', { text: label }))
}

/** A checkbox on its own, for a row that pairs it with other controls. */
export function checkbox(label: string, value: boolean, onChange: (v: boolean) => void): HTMLInputElement {
  const input = el('input', { type: 'checkbox', class: 'qc-drawing-check', 'aria-label': label }) as HTMLInputElement
  input.checked = value
  input.addEventListener('change', () => onChange(input.checked))
  return input
}

/** An enumerated value as a native select styled as a chart field: the value is the id the drawing
 *  stores, the label is what the row reads. */
export function dropdown<T extends string>(label: string, options: readonly T[], value: T, labels: (v: T) => string, onChange: (v: T) => void): HTMLSelectElement {
  const select = el('select', { class: 'qc-field qc-drawing-select', 'aria-label': label }) as HTMLSelectElement
  for (const option of options) select.appendChild(el('option', { value: option, text: labels(option) }))
  select.value = value
  select.addEventListener('change', () => onChange(select.value as T))
  return select
}

/** A number field with its own up and down steppers, clamped to the bounds, rounded to the step's
 *  own precision so float steps never accumulate dust. */
export function numberInput(
  t: ChartTranslate,
  props: { label: string; value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; width?: 'short' | 'medium' | 'wide' },
): HTMLElement {
  const input = el('input', { type: 'number', class: 'qc-field qc-drawing-number', 'aria-label': props.label }) as HTMLInputElement
  input.value = Number.isFinite(props.value) ? String(props.value) : ''
  input.step = props.step === undefined ? 'any' : String(props.step)
  if (props.min !== undefined) input.min = String(props.min)
  if (props.max !== undefined) input.max = String(props.max)
  input.addEventListener('change', () => {
    // An emptied or unparseable field keeps the previous value rather than reporting zero.
    if (input.value.trim() === '') return
    const v = Number(input.value)
    if (Number.isFinite(v)) props.onChange(v)
  })
  const stepBy = (dir: 1 | -1): void => {
    const s = props.step ?? 1
    let v = (Number.isFinite(Number(input.value)) && input.value !== '' ? Number(input.value) : 0) + dir * s
    if (props.min !== undefined) v = Math.max(props.min, v)
    if (props.max !== undefined) v = Math.min(props.max, v)
    const decimals = String(s).split('.')[1]?.length ?? 0
    const next = Number(v.toFixed(decimals))
    input.value = String(next)
    props.onChange(next)
  }
  const steppers = el(
    'span',
    { class: 'qc-drawing-steppers' },
    button({ class: 'qc-drawing-stepper', label: t('drawing.increase'), html: iconSvg('chevronDown', 14), onClick: () => stepBy(1) }),
    button({ class: 'qc-drawing-stepper', label: t('drawing.decrease'), html: iconSvg('chevronDown', 14), onClick: () => stepBy(-1) }),
  )
  steppers.firstElementChild?.setAttribute('data-up', 'true')
  for (const b of steppers.querySelectorAll('button')) b.tabIndex = -1
  return el('span', { class: 'qc-drawing-number-wrap', 'data-width': props.width ?? 'medium' }, input, steppers)
}

/** The opacity control: a range over a track that fades into the color, with a percent readout. */
export function opacitySlider(t: ChartTranslate, color: string, value: number, onChange: (v: number) => void): HTMLElement {
  const input = el('input', { type: 'range', min: '0', max: '100', class: 'qc-drawing-opacity', 'aria-label': t('drawing.opacity') }) as HTMLInputElement
  input.value = String(Math.round(value * 100))
  input.style.setProperty('--qcd-swatch', hexOf(color))
  const readout = el('span', { class: 'qc-drawing-opacity-readout', text: `${Math.round(value * 100)}%` })
  input.addEventListener('input', () => {
    readout.textContent = `${input.value}%`
    onChange(Number(input.value) / 100)
  })
  return el('div', { class: 'qc-drawing-opacity-row' }, input, readout)
}

/** The custom color panel behind the palette's plus cell: a live swatch, a hex field and an Add
 *  button on one row, then a saturation and value square beside a hue strip. */
export function customColorPicker(t: ChartTranslate, initial: string, onAdd: (hex: string) => void): HTMLElement {
  const start = isHex(hexOf(initial)) ? hexOf(initial) : SWATCH_ROWS[1]![6]!
  let hsv = hexToHsv(start)
  const hex = (): string => hsvToHex(hsv.h, hsv.s, hsv.v)

  const swatch = el('span', { class: 'qc-drawing-custom-swatch' })
  const field = el('input', { class: 'qc-drawing-hex', 'aria-label': t('drawing.hexColor'), spellcheck: 'false' }) as HTMLInputElement
  const add = button({ class: 'qc-button qc-drawing-add', label: t('drawing.add'), text: t('drawing.add'), onClick: () => isHex(field.value) && onAdd(`#${field.value.toLowerCase()}`) })
  const square = el('div', { class: 'qc-drawing-sv', role: 'presentation' })
  const squareDot = el('span', { class: 'qc-drawing-sv-dot' })
  const strip = el('div', { class: 'qc-drawing-hue', role: 'presentation' })
  const stripDot = el('span', { class: 'qc-drawing-hue-dot' })
  square.appendChild(squareDot)
  strip.appendChild(stripDot)

  /** Repaint from the HSV state. A paint that follows typing leaves the field as typed, so a
   *  half-typed hex is never overwritten under the trader's hands. */
  const paint = (typed = false): void => {
    const h = hex()
    swatch.style.setProperty('--qcd-swatch', h)
    square.style.setProperty('--qcd-hue', hsvToHex(hsv.h, 1, 1))
    squareDot.style.left = `${hsv.s * 100}%`
    squareDot.style.top = `${(1 - hsv.v) * 100}%`
    stripDot.style.top = `${(hsv.h / 360) * 100}%`
    if (!typed) field.value = h.slice(1)
    add.disabled = !isHex(field.value)
  }
  field.addEventListener('input', () => {
    field.value = field.value.replace(/[^0-9a-f]/gi, '').slice(0, 6)
    if (isHex(field.value)) hsv = hexToHsv(`#${field.value}`)
    paint(true)
  })
  field.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && isHex(field.value)) onAdd(`#${field.value.toLowerCase()}`)
  })
  const drag = (track: HTMLElement, onPos: (x: number, y: number) => void) => (e: PointerEvent) => {
    const move = (clientX: number, clientY: number): void => {
      const r = track.getBoundingClientRect()
      onPos(Math.min(1, Math.max(0, (clientX - r.left) / (r.width || 1))), Math.min(1, Math.max(0, (clientY - r.top) / (r.height || 1))))
      paint()
    }
    move(e.clientX, e.clientY)
    const onMove = (ev: PointerEvent): void => move(ev.clientX, ev.clientY)
    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }
  square.addEventListener('pointerdown', drag(square, (x, y) => (hsv = { ...hsv, s: x, v: 1 - y })))
  strip.addEventListener('pointerdown', drag(strip, (_x, y) => (hsv = { ...hsv, h: y * 360 })))
  paint()

  return el(
    'div',
    { class: 'qc-drawing-custom' },
    el('div', { class: 'qc-drawing-custom-row' }, swatch, el('span', { class: 'qc-drawing-hex-wrap' }, el('span', { class: 'qc-muted', text: '#' }), field), add),
    el('div', { class: 'qc-drawing-custom-tracks' }, square, strip),
  )
}

export interface SwatchesOptions {
  value: string
  onPick(color: string): void
  /** 0..1 opacity; omit to hide the slider row. */
  opacity?: number
  onOpacity?(value: number): void
}

/** The palette: square swatches on a ten-wide grid, a plus cell that opens the custom panel in
 *  place, and the opacity slider beneath. */
export function colorSwatches(t: ChartTranslate, options: SwatchesOptions): HTMLElement {
  const base = hexOf(options.value)
  const grid = el('div', { class: 'qc-drawing-swatches', role: 'group', 'aria-label': t('drawing.pickColor') })
  for (const swatchRow of SWATCH_ROWS) {
    const line = el('div', { class: 'qc-drawing-swatch-row' })
    for (const c of swatchRow) {
      const b = button({ class: 'qc-drawing-swatch', label: t('drawing.colorSwatch', { hex: c }), onClick: () => options.onPick(c) })
      b.style.setProperty('--qcd-swatch', c)
      if (base === c) b.dataset.qcActive = 'true'
      line.appendChild(b)
    }
    grid.appendChild(line)
  }
  let custom: HTMLElement | null = null
  const plus = button({ class: 'qc-drawing-swatch qc-drawing-swatch-plus', label: t('drawing.customColor'), html: iconSvg('plus', 9) })
  plus.setAttribute('aria-expanded', 'false')
  plus.addEventListener('click', () => {
    if (custom) {
      custom.remove()
      custom = null
      plus.setAttribute('aria-expanded', 'false')
      return
    }
    custom = customColorPicker(t, options.value, (hex) => {
      options.onPick(hex)
      custom?.remove()
      custom = null
      plus.setAttribute('aria-expanded', 'false')
    })
    grid.appendChild(custom)
    plus.setAttribute('aria-expanded', 'true')
    focusFirst(custom)
  })
  grid.appendChild(el('div', { class: 'qc-drawing-swatch-row' }, plus))
  const root = el('div', { class: 'qc-drawing-palette' }, grid)
  if (options.opacity !== undefined && options.onOpacity) {
    root.appendChild(el('div', { class: 'qc-drawing-palette-opacity' }, el('span', { class: 'qc-muted', text: t('drawing.opacity') }), opacitySlider(t, base, options.opacity, options.onOpacity)))
  }
  return root
}

/** A floating panel beside its anchor inside the chart box, closed on an outside press or Escape.
 *  Returns its close, which the caller runs when the surface that opened it goes. */
export function openPopover(box: HTMLElement, anchor: HTMLElement, content: HTMLElement, mode: 'side' | 'below', onClose?: () => void): () => void {
  const panel = el('div', { class: 'qc-overlay qc-drawing-popover', 'data-role': 'drawing-popover' }, content)
  ownPointer(panel)
  box.appendChild(panel)
  placePanel(panel, anchor, box, mode)
  let closed = false
  const close = (): void => {
    if (closed) return
    closed = true
    untrack()
    undismiss()
    panel.remove()
    anchor.setAttribute('aria-expanded', 'false')
    onClose?.()
  }
  // The box's own teardown closes whatever is still open, so no document listener outlives it.
  const untrack = trackOverlay(box, close)
  const undismiss = dismissOnOutside(panel, anchor, () => {
    close()
    anchor.focus({ preventScroll: true })
  })
  anchor.setAttribute('aria-expanded', 'true')
  return close
}

/** The stroke rendered as segments: a bar for solid, four dashes, or a run of square dots, at the
 *  thickness. Divs rather than a dashed stroke, so the pattern never clips at an edge. */
export function strokeSegments(thickness: number, lineStyle: LineStyle = 'solid', color?: string): HTMLElement {
  const t = Math.max(1, Math.min(4, Math.round(thickness)))
  let segs: { w: number; h: number }[]
  if (lineStyle === 'dotted') {
    const side = t + 1
    const gap = side === 4 ? 2 : 3
    segs = Array.from({ length: Math.floor((30 + gap) / (side + gap)) }, () => ({ w: side, h: side }))
  } else if (lineStyle === 'dashed') segs = Array.from({ length: 4 }, () => ({ w: 5, h: t }))
  else segs = [{ w: 30, h: t }]
  const root = el('span', { class: 'qc-drawing-stroke', 'aria-hidden': 'true', 'data-dotted': lineStyle === 'dotted' && t === 3 ? 'tight' : undefined })
  for (const seg of segs) {
    const s = el('span', { class: 'qc-drawing-stroke-seg' })
    s.style.width = `${seg.w}px`
    s.style.height = `${seg.h}px`
    if (color) s.style.setProperty('--qcd-swatch', color)
    root.appendChild(s)
  }
  return root
}

export interface SwatchButtonOptions {
  label: string
  value: string
  onPick(color: string): void
  /** Explicit opacity model. Omitted, the slider edits the alpha carried inside the color value. */
  opacity?: number
  onOpacity?(value: number): void
  /** Wired, the face grows a stroke preview and the popover gains the thickness row. */
  thickness?: number
  onThickness?(value: number): void
  /** Wired, the popover gains the line-style row. */
  lineStyle?: LineStyle
  onLineStyle?(value: LineStyle): void
}

/** The color-with-thickness control: a swatch well and, for a stroke, the stroke drawn at its own
 *  thickness beside it. The popover carries the palette, the opacity, and the stroke rows. */
export function swatchButton(t: ChartTranslate, box: HTMLElement, options: SwatchButtonOptions): HTMLButtonElement {
  const alpha = options.opacity ?? alphaOf(options.value)
  const hasStroke = options.thickness !== undefined && options.onThickness !== undefined
  const well = el('span', { class: 'qc-drawing-well' }, el('span', { class: 'qc-drawing-well-fill' }))
  ;(well.firstElementChild as HTMLElement).style.setProperty('--qcd-swatch', options.value)
  ;(well.firstElementChild as HTMLElement).style.opacity = String(options.opacity ?? 1)
  const b = button({ class: 'qc-field qc-drawing-swatch-button', label: options.label })
  b.setAttribute('aria-haspopup', 'dialog')
  b.setAttribute('aria-expanded', 'false')
  b.appendChild(well)
  if (hasStroke) b.appendChild(strokeSegments(options.thickness!, options.lineStyle, options.value))
  let close: (() => void) | null = null
  b.addEventListener('click', () => {
    if (close) {
      close()
      return
    }
    const content = el('div', { class: 'qc-drawing-swatch-panel' })
    content.appendChild(
      colorSwatches(t, {
        value: options.value,
        onPick: (c) => {
          // A pick keeps the alpha the value carries. Picking a color leaves a popover that also
          // edits thickness and style open, because those edits usually come together.
          options.onPick(options.onOpacity ? c : alpha < 1 ? withAlpha(c, alpha) : c)
          if (!hasStroke && !options.onLineStyle) close?.()
        },
        opacity: alpha,
        onOpacity: options.onOpacity ?? ((v) => options.onPick(withAlpha(options.value, v))),
      }),
    )
    if (hasStroke) {
      const rowEl = el('div', { class: 'qc-drawing-option-row', role: 'group', 'aria-label': t('drawing.thickness') })
      for (const w of [1, 2, 3, 4]) {
        const opt = button({ class: 'qc-button qc-drawing-option', label: t('drawing.thicknessValue', { n: w }), onClick: () => options.onThickness!(w) })
        opt.appendChild(strokeSegments(w))
        if (Math.min(4, options.thickness!) === w) opt.dataset.qcActive = 'true'
        rowEl.appendChild(opt)
      }
      content.append(el('span', { class: 'qc-muted', text: t('drawing.thickness') }), rowEl)
    }
    if (options.lineStyle !== undefined && options.onLineStyle) {
      const names: Record<LineStyle, string> = { solid: t('drawing.lineSolid'), dashed: t('drawing.lineDashed'), dotted: t('drawing.lineDotted') }
      const rowEl = el('div', { class: 'qc-drawing-option-row', role: 'group', 'aria-label': t('drawing.lineStyle') })
      for (const s of ['solid', 'dashed', 'dotted'] as const) {
        const opt = button({ class: 'qc-button qc-drawing-option', label: t('drawing.lineStyleValue', { name: names[s] }), onClick: () => options.onLineStyle!(s) })
        opt.appendChild(strokeSegments(options.thickness ?? 1, s))
        if (options.lineStyle === s) opt.dataset.qcActive = 'true'
        rowEl.appendChild(opt)
      }
      content.append(el('span', { class: 'qc-muted', text: t('drawing.lineStyle') }), rowEl)
    }
    close = openPopover(box, b, content, 'below', () => {
      close = null
    })
    focusFirst(content)
  })
  return b
}

/** A line-end picker for one side: the face is the current end drawn as its own icon, and the
 *  menu offers the two ends by icon and name. */
export function lineEndButton(t: ChartTranslate, box: HTMLElement, side: 'left' | 'right', value: 'normal' | 'arrow', onChange: (v: 'normal' | 'arrow') => void): HTMLButtonElement {
  const flip = side === 'right' ? ' transform="scale(-1,1) translate(-28,0)"' : ''
  const face = (v: 'normal' | 'arrow'): string =>
    `<svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true"><g${flip}>${
      v === 'normal' ? '<path stroke="currentColor" d="M8.5 13.5a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm0 0H24"/>' : '<path stroke="currentColor" d="M4.5 13.5H24m-19.5 0L8 17m-3.5-3.5L8 10"/>'
    }</g></svg>`
  const b = button({ class: 'qc-field qc-drawing-line-end', label: t(side === 'left' ? 'drawing.leftEnd' : 'drawing.rightEnd'), html: face(value) })
  b.setAttribute('aria-haspopup', 'listbox')
  b.setAttribute('aria-expanded', 'false')
  let close: (() => void) | null = null
  b.addEventListener('click', () => {
    if (close) {
      close()
      return
    }
    const list = el('div', { class: 'qc-drawing-menu', role: 'listbox', 'aria-label': b.getAttribute('aria-label') ?? '' })
    for (const v of ['normal', 'arrow'] as const) {
      const opt = el('button', { type: 'button', class: 'qc-menu-row', role: 'option', 'aria-selected': String(v === value) })
      opt.innerHTML = face(v)
      opt.appendChild(el('span', { class: 'qc-menu-label', text: t(v === 'normal' ? 'drawing.lineEndNormal' : 'drawing.lineEndArrow') }))
      opt.addEventListener('click', () => {
        onChange(v)
        close?.()
      })
      list.appendChild(opt)
    }
    const unkeys = menuKeys(list, () => [...list.querySelectorAll<HTMLElement>('[role="option"]')])
    close = openPopover(box, b, list, 'below', () => {
      unkeys()
      close = null
    })
    focusFirst(list)
  })
  return b
}

/** The dialog's page strip: one tab per page id, the label read separately, the active one marked.
 *  With `ids`, each tab carries its own id and names the panel it controls. */
export function dialogTabs(tabs: readonly string[], value: string, labels: (id: string) => string, onChange: (id: string) => void, ids?: { tab: (id: string) => string; panel: string }): HTMLElement {
  const strip = el('div', { class: 'qc-drawing-tabs', role: 'tablist' })
  for (const tab of tabs) {
    const b = el('button', { type: 'button', class: 'qc-drawing-tab', role: 'tab', 'aria-selected': String(tab === value), 'data-tab': tab }, el('span', { text: labels(tab) }), el('span', { class: 'qc-drawing-tab-rail' }))
    if (ids) {
      b.id = ids.tab(tab)
      b.setAttribute('aria-controls', ids.panel)
    }
    b.tabIndex = tab === value ? 0 : -1
    b.addEventListener('click', () => onChange(tab))
    strip.appendChild(b)
  }
  menuKeys(strip, () => [...strip.querySelectorAll<HTMLElement>('[role="tab"]')])
  strip.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') (document.activeElement as HTMLElement | null)?.click()
  })
  return strip
}

/** One interval-visibility bucket: the checkbox in the label cell, then from, a two-thumb range,
 *  and to. The from and to writes clamp against each other, so the boxes can never cross. */
export function visibilityRangeRow(
  t: ChartTranslate,
  props: { label: string; range: { on: boolean; from: number; to: number }; max: number; disabled?: boolean; onChange(next: { on: boolean; from: number; to: number }): void },
): HTMLElement {
  const { range, max } = props
  const check = checkbox(t('drawing.rowVisible', { name: props.label }), range.on, (v) => props.onChange({ ...range, on: v }))
  check.disabled = !!props.disabled
  const from = numberInput(t, { label: t('drawing.rangeFrom'), value: range.from, min: 1, max, step: 1, width: 'short', onChange: (v) => props.onChange({ ...range, from: Math.min(v, range.to) }) })
  const to = numberInput(t, { label: t('drawing.rangeTo'), value: range.to, min: 1, max, step: 1, width: 'short', onChange: (v) => props.onChange({ ...range, to: Math.max(v, range.from) }) })
  const lo = el('input', { type: 'range', min: '1', max: String(max), class: 'qc-drawing-dual-input', 'aria-label': t('drawing.rangeFrom') }) as HTMLInputElement
  const hi = el('input', { type: 'range', min: '1', max: String(max), class: 'qc-drawing-dual-input', 'aria-label': t('drawing.rangeTo') }) as HTMLInputElement
  lo.value = String(range.from)
  hi.value = String(range.to)
  lo.addEventListener('input', () => props.onChange({ ...range, from: Math.min(Number(lo.value), range.to) }))
  hi.addEventListener('input', () => props.onChange({ ...range, to: Math.max(Number(hi.value), range.from) }))
  const fill = el('span', { class: 'qc-drawing-dual-fill' })
  const pct = (v: number): number => ((v - 1) / (max - 1 || 1)) * 100
  fill.style.left = `${pct(Math.min(range.from, range.to))}%`
  fill.style.right = `${100 - pct(Math.max(range.from, range.to))}%`
  const dual = el('div', { class: 'qc-drawing-dual' }, el('span', { class: 'qc-drawing-dual-track' }), fill, lo, hi)
  return el(
    'div',
    { class: 'qc-drawing-visibility-row' },
    el('label', { class: 'qc-drawing-toggle' }, check, el('span', { text: props.label })),
    el('div', { class: 'qc-drawing-visibility-controls' }, from, dual, to),
  )
}

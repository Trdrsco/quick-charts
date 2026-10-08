// The field primitives the settings surfaces are built from: a labeled row, a checkbox row, a row
// whose label is a checkbox, a list button for one choice or several, a number field with its
// stepper, the color swatch button, a line-end picker, the dialog's tab strip, and one
// timeframe-visibility row. Each builds real elements, reads its words from the chart's language,
// and reports a value; none holds chart state.
//
// A settings page is a two-column grid: the labels stand in a column as wide as the widest of them,
// and every row's controls start on one line beside it. A row is the grid's, so its element lays out
// nothing of its own; a checkbox row spans both columns.
//
// The palette, the custom color editor and the opacity slider are not built here. They are the
// package's one shared control in `ui/controls/color`, which the chart settings menu and the
// indicator editors mount from the same modules; this file keeps only the drawing-domain framing
// around it, including the thickness and line-style rows a drawing's color popover also carries.
import type { LineStyle } from '../../internal/drawings/index'
import { alphaOf, withAlpha } from '../../internal/drawings/index'
import type { ChartTranslate } from '../../i18n'
import { createColorControl, type ColorControlHandle } from '../controls/color'
import { button, dismissOnOutside, el, menuKeys, ownPointer, placePanel, type PanelPlacement } from './dom'
import { trackOverlay } from '../controls/overlays'
import { selectChevron } from '../controls/select'
import type { IconResolver } from '../icons/resolver'

/** A settings row: the label in the label column, the controls on one line beside it. */
export function row(label: string, ...controls: HTMLElement[]): HTMLElement {
  const cell = el('div', { class: 'qc-drawing-row-controls' }, ...controls)
  return el('div', { class: 'qc-drawing-row' }, el('span', { class: 'qc-drawing-row-label', text: label }), cell)
}

/** A boolean row: a checkbox and its label, the whole line one click target, across both columns. */
export function toggleRow(label: string, value: boolean, onChange: (v: boolean) => void, disabled = false): HTMLElement {
  const input = el('input', { type: 'checkbox', class: 'qc-checkbox', 'aria-label': label }) as HTMLInputElement
  input.checked = value
  input.disabled = disabled
  input.addEventListener('change', () => onChange(input.checked))
  return el('label', { class: 'qc-drawing-toggle', 'data-disabled': disabled ? 'true' : undefined }, input, el('span', { text: label }))
}

/** A row whose label is a checkbox: it switches what the controls beside it set, such as a
 *  background and its color, or a timeframe and its range. */
export function checkRow(label: string, value: boolean, onChange: (v: boolean) => void, controls: readonly HTMLElement[], disabled = false): HTMLElement {
  const toggle = toggleRow(label, value, onChange, disabled)
  toggle.classList.add('qc-drawing-row-label')
  return el('div', { class: 'qc-drawing-row qc-drawing-row--checked' }, toggle, el('div', { class: 'qc-drawing-row-controls' }, ...controls))
}

/** A row of controls across both columns, with no label of its own, such as the text's color,
 *  size and weight, or the text box itself. */
export function fullRow(...controls: HTMLElement[]): HTMLElement {
  return el('div', { class: 'qc-drawing-row-full' }, ...controls)
}

/** A section title across both columns, the group of rows under it named once. */
export function sectionTitle(text: string): HTMLElement {
  return el('div', { class: 'qc-dialog-heading qc-drawing-section', role: 'heading', 'aria-level': '3', text })
}

/** The room a group of rows keeps after it. */
export function groupGap(): HTMLElement {
  return el('div', { class: 'qc-drawing-group-gap', 'aria-hidden': 'true' })
}

/** A checkbox on its own, for a row that pairs it with other controls. */
export function checkbox(label: string, value: boolean, onChange: (v: boolean) => void): HTMLInputElement {
  const input = el('input', { type: 'checkbox', class: 'qc-checkbox', 'aria-label': label }) as HTMLInputElement
  input.checked = value
  input.addEventListener('change', () => onChange(input.checked))
  return input
}

/** How wide a list button stands: 100px for a short value, 150px, or 180px for a long one. */
export type SelectWidth = 'short' | 'medium' | 'wide'

/** A list button's face: the value's words, cut short with an ellipsis, then the chevron's slot. */
function listButton(icons: IconResolver, label: string, text: string, width: SelectWidth, popup: 'listbox' | 'menu'): HTMLButtonElement {
  const b = el('button', {
    type: 'button',
    class: 'qc-field qc-drawing-select',
    'aria-label': label,
    'aria-haspopup': popup,
    'aria-expanded': 'false',
    'data-width': width,
    ...(popup === 'listbox' ? { role: 'combobox' } : {}),
  }) as HTMLButtonElement
  b.append(el('span', { class: 'qc-drawing-select-value', text }), selectChevron(icons))
  // The arrows open the list from the keyboard, as they open a native select.
  b.addEventListener('keydown', (event) => {
    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && b.getAttribute('aria-expanded') !== 'true') {
      event.preventDefault()
      b.click()
    }
  })
  return b
}

/** A list the button opens stands as wide as the button, directly under it. */
function openList(box: HTMLElement, anchor: HTMLButtonElement, list: HTMLElement, rows: () => HTMLElement[], onClose: () => void): () => void {
  list.classList.add('qc-drawing-select-list')
  if (anchor.offsetWidth > 0) list.style.width = `${anchor.offsetWidth}px`
  const unkeys = menuKeys(list, rows)
  return openPopover(box, anchor, list, 'below', () => {
    unkeys()
    onClose()
  }, anchor, undefined, { gap: 0, className: 'qc-drawing-popover--list' })
}

/** One value of a few, as a list button in the chart's field box: the value is the id the drawing
 *  stores, the label is what the row reads. The list opens under the button, as wide as it, with
 *  the current value inverted, and closes on a pick. */
export function dropdown<T extends string>(
  icons: IconResolver,
  box: HTMLElement,
  label: string,
  options: readonly T[],
  value: T,
  labels: (v: T) => string,
  onChange: (v: T) => void,
  width: SelectWidth = 'short',
): HTMLButtonElement {
  const b = listButton(icons, label, labels(value), width, 'listbox')
  let close: (() => void) | null = null
  b.addEventListener('click', () => {
    if (close) {
      close()
      return
    }
    const list = el('div', { class: 'qc-drawing-menu qc-drawing-list', role: 'listbox', 'aria-label': label })
    for (const option of options) {
      const opt = el('button', { type: 'button', class: 'qc-menu-row qc-drawing-list-row', role: 'option', 'aria-selected': String(option === value) }, el('span', { class: 'qc-menu-label', text: labels(option) }))
      opt.addEventListener('click', () => {
        close?.()
        b.focus({ preventScroll: true })
        if (option !== value) onChange(option)
      })
      list.appendChild(opt)
    }
    const rows = (): HTMLElement[] => [...list.querySelectorAll<HTMLElement>('[role="option"]')]
    close = openList(box, b, list, rows, () => {
      close = null
    })
    ;(rows().find((r) => r.getAttribute('aria-selected') === 'true') ?? rows()[0])?.focus({ preventScroll: true })
  })
  return b
}

/** One of the choices a multiple list offers, with whether it is on and what turning it reports. */
export interface MultiChoice {
  label: string
  checked: boolean
  onChange(checked: boolean): void
}

/** Several switches behind one list button: each choice is a checkbox row of its own, the list
 *  stays open while the viewer ticks, and the button reads the choices that are on, or the empty
 *  word when none is. */
export function multiDropdown(icons: IconResolver, box: HTMLElement, props: { label: string; empty: string; choices: readonly MultiChoice[]; width?: SelectWidth }): HTMLButtonElement {
  const checked = props.choices.map((c) => c.checked)
  const summary = (): string => {
    const on = props.choices.filter((_, i) => checked[i]).map((c) => c.label)
    if (!on.length) return props.empty
    return on.map((text, i) => (i === 0 ? text : text.charAt(0).toLocaleLowerCase() + text.slice(1))).join(', ')
  }
  const b = listButton(icons, props.label, summary(), props.width ?? 'wide', 'menu')
  const face = b.querySelector<HTMLElement>('.qc-drawing-select-value')!
  let close: (() => void) | null = null
  b.addEventListener('click', () => {
    if (close) {
      close()
      return
    }
    const menu = el('div', { class: 'qc-drawing-menu qc-drawing-list', role: 'menu', 'aria-label': props.label })
    props.choices.forEach((choice, i) => {
      const mark = el('input', { type: 'checkbox', class: 'qc-checkbox', tabindex: '-1', 'aria-hidden': 'true' }) as HTMLInputElement
      mark.checked = checked[i]!
      const item = el(
        'div',
        { class: 'qc-menu-row qc-drawing-list-row qc-drawing-list-row--check', role: 'menuitemcheckbox', tabindex: '-1', 'aria-checked': String(checked[i]) },
        el('span', { class: 'qc-drawing-check-cell' }, mark),
        el('span', { class: 'qc-menu-label', text: choice.label }),
      )
      const toggle = (): void => {
        checked[i] = !checked[i]
        mark.checked = checked[i]!
        item.setAttribute('aria-checked', String(checked[i]))
        face.textContent = summary()
        choice.onChange(checked[i]!)
      }
      item.addEventListener('click', toggle)
      item.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        toggle()
      })
      menu.appendChild(item)
    })
    const rows = (): HTMLElement[] => [...menu.querySelectorAll<HTMLElement>('[role="menuitemcheckbox"]')]
    close = openList(box, b, menu, rows, () => {
      close = null
    })
    rows()[0]?.focus({ preventScroll: true })
  })
  return b
}

/** A number field with its own up and down steppers, clamped to the bounds, rounded to the step's
 *  own precision so float steps never accumulate dust. */
export function numberInput(
  t: ChartTranslate,
  icons: IconResolver,
  props: { label: string; value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; width?: 'short' | 'medium' | 'field' | 'wide' },
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
    button({ class: 'qc-drawing-stepper', label: t('drawing.increase'), icon: icons.icon('chevronDown18', 18), onClick: () => stepBy(1) }),
    button({ class: 'qc-drawing-stepper', label: t('drawing.decrease'), icon: icons.icon('chevronDown18', 18), onClick: () => stepBy(-1) }),
  )
  steppers.firstElementChild?.setAttribute('data-up', 'true')
  for (const b of steppers.querySelectorAll('button')) b.tabIndex = -1
  return el('span', { class: 'qc-drawing-number-wrap', 'data-width': props.width ?? 'medium' }, input, steppers)
}

/** Every popover open, in the order it opened. A panel raised from inside another one (a submenu
 *  beside its row) is part of what opened it: a press inside any LATER panel is not outside an
 *  earlier one, so the parent stays up while its child is used. */
const openPanels: HTMLElement[] = []

/** How a popover stands against its anchor: the room between them, and a class the panel wears. */
export interface PopoverOptions {
  gap?: number
  className?: string
}

/** A floating panel beside its anchor inside the chart box, closed on an outside press or Escape.
 *  Returns its close, which the caller runs when the surface that opened it goes. `refresh` is how
 *  the panel re-reads what it lists for a change it cannot observe on its own (the host's access
 *  policy answering differently); a panel without one is left as it is. */
export function openPopover(
  box: HTMLElement,
  anchor: HTMLElement,
  content: HTMLElement,
  mode: PanelPlacement,
  onClose?: () => void,
  place: HTMLElement = anchor,
  refresh?: () => void,
  options: PopoverOptions = {},
): () => void {
  const panel = el('div', { class: `qc-overlay qc-drawing-popover${options.className ? ` ${options.className}` : ''}`, 'data-role': 'drawing-popover' }, content)
  ownPointer(panel)
  box.appendChild(panel)
  openPanels.push(panel)
  const insideChild = (target: Node): boolean => openPanels.slice(openPanels.indexOf(panel) + 1).some((p) => p.contains(target))
  let closed = false
  const reposition = (): void => {
    if (closed || !place.isConnected) return
    placePanel(panel, place, box, mode, options.gap)
  }
  reposition()
  const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(reposition) : null
  resize?.observe(box)
  resize?.observe(place)
  const close = (): void => {
    if (closed) return
    closed = true
    openPanels.splice(openPanels.indexOf(panel), 1)
    resize?.disconnect()
    window.removeEventListener('resize', reposition)
    document.removeEventListener('scroll', reposition, true)
    untrack()
    undismiss()
    panel.remove()
    anchor.setAttribute('aria-expanded', 'false')
    onClose?.()
  }
  // The box's own teardown closes whatever is still open, so no document listener outlives it.
  const untrack = trackOverlay(box, close, refresh)
  const undismiss = dismissOnOutside(
    panel,
    anchor,
    () => {
      close()
      anchor.focus({ preventScroll: true })
    },
    insideChild,
  )
  window.addEventListener('resize', reposition)
  // The observer owns element-only reflows (a flex sibling docking or yielding); capture reaches
  // scrollable host ancestors because scroll does not bubble. No timeout or viewport heuristic
  // owns placement: every report re-reads the real anchor and chosen bounds.
  document.addEventListener('scroll', reposition, true)
  anchor.setAttribute('aria-expanded', 'true')
  return close
}

/** Raise a popover again from the control that opened it, so what it lists is built afresh by that
 *  control's own open: how a panel built once re-reads the host's access policy. A control that is
 *  now gone, hidden or disabled leaves the panel closed. The keyboard stays where it was: focus
 *  inside the old panel moves into the new one, and focus anywhere else is not taken. */
export function reopenPopover(close: () => void, content: HTMLElement, control: () => HTMLElement | null | undefined): void {
  const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null
  const inside = !!focused && content.contains(focused)
  close()
  const anchor = control()
  if (anchor?.isConnected && !anchor.closest('[hidden]') && !(anchor instanceof HTMLButtonElement && anchor.disabled)) anchor.click()
  if (!inside && focused?.isConnected) focused.focus({ preventScroll: true })
}

/** The stroke rendered as segments: a bar for solid, four dashes, or a run of square dots, at the
 *  thickness. Divs rather than a dashed stroke, so the pattern never clips at an edge. */
export function strokeSegments(thickness: number, lineStyle: LineStyle = 'solid', color?: string): HTMLElement {
  const t = thickness > 4
    ? Math.max(1, Math.min(8, Math.round(thickness / 12)))
    : Math.max(1, Math.min(4, Math.round(thickness)))
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
  /** A tool with its own width scale, such as the highlighter, supplies its actual pixel choices. */
  thicknessChoices?: readonly number[]
  onThickness?(value: number): void
  /** Wired, the popover gains the line-style row. */
  lineStyle?: LineStyle
  onLineStyle?(value: LineStyle): void
}

/** The color-with-thickness control: the shared color control, and for a stroke, the stroke drawn
 *  at its own thickness beside it. Its panel carries the palette, the opacity, and the stroke rows
 *  a drawing adds. The drawing surface owns the commit: every edit here patches at once, so the
 *  undo boundary stays the one the drawing document already keeps. */
export function swatchButton(t: ChartTranslate, box: HTMLElement, options: SwatchButtonOptions): HTMLButtonElement {
  const alpha = options.opacity ?? alphaOf(options.value)
  const hasStroke = options.thickness !== undefined && options.onThickness !== undefined
  const control: ColorControlHandle = createColorControl(t, {
    label: options.label,
    value: options.value,
    opacity: alpha,
    // A pick keeps the alpha the value carries. Picking a color leaves a panel that also edits
    // thickness and style open, because those edits usually come together.
    onPick: (c) => options.onPick(options.onOpacity ? c : alpha < 1 ? withAlpha(c, alpha) : c),
    onOpacity: options.onOpacity ?? ((v) => options.onPick(withAlpha(options.value, v))),
    closeOnPick: !hasStroke && !options.onLineStyle,
    extraRows: (content) => strokeRows(t, content, options),
    openPanel: (anchor, content, onClosed) => openPopover(box, anchor, content, 'below', onClosed, anchor, undefined, { gap: 0 }),
  })
  const b = control.element
  if (hasStroke) b.appendChild(strokeSegments(options.thickness!, options.lineStyle, options.value))
  return b
}

/** The thickness and line-style rows a drawing's color panel carries below the palette. */
function strokeRows(t: ChartTranslate, content: HTMLElement, options: SwatchButtonOptions): void {
  const hasStroke = options.thickness !== undefined && options.onThickness !== undefined
  if (hasStroke) {
    const rowEl = el('div', { class: 'qc-drawing-option-row', role: 'group', 'aria-label': t('drawing.thickness') })
    for (const w of options.thicknessChoices ?? [1, 2, 3, 4]) {
      const opt = button({ class: 'qc-button qc-drawing-option', label: t('drawing.thicknessValue', { n: w }), onClick: () => options.onThickness!(w) })
      opt.appendChild(strokeSegments(w))
      if (options.thickness === w) opt.dataset.qcActive = 'true'
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
}

/** A line-end picker for one side: a 34px field whose face is the current end drawn as its own
 *  28px mark, and whose list offers the two ends by mark and name. */
export function lineEndButton(t: ChartTranslate, icons: IconResolver, box: HTMLElement, side: 'left' | 'right', value: 'normal' | 'arrow', onChange: (v: 'normal' | 'arrow') => void): HTMLButtonElement {
  // Each style is one glyph drawn for the left end; the stylesheet mirrors the right end's.
  const face = (v: 'normal' | 'arrow'): SVGSVGElement => icons.icon(v === 'normal' ? 'lineEndNormal' : 'lineEndArrow')
  const b = button({ class: 'qc-field qc-drawing-line-end', label: t(side === 'left' ? 'drawing.leftEnd' : 'drawing.rightEnd'), icon: face(value) })
  b.dataset.qcEnd = side
  b.setAttribute('aria-haspopup', 'listbox')
  b.setAttribute('aria-expanded', 'false')
  let close: (() => void) | null = null
  b.addEventListener('click', () => {
    if (close) {
      close()
      return
    }
    const list = el('div', { class: 'qc-drawing-menu qc-drawing-list', role: 'listbox', 'aria-label': b.getAttribute('aria-label') ?? '', 'data-qc-end': side })
    for (const v of ['normal', 'arrow'] as const) {
      const opt = el('button', { type: 'button', class: 'qc-menu-row qc-drawing-list-row qc-drawing-list-row--mark', role: 'option', 'aria-selected': String(v === value) }, face(v))
      opt.appendChild(el('span', { class: 'qc-menu-label', text: t(v === 'normal' ? 'drawing.lineEndNormal' : 'drawing.lineEndArrow') }))
      opt.addEventListener('click', () => {
        close?.()
        b.focus({ preventScroll: true })
        if (v !== value) onChange(v)
      })
      list.appendChild(opt)
    }
    const unkeys = menuKeys(list, () => [...list.querySelectorAll<HTMLElement>('[role="option"]')])
    close = openPopover(box, b, list, 'below', () => {
      unkeys()
      close = null
    }, b, undefined, { gap: 0, className: 'qc-drawing-popover--list' })
    ;(list.querySelector<HTMLElement>('[aria-selected="true"]') ?? list.querySelector<HTMLElement>('[role="option"]'))?.focus({ preventScroll: true })
  })
  return b
}

/** The dialog's page strip: one tab per page id, the label read separately, the active one carried
 *  by the bar under it. The strip keeps its tabs and moves the bar to a newly chosen one, so the
 *  bar slides there. With `ids`, each tab carries its own id and names the panel it controls. */
export function dialogTabs(tabs: readonly string[], value: string, labels: (id: string) => string, onChange: (id: string) => void, ids?: { tab: (id: string) => string; panel: string }): HTMLElement {
  const strip = el('div', { class: 'qc-drawing-tabs', role: 'tablist' })
  const bar = el('span', { class: 'qc-drawing-tab-bar', 'aria-hidden': 'true' })
  let current = value
  const place = (): void => {
    const tab = strip.querySelector<HTMLElement>(`[role="tab"][data-tab="${current}"]`)
    if (!tab) return
    bar.style.width = `${tab.offsetWidth}px`
    bar.style.transform = `translateX(${tab.offsetLeft}px)`
  }
  const select = (id: string): void => {
    current = id
    for (const tab of strip.querySelectorAll<HTMLElement>('[role="tab"]')) {
      const on = tab.dataset.tab === id
      tab.setAttribute('aria-selected', String(on))
      tab.tabIndex = on ? 0 : -1
    }
    place()
  }
  for (const tab of tabs) {
    const b = el('button', { type: 'button', class: 'qc-drawing-tab', role: 'tab', 'aria-selected': String(tab === value), 'data-tab': tab }, el('span', { text: labels(tab) }))
    if (ids) {
      b.id = ids.tab(tab)
      b.setAttribute('aria-controls', ids.panel)
    }
    b.tabIndex = tab === value ? 0 : -1
    b.addEventListener('click', () => {
      select(tab)
      onChange(tab)
    })
    strip.appendChild(b)
  }
  strip.appendChild(bar)
  menuKeys(strip, () => [...strip.querySelectorAll<HTMLElement>('[role="tab"]')])
  strip.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') (document.activeElement as HTMLElement | null)?.click()
  })
  // The bar takes its place once the tabs have their widths, without sliding there, and follows a
  // tab whose width changes, as when the chart's font arrives.
  if (typeof ResizeObserver === 'function') {
    const resize = new ResizeObserver(() => {
      place()
      if (strip.isConnected && !strip.dataset.qcPlaced && bar.offsetWidth > 0) requestAnimationFrame(() => (strip.dataset.qcPlaced = 'true'))
    })
    resize.observe(strip)
  }
  return strip
}

/** One timeframe-visibility bucket: the checkbox and the bucket's name as the row's label, then
 *  from, the two-thumb range, and to. The from and to writes clamp against each other, so the boxes
 *  can never cross. */
export function visibilityRangeRow(
  t: ChartTranslate,
  icons: IconResolver,
  props: { label: string; range: { on: boolean; from: number; to: number }; max: number; disabled?: boolean; onChange(next: { on: boolean; from: number; to: number }): void },
): HTMLElement {
  const { range, max } = props
  const from = numberInput(t, icons, { label: t('drawing.rangeFrom'), value: range.from, min: 1, max, step: 1, width: 'field', onChange: (v) => props.onChange({ ...range, from: Math.min(v, range.to) }) })
  const to = numberInput(t, icons, { label: t('drawing.rangeTo'), value: range.to, min: 1, max, step: 1, width: 'field', onChange: (v) => props.onChange({ ...range, to: Math.max(v, range.from) }) })
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
  const dual = el('div', { class: 'qc-drawing-dual' }, el('span', { class: 'qc-drawing-dual-track' }, el('span', { class: 'qc-drawing-dual-span' }, fill)), lo, hi)
  const out = checkRow(props.label, range.on, (v) => props.onChange({ ...range, on: v }), [from, dual, to], !!props.disabled)
  out.querySelector('input')!.setAttribute('aria-label', t('drawing.rowVisible', { name: props.label }))
  out.classList.add('qc-drawing-visibility-row')
  return out
}

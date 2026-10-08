// The field primitives the settings surfaces are built from: a labeled row, a checkbox row, a
// dropdown, a number field with its stepper, the color swatch button, a line-end picker, the
// dialog's tab strip, and one timeframe-visibility row. Each builds real elements, reads its words
// from the chart's language, and reports a value; none holds chart state.
//
// The palette, the custom color editor and the opacity slider are not built here. They are the
// package's one shared control in `ui/controls/color`, which the chart settings menu and the
// indicator editors mount from the same modules; this file keeps only the drawing-domain framing
// around it, including the thickness and line-style rows a drawing's color popover also carries.
import type { LineStyle } from '../../internal/drawings/index'
import { alphaOf, withAlpha } from '../../internal/drawings/index'
import type { ChartTranslate } from '../../i18n'
import { createColorControl, type ColorControlHandle } from '../controls/color'
import { button, dismissOnOutside, el, focusFirst, menuKeys, ownPointer, placePanel, type PanelPlacement } from './dom'
import { trackOverlay } from '../controls/overlays'
import { selectChevron, selectField } from '../controls/select'
import type { IconResolver } from '../icons/resolver'

/** A settings row: the label in a fixed column, the controls left-aligned beside it. */
export function row(label: string, ...controls: HTMLElement[]): HTMLElement {
  const cell = el('div', { class: 'qc-drawing-row-controls' }, ...controls)
  return el('div', { class: 'qc-drawing-row' }, el('span', { class: 'qc-secondary qc-drawing-row-label', text: label }), cell)
}

/** A boolean row: a checkbox and its label, the whole line one click target. */
export function toggleRow(label: string, value: boolean, onChange: (v: boolean) => void, disabled = false): HTMLElement {
  const input = el('input', { type: 'checkbox', class: 'qc-checkbox', 'aria-label': label }) as HTMLInputElement
  input.checked = value
  input.disabled = disabled
  input.addEventListener('change', () => onChange(input.checked))
  return el('label', { class: 'qc-drawing-toggle', 'data-disabled': disabled ? 'true' : undefined }, input, el('span', { text: label }))
}

/** A checkbox on its own, for a row that pairs it with other controls. */
export function checkbox(label: string, value: boolean, onChange: (v: boolean) => void): HTMLInputElement {
  const input = el('input', { type: 'checkbox', class: 'qc-checkbox', 'aria-label': label }) as HTMLInputElement
  input.checked = value
  input.addEventListener('change', () => onChange(input.checked))
  return input
}

/** An enumerated value as a native select in the chart's field box, its chevron at the end of the
 *  box: the value is the id the drawing stores, the label is what the row reads. Answers the box;
 *  the select is its first child. */
export function dropdown<T extends string>(icons: IconResolver, label: string, options: readonly T[], value: T, labels: (v: T) => string, onChange: (v: T) => void): HTMLElement {
  const select = el('select', { class: 'qc-field qc-drawing-select', 'aria-label': label }) as HTMLSelectElement
  for (const option of options) select.appendChild(el('option', { value: option, text: labels(option) }))
  select.value = value
  select.addEventListener('change', () => onChange(select.value as T))
  return selectField(select, icons)
}

/** A number field with its own up and down steppers, clamped to the bounds, rounded to the step's
 *  own precision so float steps never accumulate dust. */
export function numberInput(
  t: ChartTranslate,
  icons: IconResolver,
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
    button({ class: 'qc-drawing-stepper', label: t('drawing.increase'), icon: icons.icon('chevronDown18', 14), onClick: () => stepBy(1) }),
    button({ class: 'qc-drawing-stepper', label: t('drawing.decrease'), icon: icons.icon('chevronDown18', 14), onClick: () => stepBy(-1) }),
  )
  steppers.firstElementChild?.setAttribute('data-up', 'true')
  for (const b of steppers.querySelectorAll('button')) b.tabIndex = -1
  return el('span', { class: 'qc-drawing-number-wrap', 'data-width': props.width ?? 'medium' }, input, steppers)
}

/** Every popover open, in the order it opened. A panel raised from inside another one (a submenu
 *  beside its row) is part of what opened it: a press inside any LATER panel is not outside an
 *  earlier one, so the parent stays up while its child is used. */
const openPanels: HTMLElement[] = []

/** A floating panel beside its anchor inside the chart box, closed on an outside press or Escape.
 *  Returns its close, which the caller runs when the surface that opened it goes. `refresh` is how
 *  the panel re-reads what it lists for a change it cannot observe on its own (the host's access
 *  policy answering differently); a panel without one is left as it is. */
export function openPopover(box: HTMLElement, anchor: HTMLElement, content: HTMLElement, mode: PanelPlacement, onClose?: () => void, place: HTMLElement = anchor, refresh?: () => void): () => void {
  const panel = el('div', { class: 'qc-overlay qc-drawing-popover', 'data-role': 'drawing-popover' }, content)
  ownPointer(panel)
  box.appendChild(panel)
  openPanels.push(panel)
  const insideChild = (target: Node): boolean => openPanels.slice(openPanels.indexOf(panel) + 1).some((p) => p.contains(target))
  let closed = false
  const reposition = (): void => {
    if (closed || !place.isConnected) return
    placePanel(panel, place, box, mode)
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
    openPanel: (anchor, content, onClosed) => openPopover(box, anchor, content, 'below', onClosed),
  })
  const b = control.element
  if (hasStroke) b.appendChild(strokeSegments(options.thickness!, options.lineStyle, options.value))
  return b
}

/** The thickness and line-style rows a drawing's color panel carries below the palette. */
function strokeRows(t: ChartTranslate, content: HTMLElement, options: SwatchButtonOptions): void {
  const hasStroke = options.thickness !== undefined && options.onThickness !== undefined
  {
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
}

/** A line-end picker for one side: a list button whose face is the current end drawn as its own
 *  icon, with the field's chevron after it, and whose list offers the two ends by icon and name. */
export function lineEndButton(t: ChartTranslate, icons: IconResolver, box: HTMLElement, side: 'left' | 'right', value: 'normal' | 'arrow', onChange: (v: 'normal' | 'arrow') => void): HTMLButtonElement {
  // Each style is one glyph drawn for the left end; the stylesheet mirrors the right end's.
  const face = (v: 'normal' | 'arrow'): SVGSVGElement => icons.icon(v === 'normal' ? 'lineEndNormal' : 'lineEndArrow')
  const b = button({ class: 'qc-field qc-drawing-line-end', label: t(side === 'left' ? 'drawing.leftEnd' : 'drawing.rightEnd'), icon: face(value) })
  b.appendChild(selectChevron(icons))
  b.dataset.qcEnd = side
  b.setAttribute('aria-haspopup', 'listbox')
  b.setAttribute('aria-expanded', 'false')
  let close: (() => void) | null = null
  b.addEventListener('click', () => {
    if (close) {
      close()
      return
    }
    const list = el('div', { class: 'qc-drawing-menu', role: 'listbox', 'aria-label': b.getAttribute('aria-label') ?? '', 'data-qc-end': side })
    for (const v of ['normal', 'arrow'] as const) {
      const opt = el('button', { type: 'button', class: 'qc-menu-row', role: 'option', 'aria-selected': String(v === value) }, face(v))
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

/** One timeframe-visibility bucket: the checkbox in the label cell, then from, a two-thumb range,
 *  and to. The from and to writes clamp against each other, so the boxes can never cross. */
export function visibilityRangeRow(
  t: ChartTranslate,
  icons: IconResolver,
  props: { label: string; range: { on: boolean; from: number; to: number }; max: number; disabled?: boolean; onChange(next: { on: boolean; from: number; to: number }): void },
): HTMLElement {
  const { range, max } = props
  const check = checkbox(t('drawing.rowVisible', { name: props.label }), range.on, (v) => props.onChange({ ...range, on: v }))
  check.disabled = !!props.disabled
  const from = numberInput(t, icons, { label: t('drawing.rangeFrom'), value: range.from, min: 1, max, step: 1, width: 'short', onChange: (v) => props.onChange({ ...range, from: Math.min(v, range.to) }) })
  const to = numberInput(t, icons, { label: t('drawing.rangeTo'), value: range.to, min: 1, max, step: 1, width: 'short', onChange: (v) => props.onChange({ ...range, to: Math.max(v, range.from) }) })
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

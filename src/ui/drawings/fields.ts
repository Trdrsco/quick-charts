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
// indicator editors mount from the same modules; this file composes the drawing's color popover
// around it: the palette, then the Thickness and Line style rows a stroke adds, hanging under the
// swatch button that opened it.
import type { LineStyle } from '../../internal/drawings/index'
import { alphaOf, withAlpha } from '../../internal/drawings/index'
import type { ChartTranslate } from '../../i18n'
import { colorMemoryFor, createColorPalette, hexOf } from '../controls/color'
import { focusables, isRtl } from '../controls/dom'
import { button, dismissOnOutside, el, focusFirst, menuKeys, ownPointer, placePanel, type PanelPlacement } from './dom'
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

/** A list the button opens hangs flush under it. A list of switches stands as wide as the button; a
 *  list of choices stands at least as wide as the button and as wide as its longest choice, so no
 *  choice is cut short. */
function openList(box: HTMLElement, anchor: HTMLButtonElement, list: HTMLElement, rows: () => HTMLElement[], onClose: () => void): () => void {
  list.classList.add('qc-drawing-select-list')
  if (anchor.offsetWidth > 0) list.style[list.getAttribute('role') === 'menu' ? 'width' : 'minWidth'] = `${anchor.offsetWidth}px`
  const unkeys = menuKeys(list, rows)
  return openPopover(box, anchor, list, 'below', () => {
    unkeys()
    onClose()
  }, anchor, undefined, { gap: 0, className: 'qc-drawing-popover--list' })
}

/** One value of a few, as a list button in the chart's field box: the value is the id the drawing
 *  stores, the label is what the row reads. The list opens flush under the button, at least as wide
 *  as it and as wide as its longest choice, with the current value inverted, and closes on a pick. */
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
export function multiDropdown(icons: IconResolver, box: HTMLElement, props: { label: string; empty: string; choices: readonly MultiChoice[]; width?: SelectWidth; asWritten?: boolean }): HTMLButtonElement {
  const checked = props.choices.map((c) => c.checked)
  // The face runs the choices on as one phrase, each after the first in lower case, unless the
  // choices' words are to be read as written.
  const summary = (): string => {
    const on = props.choices.filter((_, i) => checked[i]).map((c) => c.label)
    if (!on.length) return props.empty
    return on.map((text, i) => (i === 0 || props.asWritten ? text : text.charAt(0).toLocaleLowerCase() + text.slice(1))).join(', ')
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

/** A number field with its own up and down steppers, clamped to the bounds, rounded to the finer of
 *  the step's precision and the value's own, so float steps never accumulate dust and a step never
 *  rounds away a digit the value carries. A field given `decimals` writes its value with exactly
 *  that many, before a step and after it. */
export function numberInput(
  t: ChartTranslate,
  icons: IconResolver,
  props: { label: string; value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; decimals?: number; width?: 'short' | 'medium' | 'field' | 'wide' },
): HTMLElement {
  const input = el('input', { type: 'number', class: 'qc-field qc-drawing-number', 'aria-label': props.label }) as HTMLInputElement
  const written = (v: number): string => (props.decimals === undefined ? String(v) : v.toFixed(props.decimals))
  input.value = Number.isFinite(props.value) ? written(props.value) : ''
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
    const decimalsOf = (n: number): number => String(n).split('.')[1]?.length ?? 0
    const decimals = props.decimals ?? Math.max(decimalsOf(s), decimalsOf(Number(input.value) || 0))
    const next = Number(v.toFixed(decimals))
    input.value = written(next)
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

/** How a popover stands against its anchor: the room between them, a class the panel wears, which
 *  control it answers to, and whether it follows its own size. */
export interface PopoverOptions {
  gap?: number
  className?: string
  /** The control the panel answers to now, where the surface that opened it may put a new control
   *  in the opener's place while the panel stays up (a page rebuilt under it): the panel stands
   *  against it, a press on it is not a press outside, it carries `aria-expanded`, and Escape gives
   *  it the keyboard back. */
  anchor?: () => HTMLElement
  /** The panel changes size while it is up, as one that turns over to other content does: it is
   *  placed again when it does, so it stays against its anchor and turns to the other side of it
   *  when it no longer fits. */
  resizes?: boolean
}

/** An open popover: the panel, its close, and its placement, run again for a change it cannot
 *  observe. */
interface PopoverHandle {
  panel: HTMLElement
  close(): void
  reposition(): void
}

function mountPopover(
  box: HTMLElement,
  anchor: HTMLElement,
  content: HTMLElement,
  mode: PanelPlacement,
  onClose: (() => void) | undefined,
  place: HTMLElement,
  refresh: (() => void) | undefined,
  options: PopoverOptions,
): PopoverHandle {
  const anchorNow = (): HTMLElement => options.anchor?.() ?? anchor
  const placeNow = (): HTMLElement => (options.anchor ? anchorNow() : place)
  const panel = el('div', { class: `qc-overlay qc-drawing-popover${options.className ? ` ${options.className}` : ''}`, 'data-role': 'drawing-popover' }, content)
  ownPointer(panel)
  box.appendChild(panel)
  openPanels.push(panel)
  const insideChild = (target: Node): boolean => openPanels.slice(openPanels.indexOf(panel) + 1).some((p) => p.contains(target))
  let closed = false
  const reposition = (): void => {
    const at = placeNow()
    if (closed || !at.isConnected) return
    placePanel(panel, at, box, mode, options.gap)
  }
  reposition()
  const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(reposition) : null
  resize?.observe(box)
  resize?.observe(place)
  if (options.resizes) resize?.observe(panel)
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
    anchorNow().setAttribute('aria-expanded', 'false')
    onClose?.()
  }
  // The box's own teardown closes whatever is still open, so no document listener outlives it.
  const untrack = trackOverlay(box, close, refresh)
  const undismiss = dismissOnOutside(
    panel,
    null,
    () => {
      close()
      anchorNow().focus({ preventScroll: true })
    },
    (target) => anchorNow().contains(target) || insideChild(target),
  )
  window.addEventListener('resize', reposition)
  // The observer owns element-only reflows (a flex sibling docking or yielding); capture reaches
  // scrollable host ancestors because scroll does not bubble. No timeout or viewport heuristic
  // owns placement: every report re-reads the real anchor and chosen bounds.
  document.addEventListener('scroll', reposition, true)
  anchorNow().setAttribute('aria-expanded', 'true')
  return { panel, close, reposition }
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
  return mountPopover(box, anchor, content, mode, onClose, place, refresh, options).close
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

/** The line styles the Line style row offers, in its order: solid, dashed, dotted. */
const LINE_STYLES: readonly LineStyle[] = ['solid', 'dashed', 'dotted']

/** How heavy a thickness mark or a stroke preview draws a width: a width up to four as itself, and a
 *  tool's own wider scale brought down to one to eight pixels. */
const markWeight = (thickness: number): number =>
  thickness > 4 ? Math.max(1, Math.min(8, Math.round(thickness / 12))) : Math.max(1, Math.min(4, Math.round(thickness)))

/** The stroke rendered as segments: a bar for solid, four dashes, or a run of square dots, at the
 *  thickness. Divs rather than a dashed stroke, so the pattern never clips at an edge. */
export function strokeSegments(thickness: number, lineStyle: LineStyle = 'solid', color?: string): HTMLElement {
  const t = markWeight(thickness)
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
  /** Wired, the face grows a stroke preview and the popover gains the Thickness row. */
  thickness?: number
  /** A tool with its own width scale, such as the highlighter, supplies its actual pixel choices. */
  thicknessChoices?: readonly number[]
  onThickness?(value: number): void
  /** Wired, the popover gains the Line style row. */
  lineStyle?: LineStyle
  onLineStyle?(value: LineStyle): void
}

/** What a swatch button stands for, as its face and its popover show it. */
interface SwatchState {
  value: string
  alpha: number
  thickness: number | undefined
  lineStyle: LineStyle | undefined
}

const stateOf = (options: SwatchButtonOptions): SwatchState => ({
  value: options.value,
  alpha: options.opacity ?? alphaOf(options.value),
  thickness: options.thickness,
  lineStyle: options.lineStyle,
})

const editsStroke = (options: SwatchButtonOptions): boolean => options.thickness !== undefined && options.onThickness !== undefined

/** What each swatch button was built with, so a popover that outlives its button (a page rebuilt
 *  under it) reads the button the page put in its place. */
const builtWith = new WeakMap<HTMLButtonElement, SwatchButtonOptions>()

/** The close of the popover a swatch button holds open, so the button closes what it opened. */
const holding = new WeakMap<HTMLButtonElement, () => void>()

/** A swatch button's face: the well holds the color at its opacity over the checkerboard, and a
 *  stroke's preview draws the stroke at its thickness and style after it. */
function paintFace(b: HTMLButtonElement, state: SwatchState, stroke: boolean): void {
  const fill = b.querySelector<HTMLElement>('.qc-drawing-well-fill')!
  fill.style.setProperty('--qcd-swatch', hexOf(state.value))
  fill.style.opacity = String(state.alpha)
  if (!stroke) return
  b.querySelector('.qc-drawing-stroke')?.remove()
  b.appendChild(strokeSegments(state.thickness ?? 1, state.lineStyle, state.value))
}

/** The color button of a settings page: a well holding the color and, for a stroke, the stroke drawn
 *  at its own thickness beside it. It opens the color popover under itself and closes it again. The
 *  drawing surface owns the commit: every edit in the popover patches at once, so the undo boundary
 *  stays the one the drawing document already keeps. */
export function swatchButton(t: ChartTranslate, box: HTMLElement, options: SwatchButtonOptions): HTMLButtonElement {
  const b = el('button', { type: 'button', class: 'qc-field qc-drawing-swatch-button', 'aria-label': options.label, 'aria-haspopup': 'dialog', 'aria-expanded': 'false' }, el('span', { class: 'qc-drawing-well' }, el('span', { class: 'qc-drawing-well-fill' }))) as HTMLButtonElement
  paintFace(b, stateOf(options), editsStroke(options))
  builtWith.set(b, options)
  b.addEventListener('click', () => {
    const open = holding.get(b)
    if (open) open()
    else openColorPopover(t, box, b)
  })
  return b
}

/** The swatch buttons in `box` named `label`, in page order: how a rebuilt page's button is found
 *  in its predecessor's place. */
const named = (box: HTMLElement, label: string): HTMLButtonElement[] =>
  [...box.querySelectorAll<HTMLButtonElement>('.qc-drawing-swatch-button')].filter((b) => b.getAttribute('aria-label') === label)

/** The color popover a swatch button opens directly under itself, on the box its panels stand on,
 *  so it hangs past the edge of the dialog the button is in: the palette with the colors this viewer
 *  mixed and the opacity, then for a stroke the Thickness and Line style rows. Every choice applies
 *  to the drawing at once and the popover stays up for the next one; Escape, a press outside or the
 *  button itself closes it. The plus turns it over to the custom editor, which stands alone in it
 *  until a color is added. Tab moves through the popover's own stops and wraps, so the keyboard
 *  stays in it until Escape gives it back to the button.
 *
 *  An edit may rebuild the page the button stands on. The popover then answers to the button in its
 *  place, the same-named button in the same order, and reads what that button holds; when no button
 *  stands there any more, the popover closes. */
function openColorPopover(t: ChartTranslate, box: HTMLElement, opener: HTMLButtonElement): void {
  let anchor = opener
  let options = builtWith.get(opener)!
  let state = stateOf(options)
  const stroke = editsStroke(options)
  const label = opener.getAttribute('aria-label') ?? ''
  const ordinal = named(box, label).indexOf(opener)

  const follow = (): void => {
    if (anchor.isConnected) {
      paintFace(anchor, state, stroke)
      return
    }
    const next = named(box, label)[ordinal]
    const nextOptions = next ? builtWith.get(next) : undefined
    if (!next || !nextOptions) {
      handle.close()
      return
    }
    holding.delete(anchor)
    anchor = next
    options = nextOptions
    state = stateOf(options)
    holding.set(anchor, handle.close)
    anchor.setAttribute('aria-expanded', 'true')
    palette.update(state.value, state.alpha)
    thickness?.check(state.thickness)
    lineStyle?.check(state.lineStyle)
    handle.reposition()
  }
  const edit = (apply: () => void): void => {
    apply()
    follow()
  }

  const palette = createColorPalette(t, {
    value: state.value,
    recents: colorMemoryFor(box),
    opacity: state.alpha,
    // A pick keeps the opacity the value carries, unless the consumer holds the opacity apart.
    onPick: (c) =>
      edit(() => {
        const next = options.onOpacity || state.alpha >= 1 ? c : withAlpha(c, state.alpha)
        options.onPick(next)
        state = { ...state, value: next }
      }),
    onOpacity: (v) =>
      edit(() => {
        if (options.onOpacity) {
          options.onOpacity(v)
          state = { ...state, alpha: v }
          return
        }
        const next = withAlpha(state.value, v)
        options.onPick(next)
        state = { ...state, value: next, alpha: v }
      }),
    onMixing: (mixing) => {
      for (const section of sections) section.hidden = mixing
    },
  })

  const sections: HTMLElement[] = []
  let thickness: SegmentsHandle<number> | null = null
  if (stroke) {
    thickness = segments({
      label: t('drawing.thickness'),
      choices: options.thicknessChoices ?? [1, 2, 3, 4],
      value: state.thickness,
      name: (w) => t('drawing.thicknessValue', { n: w }),
      mark: thicknessMark,
      onPick: (w) =>
        edit(() => {
          options.onThickness?.(w)
          state = { ...state, thickness: w }
        }),
    })
    sections.push(el('div', { class: 'qc-drawing-stroke-section' }, el('div', { class: 'qc-drawing-section-title', text: t('drawing.thickness') }), thickness.element))
  }
  let lineStyle: SegmentsHandle<LineStyle> | null = null
  if (options.lineStyle !== undefined && options.onLineStyle) {
    const names: Record<LineStyle, string> = { solid: t('drawing.lineSolid'), dashed: t('drawing.lineDashed'), dotted: t('drawing.lineDotted') }
    lineStyle = segments({
      label: t('drawing.lineStyle'),
      choices: LINE_STYLES,
      value: state.lineStyle,
      name: (s) => t('drawing.lineStyleValue', { name: names[s] }),
      mark: lineStyleMark,
      wide: true,
      onPick: (s) =>
        edit(() => {
          options.onLineStyle?.(s)
          state = { ...state, lineStyle: s }
        }),
    })
    sections.push(el('div', { class: 'qc-drawing-stroke-section qc-drawing-stroke-section--style' }, el('div', { class: 'qc-drawing-section-title', text: t('drawing.lineStyle') }), lineStyle.element))
  }

  const content = el('div', { class: 'qc-drawing-color-popover', role: 'dialog', 'aria-label': label }, palette.element, ...sections)
  // Tab is the popover's own: a dialog around it traps Tab within its own box, from the document,
  // and would take the keyboard out of the popover, so the press is answered before it gets there.
  const onTab = (event: KeyboardEvent): void => {
    if (event.key !== 'Tab' || !handle.panel.contains(event.target as Node)) return
    const stops = focusables(handle.panel)
    if (!stops.length) return
    event.preventDefault()
    event.stopPropagation()
    const at = stops.indexOf(document.activeElement as HTMLElement)
    stops[(at + (event.shiftKey ? -1 : 1) + stops.length) % stops.length]!.focus({ preventScroll: true })
  }
  const handle = mountPopover(
    box,
    opener,
    content,
    'below',
    () => {
      window.removeEventListener('keydown', onTab, true)
      palette.destroy()
      holding.delete(anchor)
    },
    opener,
    undefined,
    { gap: 0, anchor: () => anchor, resizes: true, className: 'qc-drawing-popover--color' },
  )
  window.addEventListener('keydown', onTab, true)
  holding.set(anchor, handle.close)
  focusFirst(content)
}

/** A thickness segment's mark: a line across the segment, as heavy as the width it stands for. */
function thicknessMark(width: number): HTMLElement {
  const mark = el('span', { class: 'qc-drawing-thickness-mark', 'aria-hidden': 'true' })
  mark.style.height = `${markWeight(width)}px`
  return mark
}

/** A line style segment's mark on its 30 by 24 cell: one line, four dashes, or a run of six dots. */
function lineStyleMark(style: LineStyle): HTMLElement {
  const count = style === 'dotted' ? 6 : style === 'dashed' ? 4 : 1
  const mark = el('span', { class: 'qc-drawing-style-mark', 'data-style': style, 'aria-hidden': 'true' })
  for (let i = 0; i < count; i++) mark.appendChild(el('span', { class: 'qc-drawing-style-seg' }))
  return mark
}

interface SegmentsHandle<T> {
  element: HTMLElement
  /** Show a choice as the one made, without reporting it. */
  check(value: T | undefined): void
}

/** One choice of a few as a row of joined segments, each a radio wearing its mark: the one made is
 *  filled, and the row is one stop for the keyboard, whose arrows move along it and whose Enter or
 *  Space makes the choice under it. */
function segments<T>(props: { label: string; choices: readonly T[]; value: T | undefined; name(v: T): string; mark(v: T): HTMLElement; onPick(v: T): void; wide?: boolean }): SegmentsHandle<T> {
  const group = el('div', { class: 'qc-drawing-segments', role: 'radiogroup', 'aria-label': props.label })
  const items = props.choices.map((choice) => {
    const item = el('button', { type: 'button', class: `qc-drawing-segment${props.wide ? ' qc-drawing-segment--wide' : ''}`, role: 'radio', 'aria-label': props.name(choice) }, props.mark(choice))
    item.addEventListener('click', () => {
      check(choice)
      props.onPick(choice)
    })
    group.appendChild(item)
    return { choice, item }
  })
  const rove = (to: HTMLElement | undefined): void => {
    for (const { item } of items) item.tabIndex = item === to ? 0 : -1
  }
  const check = (value: T | undefined): void => {
    for (const { choice, item } of items) item.setAttribute('aria-checked', String(choice === value))
    const focused = items.find(({ item }) => item === document.activeElement)?.item
    rove(focused ?? items.find(({ choice }) => choice === value)?.item ?? items[0]?.item)
  }
  group.addEventListener('focusin', (event) => {
    const item = items.find(({ item }) => item === event.target)?.item
    if (item) rove(item)
  })
  group.addEventListener('keydown', (event) => {
    const at = items.findIndex(({ item }) => item === document.activeElement)
    if (at < 0) return
    const rtl = isRtl(group)
    let to: number
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') to = at + ((event.key === 'ArrowRight') !== rtl ? 1 : -1)
    else if (event.key === 'ArrowDown') to = at + 1
    else if (event.key === 'ArrowUp') to = at - 1
    else if (event.key === 'Home') to = 0
    else if (event.key === 'End') to = items.length - 1
    else return
    event.preventDefault()
    const target = items[(to + items.length) % items.length]!.item
    rove(target)
    target.focus({ preventScroll: true })
  })
  check(props.value)
  return { element: group, check }
}

/** A line-end picker for one side: a 34px field whose face is the current end drawn as its own
 *  28px mark, and whose list, as wide as its rows, offers the two ends by mark and name under it. */
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
    const list = el('div', { class: 'qc-drawing-menu qc-drawing-list qc-drawing-line-ends', role: 'listbox', 'aria-label': b.getAttribute('aria-label') ?? '', 'data-qc-end': side })
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

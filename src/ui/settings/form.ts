// The chart settings form: the ONE implementation of `ChartSettingsForm` and `ChartSettingsControls`,
// which builds the chart's own pages and every page or row a host contributes, so a host's row is the
// chart's row in every measure.
//
// A page is the settings grid the drawing dialogs stand on: the labels in a column as wide as the
// widest of them and 20px clear of the controls, every row 50px around its 34px controls. A row is
// the grid's, so it lays out nothing of its own; a checkbox row with no controls spans both columns.
// The controls are the drawing dialogs' own fields (the list buttons, the swatch and its color
// popover, the number field) with the sliders and tips this dialog adds.
//
// A row reports a change, and the page is drawn again from the state the change made, so every row
// reads what it shows rather than remembering it. A slider being dragged and a list of switches
// being ticked report every step and are drawn again once the drag ends or the list closes, so the
// control under the pointer stays where it is while it is used.
import type { ChartTranslate } from '../../i18n'
import type { ChartSettingsControls, ChartSettingsForm, ChartSettingsOption, ChartSettingsRowHandle, ChartSettingsTip } from '../../settings/contribution'
import type { IconResolver } from '../icons/resolver'
import { ICONS } from '../controls/icons'
import { trackOverlay } from '../controls/overlays'
import { el } from '../drawings/dom'
import { dropdown, multiDropdown, numberInput, openPopover, sectionTitle, swatchButton } from '../drawings/fields'
import { markSelect } from '../drawings/levelRows'

/** The form the chart builds its own pages with: a host's form, whose headings the chart may also
 *  name, so a host's rows can be placed before the section a heading opens. */
export interface SettingsForm extends ChartSettingsForm {
  heading(text: string, id?: string): void
}

export interface SettingsFormDeps {
  t: ChartTranslate
  icons: IconResolver
  /** Where the form's lists, popovers and tips stand: the dialog's backdrop. */
  layer: HTMLElement
  /** A row reported a change: the page is drawn again. */
  changed(): void
}

/** The widths a list button stands at by name, so a width the drawing fields know keeps their rule. */
const NAMED_WIDTHS: Readonly<Record<number, 'short' | 'medium' | 'wide'>> = { 100: 'short', 150: 'medium', 180: 'wide' }

/** The color a swatch shows while its row follows the bars: the well paints the bars' two colors
 *  instead, and this value only seeds the popover. */
const FOLLOWS_BARS = '#808080'

/** A tip's mark beside a label: a short line under the pointer, or a card on a press. */
function tipButton(deps: SettingsFormDeps, tip: ChartSettingsTip): HTMLButtonElement {
  const text = tip.kind === 'hint' ? tip.text : tip.title
  const b = el('button', { type: 'button', class: 'qc-settings-tip', 'aria-label': text }) as HTMLButtonElement
  b.appendChild(deps.icons.glyph(tip.kind === 'hint' ? ICONS.question : ICONS.info, { size: 18 }))
  if (tip.kind === 'hint') {
    let line: HTMLElement | null = null
    let untrack: (() => void) | null = null
    const hide = (): void => {
      untrack?.()
      untrack = null
      line?.remove()
      line = null
    }
    const show = (): void => {
      if (line || !b.isConnected) return
      line = el('div', { class: 'qc-settings-tooltip', role: 'tooltip', text: tip.text })
      deps.layer.appendChild(line)
      const a = b.getBoundingClientRect()
      const left = Math.max(4, Math.min(a.left + a.width / 2 - line.offsetWidth / 2, window.innerWidth - line.offsetWidth - 4))
      line.style.left = `${Math.round(left)}px`
      line.style.top = `${Math.round(Math.max(4, a.top - line.offsetHeight - 4))}px`
      untrack = trackOverlay(deps.layer, hide)
    }
    b.addEventListener('pointerenter', show)
    b.addEventListener('pointerleave', hide)
    b.addEventListener('focus', show)
    b.addEventListener('blur', hide)
    if (tip.href) b.addEventListener('click', () => window.open(tip.href, '_blank', 'noopener'))
    return b
  }
  let close: (() => void) | null = null
  b.setAttribute('aria-haspopup', 'dialog')
  b.setAttribute('aria-expanded', 'false')
  b.addEventListener('click', () => {
    if (close) {
      close()
      return
    }
    const card = el(
      'div',
      { class: 'qc-settings-card', role: 'dialog', 'aria-label': tip.title },
      el('div', { class: 'qc-settings-card-title', text: tip.title }),
      el('div', { class: 'qc-settings-card-body', text: tip.body }),
    )
    if (tip.href) card.appendChild(el('a', { class: 'qc-settings-card-link', href: tip.href, target: '_blank', rel: 'noopener', text: deps.t('settings.learnMore') }))
    close = openPopover(deps.layer, b, card, 'below', () => {
      close = null
    }, b, undefined, { gap: 4, className: 'qc-settings-card-popover' })
  })
  return b
}

/** A slider from 0 to 1 on a native range: a volume after its speaker, or an opacity fading into its
 *  color over the checked ground. Each step it passes is reported; the page is drawn again when the
 *  slider is let go. */
function slider(deps: SettingsFormDeps, props: { label: string; value: number; kind: 'volume' | { opacity: string }; disabled: boolean; onChange(value: number): void }): HTMLElement {
  const input = el('input', { type: 'range', min: '0', max: '100', step: '1', 'aria-label': props.label }) as HTMLInputElement
  input.value = String(Math.round(Math.max(0, Math.min(1, props.value)) * 100))
  input.disabled = props.disabled
  const paint = (): void => input.style.setProperty('--qcs-level', `${input.value}%`)
  paint()
  input.addEventListener('input', () => {
    paint()
    props.onChange(Number(input.value) / 100)
  })
  input.addEventListener('change', () => deps.changed())
  if (props.kind === 'volume') {
    input.className = 'qc-settings-volume'
    const speaker = deps.icons.glyph(props.disabled ? ICONS.speakerMuted : ICONS.speaker, { size: 18, className: 'qc-settings-speaker' })
    return el('span', { class: 'qc-settings-slider', 'data-disabled': props.disabled ? 'true' : undefined }, speaker, input)
  }
  input.className = 'qc-settings-opacity'
  input.style.setProperty('--qcs-color', props.kind.opacity)
  return el('span', { class: 'qc-settings-slider', 'data-disabled': props.disabled ? 'true' : undefined }, input)
}

/** One row's controls, laid out in lines in the controls' column. */
class RowControls implements ChartSettingsControls {
  readonly cell: HTMLElement
  private line: HTMLElement
  private count = 0
  /** Every control the row holds, for a handle that disables them all. */
  readonly controls: HTMLElement[] = []

  constructor(
    private readonly deps: SettingsFormDeps,
    private readonly row: { id: string; label: string; disabled: boolean },
  ) {
    this.line = el('div', { class: 'qc-settings-line' })
    this.cell = el('div', { class: 'qc-drawing-row-controls qc-settings-controls' }, this.line)
  }

  private add(control: HTMLElement, focusable: HTMLElement = control): void {
    focusable.dataset.qcKey = `${this.row.id}:${this.count++}`
    this.controls.push(focusable)
    this.line.appendChild(control)
  }

  private disabled(own: boolean | undefined): boolean {
    return this.row.disabled || own === true
  }

  color(control: Parameters<ChartSettingsControls['color']>[0]): void {
    const { t, layer } = this.deps
    const label = control.label ?? this.row.label
    const follows = control.color === null
    const report = (apply: () => void): void => {
      apply()
      this.deps.changed()
    }
    const b = swatchButton(t, layer, {
      label,
      value: control.color ?? FOLLOWS_BARS,
      onPick: (color) => report(() => control.onColor(color)),
      ...(control.lineWidth
        ? { thickness: control.lineWidth.value, thicknessChoices: control.lineWidth.options, onThickness: (width: number) => report(() => control.lineWidth!.onChange(width)) }
        : {}),
      ...(control.lineStyle ? { lineStyle: control.lineStyle.value, onLineStyle: (style: 'solid' | 'dashed' | 'dotted') => report(() => control.lineStyle!.onChange(style)), strokeFace: true } : {}),
      ...(control.opacity ? {} : { withoutOpacity: true }),
    })
    if (follows) b.dataset.qcFollows = 'true'
    if (this.disabled(control.disabled)) {
      b.disabled = true
      b.dataset.qcDim = 'true'
    }
    this.add(b)
  }

  select<V extends string>(control: { value: V; options: readonly ChartSettingsOption<V>[]; width: number; onChange(value: V): void; label?: string; disabled?: boolean }): void {
    const labelOf = (value: V): string => control.options.find((option) => option.value === value)?.label ?? value
    const b = dropdown(
      this.deps.icons,
      this.deps.layer,
      control.label ?? this.row.label,
      control.options.map((option) => option.value),
      control.value,
      labelOf,
      (value) => {
        control.onChange(value)
        this.deps.changed()
      },
      NAMED_WIDTHS[control.width] ?? 'short',
    )
    b.style.width = `${control.width}px`
    b.disabled = this.disabled(control.disabled)
    this.add(b)
  }

  multiSelect<V extends string>(control: {
    values: readonly V[]
    options: readonly ChartSettingsOption<V>[]
    width: number
    none: string
    onChange(values: readonly V[]): void
    asWritten?: boolean
    label?: string
    disabled?: boolean
  }): void {
    const checked = new Set(control.values)
    let changed = false
    const b = multiDropdown(this.deps.icons, this.deps.layer, {
      label: control.label ?? this.row.label,
      empty: control.none,
      width: NAMED_WIDTHS[control.width] ?? 'wide',
      ...(control.asWritten ? { asWritten: true } : {}),
      choices: control.options.map((option) => ({
        label: option.label,
        checked: checked.has(option.value),
        onChange: (on: boolean) => {
          if (on) checked.add(option.value)
          else checked.delete(option.value)
          changed = true
          control.onChange(control.options.map((o) => o.value).filter((value) => checked.has(value)))
        },
      })),
      onClose: () => {
        if (changed) this.deps.changed()
      },
    })
    b.style.width = `${control.width}px`
    b.disabled = this.disabled(control.disabled)
    this.add(b)
  }

  number(control: { value: number; min: number; max: number; step: number; suffix?: string; width?: number; onChange(value: number): void; label?: string; disabled?: boolean }): void {
    const field = numberInput(this.deps.t, this.deps.icons, {
      label: control.label ?? this.row.label,
      value: control.value,
      min: control.min,
      max: control.max,
      step: control.step,
      width: 'field',
      onChange: (value) => {
        control.onChange(value)
        this.deps.changed()
      },
    })
    if (control.width !== undefined) field.style.width = `${control.width}px`
    const input = field.querySelector<HTMLInputElement>('input')!
    input.disabled = this.disabled(control.disabled)
    if (control.suffix === undefined) {
      this.add(field, input)
      return
    }
    this.add(el('span', { class: 'qc-settings-number' }, field, el('span', { class: 'qc-settings-suffix', text: control.suffix })), input)
  }

  lineWidth(control: { value: number; options: readonly number[]; onChange(width: number): void; label?: string; disabled?: boolean }): void {
    const { t } = this.deps
    const bar = (width: number): HTMLElement => {
      const mark = el('span', { class: 'qc-drawing-thickness-bar', 'aria-hidden': 'true' })
      mark.style.height = `${width}px`
      return mark
    }
    const b = markSelect(this.deps.layer, {
      label: control.label ?? this.row.label,
      kind: 'thickness',
      options: control.options,
      value: control.options.includes(control.value) ? control.value : control.options[0] ?? control.value,
      mark: bar,
      name: (width) => t('drawing.thicknessValue', { n: width }),
      named: false,
      onChange: (width) => {
        control.onChange(width)
        this.deps.changed()
      },
    })
    b.classList.add('qc-settings-width')
    b.disabled = this.disabled(control.disabled)
    this.add(b)
  }

  slider(control: { value: number; kind: 'volume' | { opacity: string }; onChange(value: number): void; label?: string; disabled?: boolean }): void {
    const element = slider(this.deps, { label: control.label ?? this.row.label, value: control.value, kind: control.kind, disabled: this.disabled(control.disabled), onChange: control.onChange })
    this.add(element, element.querySelector('input')!)
  }

  nextLine(): void {
    if (!this.line.childElementCount) return
    this.line = el('div', { class: 'qc-settings-line' })
    this.cell.appendChild(this.line)
  }
}

/** The handle a row answers: its checkbox and its controls go on or off together. */
function handleOf(elements: readonly HTMLElement[], controls: () => readonly HTMLElement[]): ChartSettingsRowHandle {
  return {
    setDisabled(disabled) {
      for (const element of elements) element.dataset.disabled = String(disabled)
      for (const control of controls()) (control as HTMLInputElement | HTMLButtonElement).disabled = disabled
    },
  }
}

/** A form that appends its rows to `page`, in call order. */
export function createSettingsForm(page: HTMLElement | DocumentFragment, deps: SettingsFormDeps): SettingsForm {
  /** Whether the last checkbox row that is not a sub-row is unchecked: its sub-rows stand disabled. */
  let parentOff = false

  const append = (id: string, ...elements: HTMLElement[]): void => {
    for (const element of elements) {
      element.dataset.row = id
      page.appendChild(element)
    }
  }

  const labelCell = (content: HTMLElement[], tip: ChartSettingsTip | undefined): HTMLElement => {
    const cell = el('div', { class: 'qc-drawing-row-label qc-settings-label' }, ...content)
    if (tip) cell.appendChild(tipButton(deps, tip))
    return cell
  }

  const checkbox = (id: string, label: string, checked: boolean, disabled: boolean, onChange: (checked: boolean) => void): HTMLElement => {
    const input = el('input', { type: 'checkbox', class: 'qc-checkbox', 'aria-label': label }) as HTMLInputElement
    input.checked = checked
    input.disabled = disabled
    input.dataset.qcKey = `${id}:check`
    input.addEventListener('change', () => {
      onChange(input.checked)
      deps.changed()
    })
    return el('label', { class: 'qc-drawing-toggle' }, input, el('span', { text: label }))
  }

  const rowState = (indent: boolean | undefined, disabled: boolean | undefined): boolean => (disabled === true) || (indent === true && parentOff)

  return {
    heading(text, id) {
      const heading = sectionTitle(text)
      heading.classList.add('qc-settings-heading')
      append(id ?? '', heading)
    },

    check(row) {
      const disabled = rowState(row.indent, row.disabled)
      if (!row.indent) parentOff = !row.checked
      const toggle = checkbox(row.id, row.label, row.checked, disabled, row.onChange)
      const hint = row.hint ? el('div', { class: 'qc-settings-hint', text: row.hint }) : null
      if (!row.controls) {
        const line = el('div', { class: 'qc-settings-check-line' }, toggle)
        if (row.tip) line.appendChild(tipButton(deps, row.tip))
        const element = el('div', { class: 'qc-settings-check' }, line)
        if (hint) element.appendChild(hint)
        if (row.indent) element.dataset.indent = 'true'
        if (hint) element.dataset.hint = 'true'
        element.dataset.disabled = String(disabled)
        append(row.id, element)
        return handleOf([element], () => [...element.querySelectorAll<HTMLElement>('input')])
      }
      const controls = new RowControls(deps, { id: row.id, label: row.label, disabled: disabled || !row.checked })
      row.controls(controls)
      const label = labelCell([toggle], row.tip)
      const element = el('div', { class: 'qc-drawing-row qc-settings-row' }, label, controls.cell)
      if (row.indent) element.dataset.indent = 'true'
      element.dataset.disabled = String(disabled)
      append(row.id, element)
      if (hint) {
        const under = el('div', { class: 'qc-settings-hint-row' }, hint)
        append(row.id, under)
      }
      return handleOf([element], () => [toggle.querySelector('input')!, ...controls.controls])
    },

    field(row) {
      const disabled = rowState(row.indent, row.disabled)
      const controls = new RowControls(deps, { id: row.id, label: row.label, disabled })
      row.controls(controls)
      const label = labelCell([el('span', { class: 'qc-settings-label-text', text: row.label })], row.tip)
      const element = el('div', { class: 'qc-drawing-row qc-settings-row' }, label, controls.cell)
      if (row.indent) element.dataset.indent = 'true'
      element.dataset.disabled = String(disabled)
      append(row.id, element)
      return handleOf([element], () => controls.controls)
    },
  }
}

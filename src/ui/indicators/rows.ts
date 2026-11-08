// The rows an indicator's settings show, built from its manifest alone, so a definition a host
// writes lays out by the same rules as a built-in.
//
// Inputs: every declared input in declaration order. An input that names a group stands under that
// group's heading, together with the inputs beside it that name the same group, and a run of inputs
// that names no group stands without one. A number is a field with its steppers, an enum a list, and
// a switch a checkbox row across the page; an input that does not apply under the values the others
// hold stands disabled. Style: every plot, then every level, then every fill, each behind the
// checkbox that shows or hides it, then the output values and the input values the status line and
// the price scale write. Every row is the drawing dialog's own field, so the three dialogs read alike.
import type { ChartTranslate } from '../../i18n'
import { declaredInputValue, inputApplies, manifestTitle, type IndicatorManifest, type IndicatorOverrides, type ManifestPlot } from '../../indicatorModel'
import { el } from '../drawings/dom'
import { checkRow, dropdown, groupGap, numberInput, row, sectionTitle, swatchButton, toggleRow } from '../drawings/fields'
import type { IconResolver } from '../icons/resolver'

type LineStyle = 'solid' | 'dashed' | 'dotted'

/** The decimal places the Precision list offers after the chart's own. */
const PRECISIONS = ['0', '1', '2', '3', '4', '5', '6', '7', '8'] as const

/** What every row reads: the words, the glyphs, and where its lists and color panels stand. */
export interface RowsBase {
  t: ChartTranslate
  icons: IconResolver
  /** Where the rows' lists and panels stand, so they may hang past the dialog's edge. */
  box: HTMLElement
}

/** Stand every control in a row disabled. */
function disable(node: HTMLElement): void {
  for (const control of node.querySelectorAll<HTMLButtonElement | HTMLInputElement>('button, input')) control.disabled = true
  if (node instanceof HTMLButtonElement || node instanceof HTMLInputElement) node.disabled = true
}

export interface InputRowsContext extends RowsBase {
  manifest: IndicatorManifest
  /** Every input's value, complete over the manifest's defaults. */
  values: Readonly<Record<string, number>>
  /** An input took a value, held to its declaration. */
  onInput(key: string, value: number): void
}

/** The Inputs page's rows. */
export function inputRows(ctx: InputRowsContext): HTMLElement[] {
  const out: HTMLElement[] = []
  let group: string | undefined
  for (const [key, spec] of Object.entries(ctx.manifest.inputs ?? {})) {
    // A new run of inputs keeps room after the run before it, and a run that names a group opens
    // on its heading.
    if (spec.group !== group || out.length === 0) {
      if (out.length > 0) out.push(groupGap())
      if (spec.group) out.push(sectionTitle(spec.group))
      group = spec.group
    }
    const title = manifestTitle(key, spec)
    const value = ctx.values[key] ?? spec.default
    const applies = inputApplies(ctx.manifest, key, ctx.values)
    const take = (next: number): void => ctx.onInput(key, declaredInputValue(spec, next))
    let line: HTMLElement
    if (spec.kind === 'bool') {
      line = toggleRow(title, value === 1, (on) => take(on ? 1 : 0), !applies)
    } else if (spec.kind === 'enum') {
      const options = (spec.options ?? []).map((_, index) => String(index))
      const list = dropdown(ctx.icons, ctx.box, title, options, String(value), (index) => spec.options?.[Number(index)] ?? index, (index) => take(Number(index)), 'short')
      if (!applies) disable(list)
      line = row(title, list)
    } else {
      const field = numberInput(ctx.t, ctx.icons, {
        label: title,
        value,
        onChange: take,
        ...(spec.step !== undefined ? { step: spec.step } : spec.kind === 'int' ? { step: 1 } : {}),
        ...(spec.min !== undefined ? { min: spec.min } : {}),
        ...(spec.max !== undefined ? { max: spec.max } : {}),
        width: 'field',
      })
      if (!applies) disable(field)
      line = row(title, field)
    }
    line.dataset.input = key
    out.push(line)
  }
  return out
}

export interface StyleRowsContext extends RowsBase {
  manifest: IndicatorManifest
  overrides: IndicatorOverrides
  /** The color a plot that declares none draws in: the instance's own. */
  instanceColor: string
  /** The ink a level or fill that declares no color draws in. */
  neutral: string
  /** Whether the manifest declares inputs, which the status line can write beside the name. */
  hasInputs: boolean
  /** The overrides as an edit leaves them. */
  onOverrides(next: IndicatorOverrides): void
}

/** The Style page's rows. */
export function styleRows(ctx: StyleRowsContext): HTMLElement[] {
  const { t, manifest, overrides } = ctx
  const out: HTMLElement[] = []
  const swatch = (label: string, value: string, onPick: (color: string) => void, stroke?: { thickness?: number; onThickness?: (v: number) => void; lineStyle?: LineStyle; onLineStyle?: (v: LineStyle) => void }): HTMLButtonElement =>
    swatchButton(t, ctx.box, {
      label,
      value,
      onPick,
      ...(stroke?.thickness !== undefined && stroke.onThickness ? { thickness: stroke.thickness, onThickness: stroke.onThickness } : {}),
      ...(stroke?.lineStyle !== undefined && stroke.onLineStyle ? { lineStyle: stroke.lineStyle, onLineStyle: stroke.onLineStyle } : {}),
      ...(stroke?.lineStyle !== undefined && !stroke.onThickness ? { strokeFace: true } : {}),
    })
  const plot = (key: string, patch: NonNullable<IndicatorOverrides['plots']>[string]): void =>
    ctx.onOverrides({ ...overrides, plots: { ...overrides.plots, [key]: { ...overrides.plots?.[key], ...patch } } })
  const level = (key: string, patch: NonNullable<IndicatorOverrides['levels']>[string]): void =>
    ctx.onOverrides({ ...overrides, levels: { ...overrides.levels, [key]: { ...overrides.levels?.[key], ...patch } } })
  const fill = (key: string, patch: NonNullable<IndicatorOverrides['fills']>[string]): void =>
    ctx.onOverrides({ ...overrides, fills: { ...overrides.fills, [key]: { ...overrides.fills?.[key], ...patch } } })
  const display = (patch: NonNullable<IndicatorOverrides['display']>): void => ctx.onOverrides({ ...overrides, display: { ...overrides.display, ...patch } })

  for (const [key, spec] of Object.entries(manifest.plots)) {
    const title = manifestTitle(key, spec)
    const own = overrides.plots?.[key]
    const visible = own?.visible !== false
    const show = (on: boolean): void => plot(key, { visible: on })
    if (spec.kind === 'histogram' && (spec.up !== undefined || spec.down !== undefined)) {
      // A plot drawn in two colors heads its own rows: its switch across the page, then one row per
      // color under it.
      out.push(toggleRow(title, visible, show))
      out.push(colorRow(t('settings.growing'), swatch(t('settings.upColorOf', { name: title }), own?.up ?? spec.up ?? ctx.instanceColor, (color) => plot(key, { up: color }))))
      out.push(colorRow(t('settings.falling'), swatch(t('settings.downColorOf', { name: title }), own?.down ?? spec.down ?? ctx.instanceColor, (color) => plot(key, { down: color }))))
      out.push(el('div', { class: 'qc-indicator-color-gap', 'aria-hidden': 'true' }))
      continue
    }
    const color = own?.color ?? spec.color ?? ctx.instanceColor
    const pick = (next: string): void => plot(key, { color: next })
    out.push(checkRow(title, visible, show, [swatch(t('settings.colorOf', { name: title }), color, pick, strokeOf(spec, own, (patch) => plot(key, patch)))]))
  }
  for (const [key, spec] of Object.entries(manifest.levels ?? {})) {
    const title = manifestTitle(key, spec)
    const own = overrides.levels?.[key]
    const price = numberInput(t, ctx.icons, { label: title, value: own?.price ?? spec.price, onChange: (value) => level(key, { price: value }), width: 'field' })
    const stroke = { lineStyle: own?.lineStyle ?? spec.lineStyle ?? 'solid', onLineStyle: (value: LineStyle) => level(key, { lineStyle: value }) }
    out.push(checkRow(title, own?.visible !== false, (on) => level(key, { visible: on }), [swatch(t('settings.colorOf', { name: title }), own?.color ?? spec.color ?? ctx.neutral, (color) => level(key, { color }), stroke), price]))
  }
  for (const [key, spec] of Object.entries(manifest.fills ?? {})) {
    const title = manifestTitle(key, spec)
    const own = overrides.fills?.[key]
    out.push(checkRow(title, own?.visible !== false, (on) => fill(key, { visible: on }), [swatch(t('settings.colorOf', { name: title }), own?.color ?? spec.color ?? ctx.neutral, (color) => fill(key, { color }))]))
  }

  out.push(groupGap(), sectionTitle(t('settings.outputValues')))
  const precision = overrides.precision === undefined ? 'default' : String(overrides.precision)
  out.push(
    row(
      t('settings.precision'),
      dropdown(ctx.icons, ctx.box, t('settings.precision'), ['default', ...PRECISIONS], precision, (value) => (value === 'default' ? t('settings.precisionDefault') : value), (value) => {
        const { precision: _precision, ...rest } = overrides
        ctx.onOverrides(value === 'default' ? rest : { ...rest, precision: Number(value) })
      }),
    ),
  )
  out.push(toggleRow(t('settings.labelsOnPriceScale'), overrides.display?.labelsOnPriceScale !== false, (on) => display({ labelsOnPriceScale: on })))
  out.push(toggleRow(t('settings.valuesInStatusLine'), overrides.display?.valuesInStatusLine !== false, (on) => display({ valuesInStatusLine: on })))
  if (ctx.hasInputs) {
    out.push(sectionTitle(t('settings.inputValues')))
    out.push(toggleRow(t('settings.inputsInStatusLine'), overrides.display?.inputsInStatusLine !== false, (on) => display({ inputsInStatusLine: on })))
  }
  return out
}

/** One color of a plot drawn in several, in its own row under the plot's switch. */
function colorRow(label: string, control: HTMLElement): HTMLElement {
  const line = row(label, control)
  line.classList.add('qc-indicator-color-row')
  return line
}

/** What a plot's swatch edits besides its color: a line its thickness and its style, a line of dots
 *  its thickness, and a histogram or a mark only its color. */
function strokeOf(
  spec: ManifestPlot,
  own: NonNullable<IndicatorOverrides['plots']>[string] | undefined,
  patch: (patch: NonNullable<IndicatorOverrides['plots']>[string]) => void,
): { thickness?: number; onThickness?: (v: number) => void; lineStyle?: LineStyle; onLineStyle?: (v: LineStyle) => void } | undefined {
  if (spec.kind !== 'line' && spec.kind !== 'area') return undefined
  const thickness = { thickness: own?.lineWidth ?? spec.lineWidth ?? 1, onThickness: (value: number) => patch({ lineWidth: value }) }
  if (spec.dots) return thickness
  return { ...thickness, lineStyle: own?.lineStyle ?? spec.lineStyle ?? 'solid', onLineStyle: (value: LineStyle) => patch({ lineStyle: value }) }
}

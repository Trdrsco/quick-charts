// The indicator settings dialog for one instance: Inputs (the manifest's declared inputs through
// the shared field builder), Style (per-plot color, width and line style; per-level color and
// style; per-fill color; precision; labels on the price scale), and Visibility (the instance
// itself, and each plot, level and fill). Edits are collected and applied as one
// `chart.indicators.update` on Apply; Cancel and Escape leave the instance as it was.
import { manifestInputDefaults, type IndicatorOverrides } from '../../indicatorModel'
import type { BuiltInIndicator } from '../../builtInIndicators'
import { buildInputFields } from '../../inputsEditor'
import { parseCssColor } from '../../theme/color'
import type { ChartHandle } from '../../widget/chart'
import type { IndicatorInstance } from '../../widget/options'
import { indicatorTitleOf } from '../../widget/indicators'
import type { ChromeContext } from './context'
import { dialogTitle, fieldRow, openDialog, switchRow, tabList, type DialogHandle } from './dialog'
import { button, h, replace } from './dom'

export interface IndicatorSettingsDeps extends ChromeContext {
  chart: ChartHandle
  instance: IndicatorInstance
}

type LineStyle = 'solid' | 'dashed' | 'dotted'
const LINE_WIDTHS = [1, 2, 3, 4] as const
const PRECISIONS = [0, 1, 2, 3, 4, 5, 6, 7, 8] as const

/** A color as a `#rrggbb` the native color field takes, or null when it is not one the field can
 *  show (a translucent or named value keeps its declaration until the viewer picks). */
export function hexOf(color: string | undefined): string | null {
  if (!color) return null
  const rgba = parseCssColor(color)
  if (!rgba) return null
  const pair = (n: number): string => Math.round(n).toString(16).padStart(2, '0')
  return `#${pair(rgba.r)}${pair(rgba.g)}${pair(rgba.b)}`
}

/** A display name for a plot, level, fill or input key: the built-in's own title where it carries
 *  one, else the key read as words. */
const titleOf = (key: string, titles: Readonly<Record<string, string>> | undefined): string => titles?.[key] ?? key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase())

/** A deep copy of an overrides record, so edits never reach the live instance before Apply. */
const cloneOverrides = (ov: IndicatorOverrides | undefined): IndicatorOverrides => JSON.parse(JSON.stringify(ov ?? {})) as IndicatorOverrides

export function openIndicatorSettings(deps: IndicatorSettingsDeps): DialogHandle {
  const t = deps.i18n.t
  const { instance, chart } = deps
  const manifest = instance.definition.manifest
  const builtIn = instance.definition as Partial<BuiltInIndicator>
  const title = indicatorTitleOf(instance, t)
  const overrides = cloneOverrides(instance.overrides)
  let hidden = chart.indicators.hidden().includes(instance.id)
  const inputs = manifest.inputs ?? {}
  const fields = buildInputFields(inputs, { ...manifestInputDefaults(manifest), ...instance.inputs }, builtIn.inputTitles)
  const tabs = [...(Object.keys(inputs).length > 0 ? [{ id: 'inputs', label: t('settings.tabInputs') }] : []), { id: 'style', label: t('settings.tabStyle') }, { id: 'visibility', label: t('settings.tabVisibility') }]
  let tab = tabs[0]!.id

  const plotOverride = (key: string): NonNullable<IndicatorOverrides['plots']>[string] => ((overrides.plots ??= {})[key] ??= {})
  const levelOverride = (key: string): NonNullable<IndicatorOverrides['levels']>[string] => ((overrides.levels ??= {})[key] ??= {})
  const fillOverride = (key: string): NonNullable<IndicatorOverrides['fills']>[string] => ((overrides.fills ??= {})[key] ??= {})

  const colorField = (label: string, current: string | undefined, onChange: (hex: string) => void): HTMLElement => {
    const hex = hexOf(current)
    const input = h('input', { type: 'color', class: 'qc-field qc-color-field', 'aria-label': label, ...(hex ? { value: hex } : {}) })
    input.addEventListener('input', () => onChange(input.value))
    return input
  }
  const select = (label: string, options: readonly { value: string; text: string }[], current: string, onChange: (value: string) => void): HTMLElement => {
    const el = h('select', { class: 'qc-field', 'aria-label': label })
    for (const o of options) el.appendChild(h('option', { value: o.value, selected: o.value === current }, o.text))
    el.addEventListener('change', () => onChange(el.value))
    return el
  }
  const lineStyleOptions = (): { value: string; text: string }[] => [
    { value: 'solid', text: t('settings.lineStyleSolid') },
    { value: 'dashed', text: t('settings.lineStyleDashed') },
    { value: 'dotted', text: t('settings.lineStyleDotted') },
  ]

  const stylePage = (): HTMLElement => {
    const page = h('div', { class: 'qc-settings-page' })
    const plots = Object.entries(manifest.plots)
    if (plots.length > 0) page.appendChild(h('div', { class: 'qc-dialog-heading', role: 'presentation' }, t('settings.plots')))
    for (const [key, spec] of plots) {
      const label = titleOf(key, builtIn.plotTitles)
      const ov = overrides.plots?.[key]
      const row = h('div', { class: 'qc-settings-row' }, h('span', { class: 'qc-field-label' }, label))
      row.appendChild(colorField(t('settings.colorOf', { name: label }), ov?.color ?? spec.color ?? instance.color, (hex) => (plotOverride(key).color = hex)))
      if (spec.kind === 'line' || spec.kind === 'area') {
        row.appendChild(
          select(t('settings.lineWidthOf', { name: label }), LINE_WIDTHS.map((w) => ({ value: String(w), text: String(w) })), String(ov?.lineWidth ?? spec.lineWidth ?? 1), (v) => (plotOverride(key).lineWidth = Number(v))),
        )
        row.appendChild(select(t('settings.lineStyleOf', { name: label }), lineStyleOptions(), ov?.lineStyle ?? spec.lineStyle ?? 'solid', (v) => (plotOverride(key).lineStyle = v as LineStyle)))
      }
      page.appendChild(row)
    }
    const levels = Object.entries(manifest.levels ?? {})
    if (levels.length > 0) page.appendChild(h('div', { class: 'qc-dialog-heading', role: 'presentation' }, t('settings.levels')))
    for (const [key, spec] of levels) {
      const label = titleOf(key, builtIn.plotTitles)
      const ov = overrides.levels?.[key]
      page.appendChild(
        h(
          'div',
          { class: 'qc-settings-row' },
          h('span', { class: 'qc-field-label' }, label),
          colorField(t('settings.colorOf', { name: label }), ov?.color ?? spec.color, (hex) => (levelOverride(key).color = hex)),
          select(t('settings.lineStyleOf', { name: label }), lineStyleOptions(), ov?.lineStyle ?? spec.lineStyle ?? 'solid', (v) => (levelOverride(key).lineStyle = v as LineStyle)),
        ),
      )
    }
    const fills = Object.entries(manifest.fills ?? {})
    if (fills.length > 0) page.appendChild(h('div', { class: 'qc-dialog-heading', role: 'presentation' }, t('settings.fills')))
    for (const [key, spec] of fills) {
      const label = titleOf(key, builtIn.plotTitles)
      page.appendChild(h('div', { class: 'qc-settings-row' }, h('span', { class: 'qc-field-label' }, label), colorField(t('settings.colorOf', { name: label }), overrides.fills?.[key]?.color ?? spec.color, (hex) => (fillOverride(key).color = hex))))
    }
    page.appendChild(
      fieldRow(
        t('settings.precision'),
        select(t('settings.precision'), [{ value: '', text: t('settings.precisionDefault') }, ...PRECISIONS.map((p) => ({ value: String(p), text: String(p) }))], overrides.precision === undefined ? '' : String(overrides.precision), (v) => {
          if (v === '') delete overrides.precision
          else overrides.precision = Number(v)
        }),
      ),
    )
    page.appendChild(
      switchRow({
        label: t('settings.labelsOnPriceScale'),
        checked: overrides.display?.labelsOnPriceScale !== false,
        onChange: (on) => {
          overrides.display = { ...overrides.display, labelsOnPriceScale: on }
        },
      }),
    )
    return page
  }

  const visibilityPage = (): HTMLElement => {
    const page = h('div', { class: 'qc-settings-page' })
    page.appendChild(switchRow({ label: t('settings.showIndicator'), checked: !hidden, onChange: (on) => (hidden = !on) }))
    const section = (heading: string, entries: [string, unknown][], read: (key: string) => boolean, write: (key: string, on: boolean) => void): void => {
      if (entries.length === 0) return
      page.appendChild(h('div', { class: 'qc-dialog-heading', role: 'presentation' }, heading))
      for (const [key] of entries) {
        const label = titleOf(key, builtIn.plotTitles)
        page.appendChild(switchRow({ label: t('settings.visibleOf', { name: label }), checked: read(key), onChange: (on) => write(key, on) }))
      }
    }
    section(t('settings.plots'), Object.entries(manifest.plots), (k) => overrides.plots?.[k]?.visible !== false, (k, on) => (plotOverride(k).visible = on))
    section(t('settings.levels'), Object.entries(manifest.levels ?? {}), (k) => overrides.levels?.[k]?.visible !== false, (k, on) => (levelOverride(k).visible = on))
    section(t('settings.fills'), Object.entries(manifest.fills ?? {}), (k) => overrides.fills?.[k]?.visible !== false, (k, on) => (fillOverride(k).visible = on))
    return page
  }

  const inputsPage = (): HTMLElement => h('div', { class: 'qc-settings-page' }, ...fields.rows)

  return openDialog({
    host: deps.overlays,
    label: t('settings.indicatorTitle', { name: title }),
    className: 'qc-settings-dialog',
    width: 400,
    build(box, dialog) {
      const panel = h('div', { class: 'qc-dialog-body', role: 'tabpanel' })
      // Pages are built once and swapped, so a value typed on one tab survives a visit to another.
      const pages: Record<string, HTMLElement> = { inputs: inputsPage(), style: stylePage(), visibility: visibilityPage() }
      const show = (id: string): void => {
        tab = id
        replace(panel, pages[id] ?? null)
      }
      const list = tabList({ tabs, value: tab, label: t('settings.indicatorTitle', { name: title }), id: `qc-settings-${chart.id}-${instance.id}`, panel, onChange: show })
      const apply = (): void => {
        const wasHidden = chart.indicators.hidden().includes(instance.id)
        deps.commands.execute('chart.indicators.update', { ...instance, inputs: { ...instance.inputs, ...fields.read() }, overrides })
        if (hidden !== wasHidden) deps.commands.execute(hidden ? 'chart.indicators.hide' : 'chart.indicators.show', instance.id)
        dialog.close()
      }
      box.append(
        dialogTitle(title, t('inputs.cancel'), () => dialog.close()),
        list.element,
        panel,
        h('div', { class: 'qc-dialog-actions' }, button({ label: t('inputs.cancel'), text: t('inputs.cancel'), onClick: () => dialog.close() }), button({ label: t('inputs.apply'), text: t('inputs.apply'), className: 'qc-button--primary', onClick: apply })),
      )
      box.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') apply()
      })
      show(tab)
    },
    initialFocus: (box) => box.querySelector<HTMLElement>('.qc-dialog-body input, .qc-dialog-body select, .qc-dialog-body button'),
  })
}

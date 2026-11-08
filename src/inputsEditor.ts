// The indicator inputs editor: the compact popover the legend gear opens when no settings dialog
// serves the chart, holding the Inputs page of the settings dialog (the same rows, laid out by the
// same rules from the manifest) and applied as a whole on Enter or Apply. The legend opens it over
// the widget's own resolver through `mountInputsEditor`. Same chrome discipline as every chart
// editor: package-owned vanilla DOM in the chrome subtree, self-removing, pointer events stopped,
// painted through `.qc-*` recipes. The popover's position is its one inline write, because the gear
// it hangs from is wherever the legend put it. Pre-render: the caller receives a validated input
// patch and the chart owns the recompute.
import { createChartI18n, readingDirection, type ChartI18n } from './i18n'
import { manifestInputDefaults, type IndicatorManifest, type ManifestInput } from './indicatorModel'
import { createIconDiagnostics } from './ui/icons/draw'
import { createIconResolver, type IconResolver } from './ui/icons/resolver'
import { inputRows } from './ui/indicators/rows'

/** The compact editor beside `rect` inside `container`, its glyphs drawn from the chart's own
 *  artwork. */
export function openInputsEditor(
  container: HTMLElement,
  rect: { x: number; y: number; w: number; h: number },
  inputs: Readonly<Record<string, ManifestInput>>,
  current: Readonly<Record<string, number>>,
  onApply: (patch: Record<string, number>) => void,
  /** The chart's language: the two actions re-label if it changes while the editor is open. A
   *  field's name and an enum's options are the manifest's own words and are not translated. */
  strings: ChartI18n = createChartI18n(),
): void {
  const icons = createIconResolver({ document: container.ownerDocument, direction: () => readingDirection(strings), diagnostics: createIconDiagnostics() })
  mountInputsEditor(container, rect, inputs, current, onApply, strings, icons)
}

/** The compact editor over the widget's own resolver, so its glyphs wear what every other control of
 *  the widget wears and a failed drawing is reported where the widget's others are. */
export function mountInputsEditor(
  container: HTMLElement,
  rect: { x: number; y: number; w: number; h: number },
  inputs: Readonly<Record<string, ManifestInput>>,
  current: Readonly<Record<string, number>>,
  onApply: (patch: Record<string, number>) => void,
  strings: ChartI18n,
  icons: IconResolver,
): void {
  const host = container.getBoundingClientRect()
  const el = document.createElement('div')
  el.className = 'qc-overlay qc-inputs'
  el.setAttribute('role', 'dialog')
  el.setAttribute('aria-label', strings.t('legend.indicatorSettings'))
  el.style.left = `${Math.max(4, rect.x - host.left)}px`
  el.style.top = `${Math.max(4, rect.y - host.top + rect.h + 4)}px`
  for (const type of ['pointerdown', 'pointerup', 'pointermove'] as const) el.addEventListener(type, (e) => e.stopPropagation())

  const manifest: IndicatorManifest = { pane: 'overlay', plots: {}, inputs }
  let values: Record<string, number> = { ...manifestInputDefaults(manifest), ...current }
  const page = document.createElement('div')
  page.className = 'qc-drawing-page qc-inputs-page'
  page.dataset.tab = 'inputs'
  const render = (): void => {
    page.replaceChildren(
      ...inputRows({
        t: strings.t,
        icons,
        box: container,
        manifest,
        values,
        onInput: (key, value) => {
          values = { ...values, [key]: value }
          render()
        },
      }),
    )
  }
  render()
  el.appendChild(page)

  const dismiss = (): void => {
    unsubscribe()
    el.remove()
  }
  const apply = (): void => {
    onApply(Object.fromEntries(Object.keys(inputs).map((key) => [key, values[key]!])))
    dismiss()
  }

  const buttons = document.createElement('div')
  buttons.className = 'qc-inputs-actions'
  const mkButton = (label: string, onClick: () => void, primary = false): HTMLButtonElement => {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = primary ? 'qc-button qc-button--primary' : 'qc-button'
    b.textContent = label
    b.addEventListener('click', onClick)
    buttons.appendChild(b)
    return b
  }
  const cancelButton = mkButton(strings.t('inputs.cancel'), () => dismiss())
  const applyButton = mkButton(strings.t('inputs.apply'), apply, true)
  el.appendChild(buttons)

  const unsubscribe = strings.onChange(() => {
    cancelButton.textContent = strings.t('inputs.cancel')
    applyButton.textContent = strings.t('inputs.apply')
    el.setAttribute('aria-label', strings.t('legend.indicatorSettings'))
  })

  el.addEventListener('keydown', (e) => {
    e.stopPropagation()
    if (e.key === 'Enter') {
      // A field takes what it holds before the whole set applies.
      if (e.target instanceof HTMLInputElement && e.target.type !== 'checkbox') e.target.dispatchEvent(new Event('change'))
      apply()
    } else if (e.key === 'Escape') dismiss()
  })

  container.appendChild(el)
  page.querySelector<HTMLElement>('input.qc-field:not(:disabled), button:not(:disabled)')?.focus?.()
}

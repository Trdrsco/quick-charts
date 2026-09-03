// The indicator inputs editor: one numeric or enum field per declared manifest input, read back as
// a validated patch. Two surfaces build on it. `buildInputFields` is the field set alone, which the
// chrome's indicator settings dialog renders on its Inputs tab; `openInputsEditor` is the compact
// popover the legend gear opens when no settings dialog serves the chart, applied as a whole on
// Enter or Apply. Same chrome discipline as every chart editor: package-owned vanilla DOM in the
// chrome subtree, self-removing, pointer events stopped, painted through `.qc-*` recipes. The
// popover's position is its one inline write, because the gear it hangs from is wherever the
// legend put it. Pre-render: the caller receives a validated input patch and the chart owns the
// recompute.
import { createChartI18n, type ChartI18n } from './i18n'
import type { ManifestInput } from './indicatorModel'

/** A rendered field set: the rows to mount, the validated patch they hold, and the first field. */
export interface InputFields {
  rows: readonly HTMLElement[]
  /** Every field's value, clamped to its declaration. An unparseable field is left out, so it
   *  keeps its previous value. */
  read(): Record<string, number>
  first(): HTMLElement | null
}

/** A field's name, from the manifest's own input key ('smoothingLength' reads "Smoothing Length")
 *  unless the caller supplies a display title. Names richer than this are a definition's own. */
const titleOf = (key: string, titles?: Readonly<Record<string, string>>): string =>
  titles?.[key] ?? key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase())

/** One row per declared input: a number field bounded by the declaration, or a select over an
 *  enum's options. Every field is labeled by its row, so a screen reader names it. */
export function buildInputFields(
  inputs: Readonly<Record<string, ManifestInput>>,
  current: Readonly<Record<string, number>>,
  titles?: Readonly<Record<string, string>>,
): InputFields {
  const fields = new Map<string, HTMLInputElement | HTMLSelectElement>()
  const rows: HTMLElement[] = []
  for (const [key, spec] of Object.entries(inputs)) {
    const row = document.createElement('label')
    row.className = 'qc-inputs-row'
    const name = document.createElement('span')
    name.textContent = titleOf(key, titles)
    row.appendChild(name)
    if (spec.kind === 'enum') {
      const select = document.createElement('select')
      select.className = 'qc-field qc-inputs-select'
      ;(spec.options ?? []).forEach((label, i) => {
        const o = document.createElement('option')
        o.value = String(i)
        o.textContent = label
        select.appendChild(o)
      })
      select.value = String(current[key] ?? spec.default)
      fields.set(key, select)
      row.appendChild(select)
    } else {
      const input = document.createElement('input')
      input.type = 'number'
      input.className = 'qc-field qc-inputs-field'
      if (spec.min !== undefined) input.min = String(spec.min)
      if (spec.max !== undefined) input.max = String(spec.max)
      input.step = spec.kind === 'int' ? '1' : 'any'
      input.value = String(current[key] ?? spec.default)
      fields.set(key, input)
      row.appendChild(input)
    }
    rows.push(row)
  }
  return {
    rows,
    read() {
      const patch: Record<string, number> = {}
      for (const [key, field] of fields) {
        const spec = inputs[key]!
        let value = Number(field.value)
        if (!Number.isFinite(value)) continue
        if (spec.kind === 'int' || spec.kind === 'enum') value = Math.round(value)
        if (spec.min !== undefined) value = Math.max(spec.min, value)
        if (spec.max !== undefined) value = Math.min(spec.max, value)
        patch[key] = value
      }
      return patch
    },
    first: () => fields.values().next().value ?? null,
  }
}

export function openInputsEditor(
  container: HTMLElement,
  rect: { x: number; y: number; w: number; h: number },
  inputs: Readonly<Record<string, ManifestInput>>,
  current: Readonly<Record<string, number>>,
  onApply: (patch: Record<string, number>) => void,
  /** The chart's language: the two actions re-label if it changes while the editor is open. A
   *  field's name and an enum's options are the manifest's own vocabulary and are not translated. */
  strings: ChartI18n = createChartI18n(),
): void {
  const host = container.getBoundingClientRect()
  const el = document.createElement('div')
  el.className = 'qc-overlay qc-inputs'
  el.setAttribute('role', 'dialog')
  el.setAttribute('aria-label', strings.t('legend.indicatorSettings'))
  el.style.left = `${Math.max(4, rect.x - host.left)}px`
  el.style.top = `${Math.max(4, rect.y - host.top + rect.h + 4)}px`
  for (const type of ['pointerdown', 'pointerup', 'pointermove'] as const) el.addEventListener(type, (e) => e.stopPropagation())

  const dismiss = (): void => {
    unsubscribe()
    el.remove()
  }
  const fields = buildInputFields(inputs, current)
  for (const row of fields.rows) el.appendChild(row)

  const apply = (): void => {
    onApply(fields.read())
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
    if (e.key === 'Enter') apply()
    else if (e.key === 'Escape') dismiss()
  })

  container.appendChild(el)
  fields.first()?.focus?.()
}

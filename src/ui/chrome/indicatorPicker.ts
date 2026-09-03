// The indicator picker: a dialog over the 23 built-in definitions, grouped by category, with a
// search field over name, tag and description, keyboard rows, and one verb: add. Adding composes
// an instance from the definition and runs `chart.indicators.add`; the access policy's indicator
// predicate is read for the row, so a refused definition renders disabled and says why.
import { BUILT_IN_INDICATORS, type BuiltInIndicator, type IndicatorCategory } from '../../builtInIndicators'
import type { ChartMessageKey } from '../../i18n'
import type { AccessPolicy, IndicatorInstance } from '../../widget/options'
import { activeChart, type ChromeContext } from './context'
import { dialogTitle, openDialog, type DialogHandle } from './dialog'
import { h, replace, roveFocus } from './dom'

export interface IndicatorPickerDeps extends ChromeContext {
  access?: AccessPolicy
}

/** The category headings, in picker order. */
const CATEGORIES: readonly { id: IndicatorCategory; label: ChartMessageKey }[] = [
  { id: 'ma', label: 'picker.categoryMa' },
  { id: 'band', label: 'picker.categoryBand' },
  { id: 'osc', label: 'picker.categoryOsc' },
  { id: 'vol', label: 'picker.categoryVol' },
]

/** Whether the policy permits a definition. A predicate that throws refuses. */
export function indicatorPermitted(access: AccessPolicy | undefined, id: string): boolean {
  if (!access?.indicator) return true
  try {
    return access.indicator(id) !== false
  } catch {
    return false
  }
}

/** An instance id no instance on the chart holds: the definition id, then a counter. */
export function freshInstanceId(definitionId: string, existing: readonly IndicatorInstance[]): string {
  const taken = new Set(existing.map((i) => i.id))
  let n = 1
  while (taken.has(`${definitionId}-${n}`)) n++
  return `${definitionId}-${n}`
}

/** The definitions a query keeps: a case-insensitive match on the name, the tag, or the
 *  description, in the chart's language. */
export function filterDefinitions(t: ChromeContext['i18n']['t'], query: string, definitions: readonly BuiltInIndicator[] = BUILT_IN_INDICATORS): BuiltInIndicator[] {
  const q = query.trim().toLowerCase()
  if (!q) return [...definitions]
  return definitions.filter((d) => [t(d.nameKey), d.tag, t(d.descriptionKey)].some((text) => text.toLowerCase().includes(q)))
}

export function openIndicatorPicker(deps: IndicatorPickerDeps): DialogHandle {
  const t = deps.i18n.t
  let query = ''
  return openDialog({
    host: deps.overlays,
    label: t('picker.title'),
    className: 'qc-picker-dialog',
    width: 520,
    build(box, dialog) {
      const input = h('input', { type: 'search', class: 'qc-field qc-picker-search', 'aria-label': t('picker.search'), placeholder: t('picker.search'), autocomplete: 'off', spellcheck: 'false' })
      const list = h('div', { class: 'qc-picker-list', role: 'listbox', 'aria-label': t('picker.title') })
      const status = h('div', { class: 'qc-picker-status qc-secondary', role: 'status', 'aria-live': 'polite' })
      const add = (definition: BuiltInIndicator): void => {
        const chart = activeChart(deps)
        const instance: IndicatorInstance = { id: freshInstanceId(definition.id, chart.indicators.get()), definition }
        if (deps.commands.execute('chart.indicators.add', instance).kind === 'ok') dialog.close()
      }
      const render = (): void => {
        const kept = filterDefinitions(t, query)
        const children: HTMLElement[] = []
        for (const category of CATEGORIES) {
          const group = kept.filter((d) => d.category === category.id)
          if (group.length === 0) continue
          children.push(h('div', { class: 'qc-dialog-heading', role: 'presentation' }, t(category.label)))
          for (const definition of group) {
            const permitted = indicatorPermitted(deps.access, definition.id)
            const row = h(
              'button',
              {
                type: 'button',
                class: 'qc-picker-row',
                role: 'option',
                'data-qc-item': '',
                tabindex: '-1',
                'aria-selected': 'false',
                'aria-label': permitted ? t('picker.add', { name: t(definition.nameKey) }) : t('picker.notPermitted', { name: t(definition.nameKey) }),
                'data-indicator': definition.id,
              },
              h('span', { class: 'qc-picker-name' }, t(definition.nameKey), h('span', { class: 'qc-picker-tag qc-muted' }, definition.tag)),
              h('span', { class: 'qc-picker-description qc-secondary' }, t(definition.descriptionKey)),
            )
            if (!permitted) {
              row.disabled = true
              row.setAttribute('aria-disabled', 'true')
            }
            row.addEventListener('click', () => add(definition))
            children.push(row)
          }
        }
        replace(list, ...children)
        status.textContent = kept.length === 0 ? t('picker.noMatches') : ''
      }
      input.addEventListener('input', () => {
        query = input.value
        render()
      })
      input.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          roveFocus(list, e)
        }
      })
      list.addEventListener('keydown', (e) => {
        if (roveFocus(list, e)) {
          e.preventDefault()
          return
        }
        if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) {
          e.preventDefault()
          input.focus()
        }
      })
      box.append(dialogTitle(t('picker.title'), t('search.close'), () => dialog.close()), h('div', { class: 'qc-dialog-body' }, input, list, status))
      render()
    },
    initialFocus: (box) => box.querySelector<HTMLElement>('.qc-picker-search'),
  })
}

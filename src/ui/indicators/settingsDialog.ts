// The settings dialog for one indicator instance: Inputs (when the manifest declares any), Style and
// Visibility, the rows of each built from the manifest (./rows), in the frame, page strip, fields
// and footer the drawing dialog stands in, so the chart's dialogs read as one.
//
// The dialog is an edit session over a draft of the instance. Every edit previews on the chart at
// once through the session the chart lends it, while the chart's content keeps the instance as it
// was: Ok commits the draft as one `chart.indicators.update`, and Cancel, Escape, the corner close
// and a press outside put the instance back by ending the preview. The footer's Defaults menu
// resets the draft to the definition's own defaults, or keeps the draft as the defaults the
// definition's next instances open with. A host policy that refuses the update draws every control
// disabled, since the session could not be committed.
import type { IndicatorOverrides } from '../../indicatorModel'
import { manifestInputDefaults } from '../../indicatorModel'
import { DEFAULT_VISIBILITY, type TimeframeVisibility } from '../../internal/drawings/index'
import type { ChartHandle } from '../../widget/chart'
import { indicatorMarkOf, indicatorTitleOf } from '../../widget/indicators'
import type { IndicatorInstance } from '../../widget/options'
import type { ChromeContext } from '../chrome/context'
import type { IndicatorEditSession } from '../chrome/doors'
import { selectChevron } from '../controls/select'
import { openDialog } from '../drawings/dialog'
import { button, el, focusFirst, menuKeys } from '../drawings/dom'
import { dialogTabs, openPopover, reopenPopover, timeframeVisibilityRows } from '../drawings/fields'
import { inputRows, styleRows } from './rows'

export interface IndicatorSettingsDeps extends ChromeContext {
  chart: ChartHandle
  instance: IndicatorInstance
  session: IndicatorEditSession
}

export interface IndicatorSettingsHandle {
  /** The dialog's box. */
  element: HTMLElement
  /** End the session as Cancel does. */
  close(): void
}

type Tab = 'inputs' | 'style' | 'visibility'

const TAB_LABEL = { inputs: 'settings.tabInputs', style: 'settings.tabStyle', visibility: 'settings.tabVisibility' } as const

let nextDialogId = 0

/** A copy of an instance an edit can change without reaching the one the chart holds. */
const draftOf = (instance: IndicatorInstance): IndicatorInstance => ({
  ...instance,
  ...(instance.inputs ? { inputs: { ...instance.inputs } } : {}),
  ...(instance.overrides ? { overrides: JSON.parse(JSON.stringify(instance.overrides)) as IndicatorOverrides } : {}),
})

/** An instance written down with its keys in order, so two instances holding the same values compare
 *  equal. */
const written = (instance: IndicatorInstance): string => JSON.stringify({ inputs: instance.inputs ?? {}, overrides: instance.overrides ?? {} }, (_key, value: unknown) =>
  value && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))) : value,
)

export function openIndicatorSettings(deps: IndicatorSettingsDeps): IndicatorSettingsHandle {
  const t = deps.i18n.t
  const { instance, session } = deps
  const manifest = instance.definition.manifest
  const hasInputs = Object.keys(manifest.inputs ?? {}).length > 0
  const tabs: Tab[] = [...(hasInputs ? (['inputs'] as const) : []), 'style', 'visibility']
  const idBase = `qc-indicator-settings-${++nextDialogId}`
  let tab: Tab = tabs[0]!
  let draft = draftOf(instance)
  let settled = false
  const editable = (): boolean => deps.commands.available('chart.indicators.update')

  const dialog = openDialog({
    container: deps.overlays,
    title: t('settings.indicatorTitle', { name: indicatorTitleOf(instance, t) }),
    heading: indicatorMarkOf(instance, t),
    closeLabel: t('drawing.close'),
    icons: deps.icons,
    role: 'indicator-settings',
    veil: false,
    motion: false,
    // Escape, the corner close or a press outside ends the session as the dialog begins to close.
    onClosing: () => {
      if (!settled) cancel()
    },
  })
  dialog.box.classList.add('qc-drawing-settings-dialog', 'qc-indicator-settings-dialog')

  const strip = el('div', { class: 'qc-drawing-tabs-slot' }, el('span', { class: 'qc-drawing-tabs-track', 'aria-hidden': 'true' }))
  const page = el('div', { class: 'qc-drawing-page', role: 'tabpanel', id: `${idBase}-page` })
  dialog.body.before(strip)
  dialog.body.append(page)
  const tabId = (id: string): string => `${idBase}-tab-${id}`

  /** The dialog keeps the place it opened at while pages of other sizes come and go. */
  const hold = (): void => {
    const box = dialog.box
    if (box.style.position === 'fixed' || !(box.offsetWidth > 0)) return
    box.style.position = 'fixed'
    box.style.left = `${Math.round(box.offsetLeft)}px`
    box.style.top = `${Math.round(box.offsetTop)}px`
  }

  /** A page shown lands the keyboard in its first field with what it holds selected. */
  const focusField = (): boolean => {
    const field = page.querySelector<HTMLInputElement>('input.qc-field:not(:disabled)')
    if (!field) return false
    field.focus({ preventScroll: true })
    field.select()
    return true
  }

  /** Take an edit: the draft changes, the chart draws it, and the page shows it. */
  const change = (next: IndicatorInstance): void => {
    if (settled) return
    draft = next
    session.preview(draft)
    render()
  }
  const withOverrides = (overrides: IndicatorOverrides): IndicatorInstance => {
    const { overrides: _overrides, ...bare } = draft
    return Object.keys(overrides).length > 0 ? { ...bare, overrides } : bare
  }

  const render = (): void => {
    const base = { t, icons: deps.icons, box: dialog.layer }
    const overrides = draft.overrides ?? {}
    const rows =
      tab === 'inputs'
        ? inputRows({ ...base, manifest, values: { ...manifestInputDefaults(manifest), ...draft.inputs }, onInput: (key, value) => change({ ...draft, inputs: { ...draft.inputs, [key]: value } }) })
        : tab === 'style'
          ? styleRows({
              ...base,
              manifest,
              overrides,
              instanceColor: draft.color ?? deps.widget.theme.get()['series.neutral'],
              neutral: deps.widget.theme.get()['series.neutral'],
              hasInputs,
              onOverrides: (next) => change(withOverrides(next)),
            })
          : timeframeVisibilityRows(t, deps.icons, overrides.visibility ?? DEFAULT_VISIBILITY, (patch: Partial<TimeframeVisibility>) => change(withOverrides({ ...overrides, visibility: { ...(overrides.visibility ?? DEFAULT_VISIBILITY), ...patch } })), t('settings.indicatorPinnedNote'))
    page.replaceChildren(...rows)
    page.dataset.tab = tab
    if (!editable()) for (const control of page.querySelectorAll<HTMLButtonElement | HTMLInputElement>('button, input')) control.disabled = true
  }

  strip.appendChild(
    dialogTabs(
      tabs,
      tab,
      (id) => t(TAB_LABEL[id as Tab]),
      (id) => {
        hold()
        tab = id as Tab
        page.setAttribute('aria-labelledby', tabId(tab))
        render()
        focusField()
      },
      { tab: tabId, panel: `${idBase}-page` },
    ),
  )
  page.setAttribute('aria-labelledby', tabId(tab))

  const cancel = (): void => {
    if (settled) return
    settled = true
    session.preview(null)
    dialog.close()
  }
  const ok = (): void => {
    if (settled) return
    settled = true
    session.preview(null)
    if (written(draft) !== written(instance)) deps.commands.execute('chart.indicators.update', draft)
    dialog.close()
  }

  // An Enter in a field takes what it holds and commits the session.
  page.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || !(event.target instanceof HTMLInputElement) || event.target.type === 'checkbox') return
    event.preventDefault()
    event.target.dispatchEvent(new Event('change'))
    ok()
  })

  // The footer: the Defaults menu, then Cancel and Ok.
  const defaults = el(
    'button',
    { type: 'button', class: 'qc-field qc-drawing-template-button', 'aria-label': t('settings.defaults'), 'aria-haspopup': 'menu', 'aria-expanded': 'false' },
    el('span', { class: 'qc-drawing-select-value', text: t('settings.defaults') }),
    selectChevron(deps.icons),
  ) as HTMLButtonElement
  let closeMenu: (() => void) | null = null
  defaults.addEventListener('click', () => {
    if (closeMenu) {
      closeMenu()
      return
    }
    const menu = el('div', { class: 'qc-drawing-menu qc-drawing-list qc-drawing-template-menu', role: 'menu', 'aria-label': t('settings.defaults') })
    const rowOf = (text: string, enabled: boolean, onPick: () => void): HTMLButtonElement => {
      const item = el('button', { type: 'button', class: 'qc-menu-row qc-drawing-list-row', role: 'menuitem' }, el('span', { class: 'qc-menu-label', text })) as HTMLButtonElement
      item.disabled = !enabled
      item.addEventListener('click', () => {
        closeMenu?.()
        onPick()
      })
      return item
    }
    menu.append(
      // The definition's own inputs and look, the instance's color and its hidden state kept.
      rowOf(t('settings.resetSettings'), editable(), () => {
        const { inputs: _inputs, overrides: _overrides, ...bare } = draft
        change(draft.overrides?.display?.hidden ? { ...bare, overrides: { display: { hidden: true } } } : bare)
      }),
      rowOf(t('settings.saveAsDefault'), true, () => session.saveDefault(draft)),
    )
    const unkeys = menuKeys(menu, () => [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]')])
    const close = openPopover(
      dialog.layer,
      defaults,
      menu,
      'below',
      () => {
        unkeys()
        closeMenu = null
      },
      defaults,
      () => reopenPopover(close, menu, () => defaults),
      { gap: 0, className: 'qc-drawing-popover--list' },
    )
    closeMenu = close
    focusFirst(menu)
  })
  dialog.footer.append(
    defaults,
    el('span', { class: 'qc-drawing-footer-gap' }),
    button({ class: 'qc-button qc-drawing-footer-button qc-drawing-cancel', label: t('drawing.cancel'), text: t('drawing.cancel'), onClick: cancel }),
    button({ class: 'qc-button qc-button--primary qc-drawing-footer-button', label: t('drawing.ok'), text: t('drawing.ok'), disabled: !editable(), onClick: ok }),
  )

  render()
  if (!focusField()) strip.querySelector<HTMLElement>('[aria-selected="true"]')?.focus({ preventScroll: true })
  return { element: dialog.box, close: cancel }
}

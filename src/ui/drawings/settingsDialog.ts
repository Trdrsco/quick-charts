// The settings dialog for one drawing: Inputs, Style, Text, Table, Coordinates and Visibility
// pages, each showing the rows the tool has. The dialog is an edit session the settings command
// opened over a preview the layer holds: its rows preview LIVE on the drawing for instant
// feedback while the document keeps the snapshot taken at open, Cancel (or Escape) restores that
// snapshot, and the session's outcomes are commands through the registry: Ok commits it as one
// edit, and the footer's Template menu applies a template onto the selection, saves the current
// setup under a name, or removes a saved template. A page whose commands the registry would not
// run renders every control disabled, and so does a footer verb the registry refuses.
import type { DrawingStyle, IDrawing, IntervalVisibility, SerializedDrawing } from '../../internal/drawings/index'
import type { ChartTranslate } from '../../i18n'
import { toolName } from '../../i18n'
import { drawingTools, type DrawingAssetPort } from '../../drawings/index'
import type { DrawingPresets } from '../../drawings'
import { openDialog } from './dialog'
import { button, el, focusFirst, menuKeys } from './dom'
import { dialogTabs, openPopover } from './fields'
import { iconSvg } from './icons'
import { coordinateRows, firstTabFor, styleRows, tableRows, tabsFor, textRows, visibilityRows, TAB_LABEL, type RowsContext, type SettingsTab } from './settingsRows'
import { openTemplateDeleteDialog, openTemplateNameDialog } from './templateDialog'

export interface SettingsDialogDeps {
  /** The chrome subtree the dialog and its popovers mount into. */
  chrome: HTMLElement
  t: ChartTranslate
  drawing: IDrawing
  presets: DrawingPresets
  /** The stem every element id the dialog writes derives from: the chart's id. */
  idBase: string
  assets?: DrawingAssetPort
  /** Run a command through the registry. Answers whether it ran. */
  run(command: string, arg?: unknown): boolean
  /** Whether the registry would run a command now. */
  available(command: string): boolean
  /** The session ended: Ok committed it, or Cancel, Escape or a close restored the snapshot. */
  onClose?(outcome: 'commit' | 'cancel'): void
}

export interface SettingsDialogHandle {
  close(): void
}

export function openSettingsDialog(deps: SettingsDialogDeps): SettingsDialogHandle {
  const { t, drawing } = deps
  const snapshot: SerializedDrawing = drawing.toJSON()
  const def = drawingTools.get(drawing.type)
  const name = def ? toolName(t, def.type, def.name) : drawing.type
  let tab: SettingsTab = firstTabFor(drawing)
  let settled = false

  const dialog = openDialog({
    container: deps.chrome,
    title: t('drawing.settingsTitle', { tool: name }),
    closeLabel: t('drawing.close'),
    role: 'drawing-settings',
    width: 380,
    onClose: () => {
      if (settled) return
      cancel()
    },
  })
  dialog.box.classList.add('qc-drawing-settings-dialog')

  const strip = el('div', { class: 'qc-drawing-tabs-slot' })
  const page = el('div', { class: 'qc-drawing-page', role: 'tabpanel', id: `${deps.idBase}-page` })
  dialog.body.append(strip, page)
  const tabId = (id: string): string => `${deps.idBase}-tab-${id}`

  const renderTabs = (): void => {
    strip.replaceChildren(
      dialogTabs(
        tabsFor(drawing),
        tab,
        (id) => t(TAB_LABEL[id as SettingsTab]),
        (id) => {
          tab = id as SettingsTab
          renderTabs()
          renderPage()
        },
        { tab: tabId, panel: `${deps.idBase}-page` },
      ),
    )
    page.setAttribute('aria-labelledby', tabId(tab))
  }

  /** The commands a page's rows preview on behalf of: a page whose command the registry would
   *  not run renders every control disabled, since the session could not be committed either. */
  const PAGE_COMMANDS: Record<SettingsTab, readonly string[]> = {
    Inputs: ['chart.drawings.style', 'chart.drawings.props'],
    Style: ['chart.drawings.style', 'chart.drawings.props'],
    Text: ['chart.drawings.style', 'chart.drawings.props'],
    Table: ['chart.drawings.props'],
    Coordinates: ['chart.drawings.props'],
    Visibility: ['chart.drawings.visibility'],
  }

  const ctx: RowsContext = {
    t,
    box: dialog.box,
    drawing,
    tab,
    ...(deps.assets ? { assets: deps.assets } : {}),
    patchStyle(patch: Partial<DrawingStyle>) {
      drawing.updateStyle(patch)
      renderPage()
    },
    patchProps(patch) {
      drawing.applyProps(patch)
      renderPage()
    },
    patchQuiet(patch) {
      drawing.applyProps(patch)
    },
    patchVisibility(patch: Partial<IntervalVisibility>) {
      drawing.updateOptions({ visibility: { ...drawing.options.visibility, ...patch } })
      renderPage()
    },
    patchAnchor(index, anchor) {
      const current = drawing.anchors[index]
      if (!current) return
      drawing.updateAnchor(index, { time: (anchor.time ?? current.time) as typeof current.time, price: anchor.price ?? current.price })
    },
  }

  const renderPage = (): void => {
    ctx.tab = tab
    const rows =
      tab === 'Style' || tab === 'Inputs' ? styleRows(ctx) : tab === 'Text' ? textRows(ctx) : tab === 'Table' ? tableRows(ctx) : tab === 'Coordinates' ? coordinateRows(ctx) : visibilityRows(ctx)
    page.replaceChildren(...rows)
    if (!PAGE_COMMANDS[tab].every((command) => deps.available(command))) {
      for (const control of page.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('button, input, select, textarea')) control.disabled = true
    }
  }

  const cancel = (): void => {
    if (settled) return
    settled = true
    drawing.setAnchors(snapshot.anchors)
    drawing.updateStyle(snapshot.style)
    drawing.updateOptions(snapshot.options)
    if (snapshot.props) drawing.applyProps(snapshot.props)
    dialog.close()
    deps.onClose?.('cancel')
  }
  const ok = (): void => {
    if (settled) return
    // A commit the registry refuses keeps nothing: the session ends as a cancel would.
    if (!deps.run('chart.drawings.commitEdit')) {
      cancel()
      return
    }
    settled = true
    dialog.close()
    deps.onClose?.('commit')
  }

  // The footer: the Template menu, then Cancel and Ok.
  const template = button({ class: 'qc-button qc-drawing-template-button', label: t('drawing.template') })
  template.append(el('span', { text: t('drawing.template') }), el('span', { class: 'qc-drawing-caret', html: iconSvg('chevronDown', 18) }))
  template.setAttribute('aria-haspopup', 'menu')
  template.setAttribute('aria-expanded', 'false')
  let closeMenu: (() => void) | null = null
  /** A template applies through the registry onto the selection, which is this drawing; the
   *  document keeps the session's snapshot until Ok, so Cancel still restores it. */
  const applyTemplate = (name: string | null): void => {
    deps.run('chart.drawings.template.apply', name)
    renderPage()
  }
  template.addEventListener('click', () => {
    if (closeMenu) {
      closeMenu()
      return
    }
    const menu = el('div', { class: 'qc-drawing-menu', role: 'menu', 'aria-label': t('drawing.template') })
    const rowOf = (text: string, command: string, onPick: () => void): HTMLButtonElement => {
      const b = el('button', { type: 'button', class: 'qc-menu-row qc-drawing-menu-row', role: 'menuitem' }, el('span', { class: 'qc-menu-icon' }), el('span', { class: 'qc-menu-label', text }))
      b.disabled = !deps.available(command)
      b.addEventListener('click', () => {
        closeMenu?.()
        onPick()
      })
      return b
    }
    menu.append(
      // The save command reads the selection, which is this drawing with the session's edits on it.
      rowOf(t('drawing.saveAs'), 'chart.drawings.template.save', () => openTemplateNameDialog({ container: dialog.box, t }, (templateName) => deps.run('chart.drawings.template.save', templateName))),
      rowOf(t('drawing.applyDefaults'), 'chart.drawings.template.apply', () => applyTemplate(null)),
    )
    const saved = deps.presets.templatesFor(drawing.type)
    if (saved.length) menu.appendChild(el('div', { class: 'qc-separator', role: 'separator' }))
    for (const saved1 of saved) {
      const rowEl = el('div', { class: 'qc-drawing-flyout-row' })
      rowEl.append(
        rowOf(saved1.name, 'chart.drawings.template.apply', () => applyTemplate(saved1.name)),
        button({
          class: 'qc-drawing-star',
          label: t('drawing.removeTemplateNamed', { name: saved1.name }),
          title: t('drawing.remove'),
          html: iconSvg('trash', 18),
          disabled: !deps.available('chart.drawings.template.remove'),
          onClick: () => {
            closeMenu?.()
            openTemplateDeleteDialog({ container: dialog.box, t }, saved1.name, () => deps.run('chart.drawings.template.remove', saved1.name))
          },
        }),
      )
      menu.appendChild(rowEl)
    }
    const unkeys = menuKeys(menu, () => [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]')])
    closeMenu = openPopover(dialog.box, template, menu, 'below', () => {
      unkeys()
      closeMenu = null
    })
    focusFirst(menu)
  })
  dialog.footer.append(
    template,
    el('span', { class: 'qc-drawing-footer-gap' }),
    button({ class: 'qc-button', label: t('drawing.cancel'), text: t('drawing.cancel'), onClick: cancel }),
    button({ class: 'qc-button qc-button--primary', label: t('drawing.ok'), text: t('drawing.ok'), disabled: !deps.available('chart.drawings.commitEdit'), onClick: ok }),
  )

  renderTabs()
  renderPage()
  focusFirst(strip)
  return {
    close() {
      if (settled) return
      cancel()
    },
  }
}

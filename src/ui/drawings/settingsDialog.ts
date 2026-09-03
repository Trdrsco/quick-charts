// The settings dialog for one drawing: Inputs, Style, Text, Table, Coordinates and Visibility
// pages, each showing the rows the tool has. The dialog is an edit session the settings command
// opened: its rows and its template applications preview LIVE on the drawing for instant
// feedback and are the session's own, Cancel (or Escape) restores the snapshot taken at open, and
// the session's outcomes are commands through the registry: Ok commits it as one edit, and the
// footer's Template menu saves the current setup under a name or removes a saved template. A
// control whose command the registry would refuse renders disabled.
import type { DrawingStyle, IDrawing, IntervalVisibility, SerializedDrawing } from '@trdrs/chart-drawings'
import type { ChartTranslate } from '../../i18n'
import { toolName } from '../../i18n'
import { drawingTools, type DrawingAssetPort } from '../../drawings/index'
import type { DrawingPresets } from '../../drawings'
import type { ToolPreset } from '../../drawings/templates'
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
  const page = el('div', { class: 'qc-drawing-page' })
  dialog.body.append(strip, page)

  const renderTabs = (): void => {
    strip.replaceChildren(
      dialogTabs(tabsFor(drawing), tab, (id) => t(TAB_LABEL[id as SettingsTab]), (id) => {
        tab = id as SettingsTab
        renderTabs()
        renderPage()
      }),
    )
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
  const applyPreset = (preset: ToolPreset): void => {
    if (preset.style) drawing.updateStyle(preset.style)
    if (preset.props) drawing.applyProps(preset.props)
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
      rowOf(t('drawing.saveAs'), 'chart.drawings.template.save', () => openTemplateNameDialog({ container: deps.chrome, t }, (templateName) => deps.run('chart.drawings.template.save', templateName))),
      rowOf(t('drawing.applyDefaults'), 'chart.drawings.template.apply', () => applyPreset(deps.presets.defaultFor(drawing.type))),
    )
    const saved = deps.presets.templatesFor(drawing.type)
    if (saved.length) menu.appendChild(el('div', { class: 'qc-separator', role: 'separator' }))
    for (const saved1 of saved) {
      const rowEl = el('div', { class: 'qc-drawing-flyout-row' })
      rowEl.append(
        rowOf(saved1.name, 'chart.drawings.template.apply', () => applyPreset(saved1)),
        button({
          class: 'qc-drawing-star',
          label: t('drawing.removeTemplateNamed', { name: saved1.name }),
          title: t('drawing.remove'),
          html: iconSvg('trash', 18),
          disabled: !deps.available('chart.drawings.template.remove'),
          onClick: () => {
            closeMenu?.()
            openTemplateDeleteDialog({ container: deps.chrome, t }, saved1.name, () => deps.run('chart.drawings.template.remove', saved1.name))
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

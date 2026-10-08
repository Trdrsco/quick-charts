// The settings dialog for one drawing: Inputs, Style, Text, Table, Coordinates and Visibility
// pages, each showing the rows the tool has. The dialog is an edit session the settings command
// opened over a preview the layer holds: its rows preview LIVE on the drawing for instant
// feedback while the document keeps the snapshot taken at open, Cancel (or Escape) restores that
// snapshot, and the session's outcomes are commands through the registry: Ok commits it as one
// edit, and the footer's Template menu applies a template onto the selection, saves the current
// setup under a name, or removes a saved template. A page whose commands the registry would not
// run renders every control disabled, and so does a footer verb the registry refuses.
//
// The header carries the drawing's name, the tool's own until the viewer gives it one: the pencil
// beside it turns the header into one field holding the name, Enter or leaving the field keeps
// what was typed, and Escape puts the name back without closing the dialog. The name is part of the
// session, so Cancel restores it as well. The dialog keeps its top edge where it opened while a page
// of another height or width is shown, and a page shown lands the keyboard in its first field.
//
// The dialog edits the drawing it stands over, so it opens in place over an undimmed chart: no
// veil, and no motion in or out. Its lists and panels stand on the backdrop rather than in the box,
// so a list hangs past the dialog's edge under the control that opened it.
import type { DrawingStyle, IDrawing, TimeframeVisibility, SerializedDrawing } from '../../internal/drawings/index'
import type { ChartTranslate } from '../../i18n'
import { toolName } from '../../i18n'
import { drawingTools, type DrawingAssetPort } from '../../drawings/index'
import type { DrawingPresets } from '../../drawings'
import { openDialog } from './dialog'
import { button, el, focusFirst, menuKeys } from './dom'
import { tidyRules } from '../chrome/dom'
import { ownsEscape, pushEscapeOwner } from '../controls/escape'
import { selectChevron } from '../controls/select'
import { provideColorMemory, type ColorMemory } from '../controls/color'
import { dialogTabs, openPopover, reopenPopover } from './fields'
import { coordinateRows, firstTabFor, styleRows, tableRows, tabsFor, textRows, visibilityRows, TAB_LABEL, type RowsContext, type SettingsTab } from './settingsRows'
import { openTemplateDeleteDialog, openTemplateNameDialog } from './templateDialog'
import type { IconResolver } from '../icons/resolver'

export interface SettingsDialogDeps {
  /** The chrome subtree the dialog and its popovers mount into. */
  chrome: HTMLElement
  t: ChartTranslate
  /** Draws every glyph: the host's drawing for its icon, or the chart's own. */
  icons: IconResolver
  drawing: IDrawing
  presets: DrawingPresets
  /** The stem every element id the dialog writes derives from: the chart's id. */
  idBase: string
  assets?: DrawingAssetPort
  /** Run a command through the registry. Answers whether it ran. */
  run(command: string, arg?: unknown): boolean
  /** Whether the registry would run a command now. */
  available(command: string): boolean
  /** Whether the template menu draws a row for a command at all: false for a command the policy
   *  refuses when the host hides what it refuses. Every row is drawn without it. */
  shown?(command: string): boolean
  /** The session ended: Ok committed it, or Cancel, Escape or a close restored the snapshot. */
  onClose?(outcome: 'commit' | 'cancel'): void
  /** The colors this viewer mixed, which every color popover the dialog opens offers and adds to. */
  colors?: ColorMemory
}

export interface SettingsDialogHandle {
  close(): void
}

export function openSettingsDialog(deps: SettingsDialogDeps): SettingsDialogHandle {
  const { t, drawing } = deps
  const snapshot: SerializedDrawing = drawing.toJSON()
  const def = drawingTools.get(drawing.type)
  const toolTitle = def ? toolName(t, def.type, def.name) : drawing.type
  /** What the drawing is called: the name the viewer gave it, or its tool's. */
  const nameOf = (): string => drawing.options.name || toolTitle
  let tab: SettingsTab = firstTabFor(drawing)
  let settled = false

  const dialog = openDialog({
    container: deps.chrome,
    title: t('drawing.settingsTitle', { tool: nameOf() }),
    heading: nameOf(),
    closeLabel: t('drawing.close'),
    icons: deps.icons,
    role: 'drawing-settings',
    veil: false,
    motion: false,
    // Escape, the corner close or a press outside ends the session as the dialog begins to close,
    // so the drawing is back as it was before the exit motion starts rather than after it.
    onClosing: () => {
      if (settled) return
      cancel()
    },
  })
  dialog.box.classList.add('qc-drawing-settings-dialog')
  if (deps.colors) provideColorMemory(dialog.box, deps.colors)

  // The rename: the pencil stands beside the name and turns the header into the name's field.
  const pencil = button({ class: 'qc-drawing-rename', label: t('drawing.rename'), icon: deps.icons.icon('pencil', 28), disabled: !deps.available('chart.drawings.props') })
  dialog.heading.after(pencil)
  const showName = (): void => {
    dialog.heading.textContent = nameOf()
    dialog.box.setAttribute('aria-label', t('drawing.settingsTitle', { tool: nameOf() }))
  }
  pencil.addEventListener('click', () => {
    const field = el('input', { class: 'qc-field qc-drawing-rename-field', 'aria-label': t('drawing.name'), spellcheck: 'false' }) as HTMLInputElement
    field.value = nameOf()
    const escape = pushEscapeOwner()
    let done = false
    const finish = (keep: boolean): void => {
      if (done) return
      done = true
      escape.release()
      if (keep) {
        const typed = field.value.trim()
        drawing.updateOptions({ name: typed && typed !== toolTitle ? typed : undefined })
        showName()
      }
      delete dialog.header.dataset.qcRenaming
      field.remove()
      pencil.focus({ preventScroll: true })
    }
    field.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault()
        finish(true)
      } else if (event.key === 'Escape' && ownsEscape(escape.token)) {
        event.preventDefault()
        event.stopPropagation()
        finish(false)
      }
    })
    field.addEventListener('blur', () => finish(true))
    dialog.header.dataset.qcRenaming = 'true'
    dialog.header.appendChild(field)
    field.focus({ preventScroll: true })
    field.select()
  })

  // The page strip stands between the header and the scrolling page, so it never scrolls away.
  const strip = el('div', { class: 'qc-drawing-tabs-slot' }, el('span', { class: 'qc-drawing-tabs-track', 'aria-hidden': 'true' }))
  const page = el('div', { class: 'qc-drawing-page', role: 'tabpanel', id: `${deps.idBase}-page` })
  dialog.body.before(strip)
  dialog.body.append(page)
  const tabId = (id: string): string => `${deps.idBase}-tab-${id}`

  /** The dialog keeps its top and leading edges where it opened while pages of other sizes come
   *  and go: once it has a measured place, that place is held. */
  const hold = (): void => {
    const box = dialog.box
    if (box.style.position === 'fixed' || !(box.offsetWidth > 0)) return
    box.style.position = 'fixed'
    box.style.left = `${Math.round(box.offsetLeft)}px`
    box.style.top = `${Math.round(box.offsetTop)}px`
  }

  /** A page shown lands the keyboard in its first field with what it holds selected, as a field a
   *  viewer is about to type over; a page with no field keeps the keyboard where it was. */
  const focusField = (): boolean => {
    const field = page.querySelector<HTMLInputElement | HTMLTextAreaElement>('input.qc-field:not(:disabled), textarea:not(:disabled)')
    if (!field) return false
    field.focus({ preventScroll: true })
    field.select()
    return true
  }

  strip.appendChild(
    dialogTabs(
      tabsFor(drawing),
      tab,
      (id) => t(TAB_LABEL[id as SettingsTab]),
      (id) => {
        hold()
        tab = id as SettingsTab
        page.setAttribute('aria-labelledby', tabId(tab))
        renderPage()
        focusField()
      },
      { tab: tabId, panel: `${deps.idBase}-page` },
    ),
  )
  page.setAttribute('aria-labelledby', tabId(tab))

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
    icons: deps.icons,
    box: dialog.layer,
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
    patchVisibility(patch: Partial<TimeframeVisibility>) {
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
    page.dataset.tab = tab
    if (!PAGE_COMMANDS[tab].every((command) => deps.available(command))) {
      for (const control of page.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('button, input, select, textarea')) control.disabled = true
    }
  }

  const cancel = (): void => {
    if (settled) return
    settled = true
    drawing.setAnchors(snapshot.anchors)
    drawing.updateStyle(snapshot.style)
    drawing.updateOptions({ ...snapshot.options, name: snapshot.options.name })
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
  const template = el(
    'button',
    { type: 'button', class: 'qc-field qc-drawing-template-button', 'aria-label': t('drawing.template'), 'aria-haspopup': 'menu', 'aria-expanded': 'false' },
    el('span', { class: 'qc-drawing-select-value', text: t('drawing.template') }),
    selectChevron(deps.icons),
  ) as HTMLButtonElement
  let closeMenu: (() => void) | null = null
  /** A template applies through the registry onto the selection, which is this drawing, and the
   *  page shows what it set at once; the document keeps the session's snapshot until Ok, so Cancel
   *  still restores it. Apply defaults is the tool's own look and setup, the words and the name
   *  kept. */
  const applyTemplate = (name: string | null): void => {
    deps.run('chart.drawings.template.apply', name)
    renderPage()
  }
  template.addEventListener('click', () => {
    if (closeMenu) {
      closeMenu()
      return
    }
    const menu = el('div', { class: 'qc-drawing-menu qc-drawing-list qc-drawing-template-menu', role: 'menu', 'aria-label': t('drawing.template') })
    const rowOf = (text: string, command: string, onPick: () => void): HTMLButtonElement => {
      const b = el('button', { type: 'button', class: 'qc-menu-row qc-drawing-list-row', role: 'menuitem' }, el('span', { class: 'qc-menu-label', text }))
      b.disabled = !deps.available(command)
      b.hidden = !(deps.shown?.(command) ?? true)
      b.addEventListener('click', () => {
        closeMenu?.()
        onPick()
      })
      return b
    }
    menu.append(
      // The save command reads the selection, which is this drawing with the session's edits on it.
      rowOf(t('drawing.saveAs'), 'chart.drawings.template.save', () => openTemplateNameDialog({ container: dialog.box, t, icons: deps.icons }, (templateName) => deps.run('chart.drawings.template.save', templateName))),
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
          icon: deps.icons.icon('trash', 18),
          disabled: !deps.available('chart.drawings.template.remove'),
          onClick: () => {
            closeMenu?.()
            openTemplateDeleteDialog({ container: dialog.box, t, icons: deps.icons }, saved1.name, () => deps.run('chart.drawings.template.remove', saved1.name))
          },
        }),
      )
      const remove = rowEl.querySelector<HTMLElement>('.qc-drawing-star')
      if (remove) remove.hidden = !(deps.shown?.('chart.drawings.template.remove') ?? true)
      rowEl.hidden = !(deps.shown?.('chart.drawings.template.apply') ?? true)
      menu.appendChild(rowEl)
    }
    // A row left out leaves the menu, and a rule with nothing on one side of it goes with it.
    for (const row of [...menu.children]) if ((row as HTMLElement).hidden) row.remove()
    tidyRules(menu, (child) => !child.hidden)
    const unkeys = menuKeys(menu, () => [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]')])
    const close = openPopover(dialog.layer, template, menu, 'below', () => {
      unkeys()
      closeMenu = null
    }, template, () => reopenPopover(close, menu, () => template), { gap: 0, className: 'qc-drawing-popover--list' })
    closeMenu = close
    focusFirst(menu)
  })
  dialog.footer.append(
    template,
    el('span', { class: 'qc-drawing-footer-gap' }),
    button({ class: 'qc-button qc-drawing-footer-button qc-drawing-cancel', label: t('drawing.cancel'), text: t('drawing.cancel'), onClick: cancel }),
    button({ class: 'qc-button qc-button--primary qc-drawing-footer-button', label: t('drawing.ok'), text: t('drawing.ok'), disabled: !deps.available('chart.drawings.commitEdit'), onClick: ok }),
  )

  renderPage()
  if (!focusField()) strip.querySelector<HTMLElement>('[aria-selected="true"]')?.focus({ preventScroll: true })
  return {
    close() {
      if (settled) return
      cancel()
    },
  }
}

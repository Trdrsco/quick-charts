// The saved-layouts menu: the layout's name on the toolbar (the button that saves it, carrying Save
// under the name while autosave is off and there is something to write), and a menu with Save, the
// Autosave switch, Make a copy, Rename and Create new layout, each asking its name in a dialog, the
// three most recent layouts with the stars they share with the dialog, and Open layout, the Layouts
// dialog. The dialogs themselves are the chrome's (`layoutDialogs`), and whether there is something
// to save is the widget's (`layoutChanges`), so hiding this menu leaves both working. A saved layout
// is listed by what it shows: the market and interval of its active chart at the last save, or its
// age where its store kept neither. Every verb is a widget command (`widget.layout.save`, `rename`,
// `load`, `open`, `delete`, `create`, `autosave`), so a policy that forbids layout writes disables
// the rows here and refuses them from every other door; the menu hears what a verb did through the
// widget's `layout` event and what it refused through `saveConflict`. The recent rows read the
// chrome's layout catalog, which already holds the store's listing when the menu opens.
//
// A layout holding content it could not put back is written nowhere: the name on the toolbar says
// so, Save and the autosave stand down, and Make a copy stays on so the trader can put what is on
// screen somewhere of its own. Opening a saved layout is what starts the saving again.
import { isApplePlatform } from '../../platform'
import type { LayoutMeta } from '../../resources'
import type { LayoutChanges } from '../../widget/layoutChanges'
import { type ChromeContext } from './context'
import { switchRow } from './dialog'
import { button, h, name, reglyph, replace } from './dom'
import { FLYOUT_WIDTH } from './flyoutGeometry'
import { ICONS } from '../controls/icons'
import type { LayoutCatalog } from './layoutCatalog'
import { listingFacts, type LayoutDialogs, type NameQuestion } from './layoutDialogs'
import type { LayoutListStore } from './preferences'
import { menuItem, menuHeading, menuSeparator, openMenu, toggleMenu, type MenuHandle } from './menu'

export interface LayoutsMenuDeps extends ChromeContext {
  /** The saved layouts as the chrome lists them, or null when the host saves none. */
  catalog: LayoutCatalog | null
  /** The viewer's autosave switch, as the widget holds it. */
  autosave: { get(): boolean }
  notify(kind: 'info' | 'error', text: string): void
  /** The layouts the viewer starred, which the recent rows star alongside the Layouts dialog. */
  listing: LayoutListStore
  /** The name dialog and the Layouts dialog, which the rows raise. */
  dialogs: LayoutDialogs
  /** Whether the open layout holds changes it has not written. */
  changes: LayoutChanges
}

export interface LayoutsMenuHandle {
  element: HTMLElement
  sync(): void
  destroy(): void
}

/** How long ago, in the language: CLDR's short relative form for minutes, hours and days. The
 *  short style, because the narrow one writes a bare signed number ("-5 min") in several languages. */
export function relativeTime(tag: string, updatedAt: number, now: number = Date.now()): string {
  const mins = Math.round((now - updatedAt) / 60_000)
  const rtf = new Intl.RelativeTimeFormat(tag, { numeric: 'auto', style: 'short' })
  if (mins < 60) return rtf.format(-Math.max(0, mins), 'minute')
  if (mins < 24 * 60) return rtf.format(-Math.round(mins / 60), 'hour')
  return rtf.format(-Math.round(mins / (24 * 60)), 'day')
}

export function mountLayoutsMenu(deps: LayoutsMenuDeps): LayoutsMenuHandle {
  const t = (): ChromeContext['i18n']['t'] => deps.i18n.t
  const { commands } = deps
  const saveLoad = deps.widget.layout.saveLoad
  const dirty = (): boolean => deps.changes.unsaved()
  let menu: MenuHandle | null = null
  /** Paints the open menu's recent rows from the catalog; null while the menu is closed. */
  let paintRecents: (() => void) | null = null

  const element = h('div', { class: 'qc-layouts' })
  const nameLabel = h('span', { class: 'qc-layouts-name' })
  const saveLink = h('span', { class: 'qc-layouts-save' })
  /** Whether the name offers a save: there is something unwritten, autosave is not writing it (it
   *  writes only a layout already saved under a name), and the layout may be written at all.
   *  Otherwise the name is a label that reads at full strength. */
  const offersSave = (): boolean => dirty() && !(deps.autosave.get() && saveLoad.current()) && !notSaving() && can('widget.layout.save')
  const title = button({ label: t()('layouts.saveLayout'), className: 'qc-toolbar-button qc-layouts-title', onClick: () => { if (offersSave()) quickSave() } })
  title.append(h('span', { class: 'qc-layouts-text' }, nameLabel, saveLink))
  const trigger = button({ label: t()('layouts.manage'), icon: deps.icons.glyph(ICONS.menuArrowWide, { size: 8, height: 4, className: 'qc-caret' }), className: 'qc-toolbar-button qc-layouts-caret', onClick: () => toggleMenu(trigger, open) })
  trigger.setAttribute('aria-haspopup', 'menu')
  trigger.setAttribute('aria-expanded', 'false')
  element.append(title, trigger)

  const currentName = (): string => saveLoad.current()?.name ?? t()('layouts.unnamed')
  /** A recent layout's second line: what it shows, or how long ago it was saved. */
  const listingLine = (row: LayoutMeta): string => listingFacts(t(), row) ?? relativeTime(deps.i18n.tag(), row.updatedAt)
  const can = (id: string): boolean => commands.available(id)
  /** A recent layout: its row, with the star it shares with the Layouts dialog standing at the row's
   *  end, under the pointer or once starred. The star is the pointer's shortcut and stays out of the
   *  menu's keyboard order; the dialog keeps favoriting in reach of the keys. */
  const recentRow = (row: LayoutMeta, chosen: boolean, handle: MenuHandle): HTMLElement => {
    const item = menuItem({
      text: row.name,
      description: listingLine(row),
      role: 'menuitemradio',
      checked: chosen,
      disabled: !can('widget.layout.load'),
      onSelect: () => {
        handle.close()
        commands.execute('widget.layout.load', row.id)
      },
    })
    const star = button({
      label: t()('layouts.favorite'),
      className: 'qc-layouts-recent-star',
      onClick: (event) => {
        event.stopPropagation()
        deps.listing.toggleFavorite(row.id)
        paintStar()
      },
    })
    star.tabIndex = -1
    const paintStar = (): void => {
      const starred = deps.listing.isFavorite(row.id)
      name(star, t()(starred ? 'layouts.unfavorite' : 'layouts.favorite'))
      star.setAttribute('aria-pressed', String(starred))
      reglyph(star, deps.icons, starred ? ICONS.starFilled : ICONS.star, { size: 18 })
    }
    paintStar()
    return h('div', { class: 'qc-layouts-recent', role: 'none', 'data-current': chosen ? 'true' : undefined }, item, star)
  }
  /** The layout holds content it could not put back. Nothing writes it back over the layout it is
   *  bound to, so the rows that would try are off and the name says why; Make a copy stays on,
   *  because a copy writes over nothing, and a trader who has work on screen should be able to keep
   *  it. Only opening a saved layout turns the rest back on. */
  const notSaving = (): boolean => saveLoad.notSaving()

  /** Ask a name in the dialog every naming verb shares; the menu gives way as it is raised. */
  const askName = (question: NameQuestion): void => deps.dialogs.askName(question)

  /** The toolbar's Save: the open layout through the command, or the name dialog for a never-saved
   *  one. The command raises the dialog itself through the chrome's door, so this is one call. */
  const quickSave = (): void => {
    commands.execute('widget.layout.save')
  }

  const open = (): void => {
    if (menu) {
      menu.refresh()
      return
    }
    menu = openMenu({
      host: deps.overlays,
      anchor: trigger,
      label: t()('layouts.manage'),
      role: 'dialog',
      className: 'qc-layouts-menu',
      width: FLYOUT_WIDTH.layouts,
      align: 'end',
      build(body, handle) {
        const current = saveLoad.current()
        body.appendChild(
          menuItem({
            text: t()('layouts.saveLayout'),
            hint: t()('layouts.hintSave', { modifier: t()(isApplePlatform() ? 'drawing.modifierCommand' : 'drawing.modifierControl') }),
            keys: isApplePlatform() ? 'Meta+S' : 'Control+S',
            disabled: !dirty() || notSaving() || !can('widget.layout.save'),
            onSelect: () => {
              // One call for both: the command writes an open layout, and raises the name dialog
              // through the chrome door when the layout has never been saved.
              handle.close()
              commands.execute('widget.layout.save')
            },
          }),
        )
        body.appendChild(
          switchRow({
            label: t()('layouts.autosave'),
            checked: deps.autosave.get(),
            disabled: !can('widget.layout.autosave'),
            onChange: (on) => {
              // The command catches a dirty layout up when it switches autosave on.
              commands.execute('widget.layout.autosave', on)
              // The toolbar follows and the menu is left standing: a rebuild would swap the switch
              // just pressed for a new one already at its end, and the knob would jump, not slide.
              syncBar()
            },
          }),
        )
        body.appendChild(
          menuItem({
            text: t()('layouts.makeCopyRow'),
            icon: deps.icons.glyph(ICONS.clone, { size: 28 }),
            disabled: !can('widget.layout.save'),
            onSelect: () =>
              askName({
                title: 'layouts.copyTitle',
                label: 'layouts.newLayoutName',
                verb: 'layouts.save',
                value: t()('layouts.copyOfName', { name: currentName() }),
                commit: (name) => commands.execute('widget.layout.save', { name, asNew: true }).kind === 'ok',
              }),
          }),
        )
        body.appendChild(
          menuItem({
            text: t()('layouts.renameRow'),
            icon: deps.icons.glyph(ICONS.pencil, { size: 28 }),
            disabled: !can('widget.layout.rename'),
            onSelect: () =>
              askName({
                title: 'layouts.renameTitle',
                label: 'layouts.newLayoutName',
                verb: 'layouts.rename',
                value: currentName(),
                commit: (name) => commands.execute('widget.layout.rename', name).kind === 'ok',
              }),
          }),
        )
        // The active chart's loaded bars as a file. A chart-scoped command, so it writes the chart
        // the trader is looking at and the access policy refuses it from here exactly as it would
        // from a host toolbar; a chart holding no bars leaves the row disabled.
        body.appendChild(
          menuItem({
            text: t()('layouts.downloadDataRow'),
            icon: deps.icons.glyph(ICONS.download, { size: 28 }),
            disabled: !can('chart.data.download'),
            onSelect: () => {
              handle.close()
              commands.execute('chart.data.download')
            },
          }),
        )
        // Making a new layout is set apart from the verbs on the one that is open.
        body.appendChild(menuSeparator())
        body.appendChild(
          menuItem({
            text: t()('layouts.createNewRow'),
            icon: deps.icons.glyph(ICONS.plusThin, { size: 28 }),
            disabled: !can('widget.layout.create'),
            // A new layout by the name it is given: the market and interval on screen, nothing else
            // of the open layout, and the open one left as it was saved.
            onSelect: () =>
              askName({
                title: 'layouts.createTitle',
                label: 'layouts.newLayoutName',
                verb: 'layouts.create',
                placeholder: 'layouts.createPlaceholder',
                commit: (name) => commands.execute('widget.layout.create', name).kind === 'ok',
              }),
          }),
        )
        body.appendChild(menuSeparator())
        body.appendChild(menuHeading(t()('layouts.recentlyUsed')))
        const recents = h('div', { class: 'qc-layouts-recents' })
        // The rows the catalog holds, painted now; the listing each open asks for repaints them.
        // Before the store's first answer the line says it is loading, or why it could not list.
        const showRecents = (): void => {
          const rows = deps.catalog?.rows() ?? (deps.catalog ? null : [])
          if (rows === null) {
            replace(recents, h('div', { class: 'qc-menu-note qc-muted' }, t()(deps.catalog?.failed() ? 'layouts.errList' : 'layouts.loading')))
            return
          }
          const sorted = [...rows].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 3)
          replace(
            recents,
            sorted.length === 0 ? h('div', { class: 'qc-menu-note qc-muted' }, t()('layouts.emptyNone')) : null,
            ...sorted.map((row) => recentRow(row, current?.ref.id === row.id, handle)),
          )
        }
        showRecents()
        paintRecents = showRecents
        body.appendChild(recents)
        void deps.catalog?.refresh().catch(() => undefined)
        body.appendChild(menuSeparator())
        body.appendChild(
          menuItem({
            text: t()('layouts.openLayoutRow'),
            icon: deps.icons.glyph(ICONS.folder, { size: 28 }),
            hint: t()('layouts.hintOpen'),
            keys: '.',
            disabled: !deps.catalog || !can('widget.layout.open'),
            onSelect: () => {
              handle.close()
              commands.execute('widget.layout.open')
            },
          }),
        )
      },
      onClose: () => {
        menu = null
        paintRecents = null
      },
    })
  }

  /** The toolbar's half: the name, what it says about saving, and whether pressing it saves. While
   *  there is nothing to save the name is marked unavailable rather than disabled, so it keeps its
   *  ink and its tooltip still says where the layout stands. */
  const syncBar = (): void => {
    const state = notSaving() ? 'layouts.notSaving' : dirty() ? 'layouts.unsavedChanges' : 'layouts.allSaved'
    const offer = offersSave()
    nameLabel.textContent = currentName()
    nameLabel.dataset.qcDirty = String(dirty())
    nameLabel.dataset.qcNotSaving = String(notSaving())
    saveLink.textContent = t()('layouts.save')
    saveLink.hidden = !offer
    title.title = t()(state)
    // Offering a save, the control is named for what pressing it does; otherwise for what it shows.
    title.setAttribute('aria-label', offer ? t()('layouts.saveLayout') : `${currentName()}: ${t()(state)}`)
    title.setAttribute('aria-disabled', String(!offer))
    trigger.setAttribute('aria-label', t()('layouts.manage'))
    trigger.title = t()('layouts.manage')
  }

  const sync = (): void => {
    syncBar()
    menu?.refresh()
  }

  const offStrings = deps.i18n.onChange(sync)
  const offChanges = deps.changes.onChange(sync)
  // A layout dialog raised from any door stands in front of this menu, which offers the same verbs.
  const offRaise = deps.dialogs.onRaise(() => menu?.close())
  const offLayout = deps.widget.on('layout', () => sync())
  const offRefusal = deps.widget.on('saveConflict', (event) => { if (event.family === 'layout') sync() })
  const offCatalog = deps.catalog?.onChange(() => paintRecents?.()) ?? (() => undefined)
  sync()
  return {
    element,
    sync,
    destroy() {
      offStrings()
      offChanges()
      offRaise()
      offLayout()
      offRefusal()
      offCatalog()
      menu?.close()
      element.remove()
    },
  }
}

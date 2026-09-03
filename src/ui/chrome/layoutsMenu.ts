// The saved-layouts menu: the layout's name on the toolbar (a marker for unsaved changes, a Save
// link while autosave is off), and a menu with Save, the Autosave switch, Make a copy and Rename
// as inline name fields, Create new layout, the three most recent layouts, and Open layout, the
// dialog with search and delete behind a confirm. Every verb is a widget command
// (`widget.layout.save`, `rename`, `load`, `delete`, `detach`, `autosave`), so a policy that
// forbids layout writes disables the rows here and refuses them from every other door; the menu
// hears what a verb did through the widget's `layout` event and what it refused through
// `saveConflict`. Listing is a read and comes from the store directly.
import type { LayoutBody, LayoutMeta, ResourceStore } from '../../resources'
import { type ChromeContext } from './context'
import { dialogTitle, openDialog, switchRow } from './dialog'
import { button, glyph, h, replace, setDisabled } from './dom'
import { ICONS } from './icons'
import { menuItem, menuHeading, menuSeparator, openMenu, type MenuHandle } from './menu'

export interface LayoutsMenuDeps extends ChromeContext {
  /** The layouts family of the host's adapter, for the listings, or null when the host saves none. */
  store: ResourceStore<LayoutMeta, LayoutBody> | null
  /** The viewer's autosave switch, as the widget holds it. */
  autosave: { get(): boolean }
  notify(kind: 'info' | 'error', text: string): void
}

export interface LayoutsMenuHandle {
  element: HTMLElement
  /** Viewer state changed: the layout is dirty, and autosave writes it when it is on. */
  changed(): void
  sync(): void
  destroy(): void
}

/** How long ago, in the language: a relative form for minutes, hours and days. */
export function relativeTime(tag: string, updatedAt: number, now: number = Date.now()): string {
  const mins = Math.round((now - updatedAt) / 60_000)
  const rtf = new Intl.RelativeTimeFormat(tag, { numeric: 'auto', style: 'narrow' })
  if (mins < 60) return rtf.format(-Math.max(0, mins), 'minute')
  if (mins < 24 * 60) return rtf.format(-Math.round(mins / 60), 'hour')
  return rtf.format(-Math.round(mins / (24 * 60)), 'day')
}

export function mountLayoutsMenu(deps: LayoutsMenuDeps): LayoutsMenuHandle {
  const t = (): ChromeContext['i18n']['t'] => deps.i18n.t
  const { commands } = deps
  const saveLoad = deps.widget.layout.saveLoad
  let dirty = false
  let menu: MenuHandle | null = null
  /** The inline name field the menu shows at a time, with the verb it serves. */
  let naming: { mode: 'save' | 'copy' | 'rename'; value: string } | null = null
  /** The open-layout dialog's own refresh and close, while it is up. */
  let browser: { removed(id: string): void; close(): void } | null = null

  const element = h('div', { class: 'qc-layouts' })
  const nameLabel = h('span', { class: 'qc-layouts-name qc-secondary' })
  const saveLink = button({ label: t()('layouts.saveLayout'), text: t()('layouts.save'), className: 'qc-layouts-save qc-link', onClick: () => quickSave() })
  const trigger = button({ label: t()('layouts.manage'), icon: ICONS.chevronDown, iconSize: 18, className: 'qc-toolbar-button qc-layouts-caret', onClick: () => open() })
  trigger.setAttribute('aria-haspopup', 'menu')
  trigger.setAttribute('aria-expanded', 'false')
  element.append(h('span', { class: 'qc-layouts-title' }, nameLabel, saveLink), trigger)

  const currentName = (): string => saveLoad.current()?.name ?? t()('layouts.unnamed')
  const can = (id: string): boolean => commands.available(id)

  /** The toolbar's Save: the open layout through the command, or the menu opens on the name prompt
   *  for a never-saved one. */
  const quickSave = (): void => {
    if (saveLoad.current()) commands.execute('widget.layout.save')
    else {
      naming = { mode: 'save', value: '' }
      open()
    }
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
      width: 264,
      align: 'end',
      build(body, handle) {
        const current = saveLoad.current()
        body.appendChild(
          menuItem({
            text: t()('layouts.saveLayout'),
            disabled: !dirty || !can('widget.layout.save'),
            onSelect: () => {
              if (current) {
                commands.execute('widget.layout.save')
                handle.close()
              } else {
                naming = { mode: 'save', value: '' }
                handle.refresh()
              }
            },
          }),
        )
        body.appendChild(
          switchRow({
            label: t()('layouts.autosave'),
            checked: deps.autosave.get(),
            disabled: !can('widget.layout.autosave'),
            onChange: (on) => {
              commands.execute('widget.layout.autosave', on)
              if (on && dirty && current) commands.execute('widget.layout.save')
              sync()
            },
          }),
        )
        body.appendChild(menuSeparator())
        if (naming) {
          const mode = naming.mode
          const field = h('input', { type: 'text', class: 'qc-field qc-layouts-field', 'aria-label': t()('layouts.namePlaceholder'), placeholder: t()('layouts.namePlaceholder'), maxlength: '120', value: naming.value })
          const submit = button({ label: t()(mode === 'rename' ? 'layouts.renameLayout' : 'layouts.saveLayout'), text: t()(mode === 'rename' ? 'layouts.rename' : 'layouts.save'), className: 'qc-button--primary', onClick: () => commit() })
          const commit = (): void => {
            const value = field.value.trim()
            if (!value) return
            const outcome = mode === 'rename' ? commands.execute('widget.layout.rename', value) : commands.execute('widget.layout.save', { name: value, asNew: true })
            if (outcome.kind !== 'ok') return
            naming = null
            handle.close()
          }
          field.addEventListener('input', () => {
            naming = naming && { ...naming, value: field.value }
            setDisabled(submit, field.value.trim() === '')
          })
          field.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') commit()
            else if (e.key === 'Escape') {
              e.stopPropagation()
              naming = null
              handle.refresh()
            }
          })
          setDisabled(submit, field.value.trim() === '' || !can(mode === 'rename' ? 'widget.layout.rename' : 'widget.layout.save'))
          body.appendChild(h('div', { class: 'qc-layouts-naming' }, field, submit))
          queueMicrotask(() => field.focus())
        } else {
          body.appendChild(
            menuItem({
              text: t()('layouts.makeCopyRow'),
              icon: glyph(ICONS.clone, { size: 18 }),
              disabled: !can('widget.layout.save'),
              onSelect: () => {
                naming = { mode: 'copy', value: t()('layouts.copyOfName', { name: currentName() }) }
                handle.refresh()
              },
            }),
          )
          body.appendChild(
            menuItem({
              text: t()('layouts.renameRow'),
              icon: glyph(ICONS.pencil, { size: 18 }),
              disabled: !can('widget.layout.rename'),
              onSelect: () => {
                naming = { mode: 'rename', value: currentName() }
                handle.refresh()
              },
            }),
          )
        }
        body.appendChild(
          menuItem({
            text: t()('layouts.createNewRow'),
            icon: glyph(ICONS.plus, { size: 18 }),
            disabled: !can('widget.layout.detach'),
            onSelect: () => {
              // A fresh identity: the chart keeps its state and the saved binding detaches.
              commands.execute('widget.layout.detach')
              handle.close()
            },
          }),
        )
        body.appendChild(menuSeparator())
        body.appendChild(menuHeading(t()('layouts.recentlyUsed')))
        const recents = h('div', { class: 'qc-layouts-recents' }, h('div', { class: 'qc-menu-note qc-muted' }, deps.store ? t()('layouts.loading') : t()('layouts.emptyNone')))
        body.appendChild(recents)
        if (deps.store) {
          void deps.store
            .list()
            .then((rows) => {
              if (!handle.open()) return
              const sorted = [...rows].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 3)
              replace(
                recents,
                sorted.length === 0 ? h('div', { class: 'qc-menu-note qc-muted' }, t()('layouts.emptyNone')) : null,
                ...sorted.map((row) =>
                  menuItem({
                    text: row.name,
                    hint: relativeTime(deps.i18n.tag(), row.updatedAt),
                    role: 'menuitemradio',
                    checked: current?.ref.id === row.id,
                    disabled: !can('widget.layout.load'),
                    onSelect: () => {
                      handle.close()
                      commands.execute('widget.layout.load', row.id)
                    },
                  }),
                ),
              )
            })
            .catch(() => {
              if (handle.open()) replace(recents, h('div', { class: 'qc-menu-note qc-muted' }, t()('layouts.errList')))
            })
        }
        body.appendChild(menuSeparator())
        body.appendChild(
          menuItem({
            text: t()('layouts.openLayoutRow'),
            icon: glyph(ICONS.folder, { size: 18 }),
            disabled: !deps.store,
            onSelect: () => {
              handle.close()
              openBrowser()
            },
          }),
        )
      },
      onClose: () => {
        menu = null
        naming = null
      },
    })
  }

  /** The Open-layout dialog: search, every saved layout, delete behind a confirm. */
  const openBrowser = (): void => {
    const store = deps.store
    if (!store) return
    let rows: LayoutMeta[] | null = null
    let query = ''
    let confirming: LayoutMeta | null = null
    openDialog({
      host: deps.overlays,
      label: t()('layouts.openLayout'),
      className: 'qc-layouts-dialog',
      width: 480,
      build(box, handle) {
        const field = h('input', { type: 'search', class: 'qc-field qc-layouts-search', 'aria-label': t()('layouts.search'), placeholder: t()('layouts.search'), autocomplete: 'off' })
        const list = h('div', { class: 'qc-layouts-list', role: 'list' })
        const confirm = h('div', { class: 'qc-layouts-confirm', role: 'alertdialog', 'aria-label': t()('layouts.deleteConfirm'), hidden: true })
        const render = (): void => {
          if (rows === null) {
            replace(list, h('div', { class: 'qc-menu-note qc-muted' }, t()('layouts.loading')))
            return
          }
          const kept = rows.filter((r) => r.name.toLowerCase().includes(query.trim().toLowerCase()))
          if (kept.length === 0) {
            replace(list, h('div', { class: 'qc-menu-note qc-muted' }, t()(rows.length === 0 ? 'layouts.emptyNone' : 'layouts.noMatches')))
            return
          }
          const current = saveLoad.current()
          replace(
            list,
            ...kept.map((row) => {
              const openButton = button({
                label: row.name,
                className: 'qc-layouts-open',
                pressed: current?.ref.id === row.id,
                disabled: !can('widget.layout.load'),
                onClick: () => {
                  handle.close()
                  commands.execute('widget.layout.load', row.id)
                },
              })
              openButton.append(h('span', { class: 'qc-layouts-item-name' }, row.name), h('span', { class: 'qc-layouts-item-meta qc-muted' }, relativeTime(deps.i18n.tag(), row.updatedAt)))
              return h(
                'div',
                { class: 'qc-layouts-item', role: 'listitem' },
                openButton,
                button({
                  label: t()('layouts.deleteNamed', { name: row.name }),
                  icon: ICONS.trash,
                  iconSize: 18,
                  className: 'qc-layouts-delete',
                  disabled: !can('widget.layout.delete'),
                  onClick: () => {
                    confirming = row
                    renderConfirm()
                  },
                }),
              )
            }),
          )
        }
        const renderConfirm = (): void => {
          confirm.hidden = confirming === null
          if (!confirming) return
          const row = confirming
          replace(
            confirm,
            h('div', { class: 'qc-title' }, t()('layouts.deleteConfirm')),
            h('p', { class: 'qc-secondary' }, t()('layouts.deleteConfirmBody', { name: row.name })),
            h(
              'div',
              { class: 'qc-dialog-actions' },
              button({
                label: t()('layouts.cancel'),
                text: t()('layouts.cancel'),
                onClick: () => {
                  confirming = null
                  renderConfirm()
                },
              }),
              button({
                label: t()('layouts.delete'),
                text: t()('layouts.delete'),
                className: 'qc-button--danger',
                disabled: !can('widget.layout.delete'),
                onClick: () => {
                  // Conditional on the revision the listing showed; the command refuses a layout saved
                  // elsewhere since, and the widget reports the refusal.
                  commands.execute('widget.layout.delete', { id: row.id, revision: row.revision })
                  confirming = null
                  renderConfirm()
                },
              }),
            ),
          )
          confirm.querySelector<HTMLElement>('button')?.focus()
        }
        field.addEventListener('input', () => {
          query = field.value
          render()
        })
        box.append(dialogTitle(t()('layouts.openLayout'), t()('layouts.close'), () => handle.close()), h('div', { class: 'qc-dialog-body' }, field, list, confirm))
        render()
        browser = {
          removed(id) {
            rows = rows?.filter((r) => r.id !== id) ?? null
            render()
          },
          close: () => handle.close(),
        }
        void store
          .list()
          .then((found) => {
            rows = found
            render()
          })
          .catch(() => {
            rows = []
            deps.notify('error', t()('layouts.errList'))
            render()
          })
      },
      initialFocus: (box) => box.querySelector<HTMLElement>('.qc-layouts-search'),
      onClose: () => {
        browser = null
      },
    })
  }

  const sync = (): void => {
    nameLabel.textContent = currentName()
    nameLabel.title = t()(dirty ? 'layouts.unsavedChanges' : 'layouts.allSaved')
    nameLabel.setAttribute('aria-label', `${currentName()}: ${t()(dirty ? 'layouts.unsavedChanges' : 'layouts.allSaved')}`)
    nameLabel.dataset.qcDirty = String(dirty)
    saveLink.hidden = !(dirty && !deps.autosave.get() && can('widget.layout.save'))
    saveLink.setAttribute('aria-label', t()('layouts.saveLayout'))
    saveLink.title = t()('layouts.saveLayout')
    const text = saveLink.querySelector('.qc-button-text')
    if (text) text.textContent = t()('layouts.save')
    trigger.setAttribute('aria-label', t()('layouts.manage'))
    trigger.title = t()('layouts.manage')
    menu?.refresh()
  }

  const offStrings = deps.i18n.onChange(sync)
  // What a verb did: a save, an open or a detach leaves the layout clean; a delete refreshes the
  // browser's rows.
  const offLayout = deps.widget.on('layout', (event) => {
    if (event.kind === 'removed') browser?.removed(event.id ?? '')
    else dirty = false
    sync()
  })
  sync()
  return {
    element,
    changed() {
      dirty = true
      if (deps.autosave.get() && saveLoad.current() && can('widget.layout.save')) commands.execute('widget.layout.save')
      sync()
    },
    sync,
    destroy() {
      offStrings()
      offLayout()
      browser?.close()
      menu?.close()
      element.remove()
    },
  }
}

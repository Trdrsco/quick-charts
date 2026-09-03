// The saved-layouts menu: the layout's name on the toolbar (a marker for unsaved changes, a Save
// link while autosave is off), and a menu with Save, the Autosave switch, Make a copy and Rename
// as inline name fields, Create new layout, the three most recent layouts, and Open layout, the
// dialog with search and delete behind a confirm. Everything runs over `widget.layout.saveLoad`,
// the revisioned open-resource rule: a stale save is refused with the catalog's sentence rather
// than written over newer work.
import type { LayoutBody, LayoutMeta, ResourceStore } from '../../resources'
import { type ChromeContext } from './context'
import { dialogTitle, openDialog, switchRow } from './dialog'
import { button, glyph, h, replace, setDisabled } from './dom'
import { ICONS } from './icons'
import { menuItem, menuHeading, menuSeparator, openMenu, type MenuHandle } from './menu'
import type { AutosaveStore } from './preferences'

export interface LayoutsMenuDeps extends ChromeContext {
  /** The layouts family of the host's adapter, or null when the host saves none. */
  store: ResourceStore<LayoutMeta, LayoutBody> | null
  autosave: AutosaveStore
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
  const saveLoad = deps.widget.layout.saveLoad
  let dirty = false
  let busy = false
  let menu: MenuHandle | null = null
  /** The inline name field the menu shows at a time, with the verb it serves. */
  let naming: { mode: 'save' | 'copy' | 'rename'; value: string } | null = null

  const element = h('div', { class: 'qc-layouts' })
  const nameLabel = h('span', { class: 'qc-layouts-name qc-secondary' })
  const saveLink = button({ label: t()('layouts.saveLayout'), text: t()('layouts.save'), className: 'qc-layouts-save qc-link', onClick: () => void quickSave() })
  const trigger = button({ label: t()('layouts.manage'), icon: ICONS.chevronDown, iconSize: 18, className: 'qc-toolbar-button qc-layouts-caret', onClick: () => open() })
  trigger.setAttribute('aria-haspopup', 'menu')
  trigger.setAttribute('aria-expanded', 'false')
  element.append(h('span', { class: 'qc-layouts-title' }, nameLabel, saveLink), trigger)

  const currentName = (): string => saveLoad.current()?.name ?? t()('layouts.unnamed')

  const save = async (opts?: { name?: string; asNew?: boolean }): Promise<boolean> => {
    if (busy || !deps.store) return false
    busy = true
    try {
      const outcome = await saveLoad.save(opts?.name ?? currentName(), { asNew: opts?.asNew })
      if (outcome.kind === 'ok') {
        dirty = false
        return true
      }
      deps.notify('error', outcome.message)
      return false
    } catch {
      deps.notify('error', t()('layouts.errSave'))
      return false
    } finally {
      busy = false
      sync()
    }
  }
  /** The toolbar's Save: over the open layout, or the menu opens on the name prompt for a
   *  never-saved one. */
  const quickSave = async (): Promise<void> => {
    if (saveLoad.current()) await save()
    else {
      naming = { mode: 'save', value: '' }
      open()
    }
  }
  const load = async (row: LayoutMeta): Promise<void> => {
    if (busy) return
    busy = true
    try {
      const outcome = await saveLoad.load(row.id)
      if (outcome.kind !== 'ok') deps.notify('error', outcome.message)
      else dirty = false
    } catch {
      deps.notify('error', t()('layouts.errLoad'))
    } finally {
      busy = false
      sync()
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
        const canSave = !!deps.store && dirty && !busy
        body.appendChild(
          menuItem({
            text: t()('layouts.saveLayout'),
            disabled: !canSave,
            onSelect: () => {
              if (current) void save().then(() => handle.close())
              else {
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
            disabled: !deps.store,
            onChange: (on) => {
              deps.autosave.set(on)
              if (on && dirty && current) void save()
              sync()
            },
          }),
        )
        body.appendChild(menuSeparator())
        if (naming) {
          const mode = naming.mode
          const field = h('input', { type: 'text', class: 'qc-field qc-layouts-field', 'aria-label': t()('layouts.namePlaceholder'), placeholder: t()('layouts.namePlaceholder'), maxlength: '120', value: naming.value })
          const submit = button({ label: t()(mode === 'rename' ? 'layouts.renameLayout' : 'layouts.saveLayout'), text: t()(mode === 'rename' ? 'layouts.rename' : 'layouts.save'), className: 'qc-button--primary', onClick: () => void commit() })
          const commit = async (): Promise<void> => {
            const value = field.value.trim()
            if (!value) return
            const ok = await save({ name: value, asNew: mode !== 'rename' })
            if (ok) {
              naming = null
              handle.close()
            }
          }
          field.addEventListener('input', () => {
            naming = naming && { ...naming, value: field.value }
            setDisabled(submit, field.value.trim() === '')
          })
          field.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') void commit()
            else if (e.key === 'Escape') {
              e.stopPropagation()
              naming = null
              handle.refresh()
            }
          })
          setDisabled(submit, field.value.trim() === '')
          body.appendChild(h('div', { class: 'qc-layouts-naming' }, field, submit))
          queueMicrotask(() => field.focus())
        } else {
          body.appendChild(
            menuItem({
              text: t()('layouts.makeCopyRow'),
              icon: glyph(ICONS.clone, { size: 18 }),
              disabled: !deps.store,
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
              disabled: !current,
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
            onSelect: () => {
              // A fresh identity: the chart keeps its state and the saved binding detaches.
              saveLoad.detach()
              dirty = false
              handle.close()
              sync()
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
                    onSelect: () => {
                      handle.close()
                      void load(row)
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
      build(box, dialog) {
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
            ...kept.map((row) =>
              h(
                'div',
                { class: 'qc-layouts-item', role: 'listitem' },
                button({
                  label: row.name,
                  className: 'qc-layouts-open',
                  pressed: current?.ref.id === row.id,
                  onClick: () => {
                    dialog.close()
                    void load(row)
                  },
                }),
                button({
                  label: t()('layouts.deleteNamed', { name: row.name }),
                  icon: ICONS.trash,
                  iconSize: 18,
                  className: 'qc-layouts-delete',
                  onClick: () => {
                    confirming = row
                    renderConfirm()
                  },
                }),
              ),
            ),
          )
          for (const open of list.querySelectorAll<HTMLElement>('.qc-layouts-open')) {
            const row = kept[[...list.querySelectorAll('.qc-layouts-open')].indexOf(open)]!
            open.append(h('span', { class: 'qc-layouts-item-name' }, row.name), h('span', { class: 'qc-layouts-item-meta qc-muted' }, relativeTime(deps.i18n.tag(), row.updatedAt)))
          }
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
                onClick: () => void remove(row),
              }),
            ),
          )
          confirm.querySelector<HTMLElement>('button')?.focus()
        }
        const remove = async (row: LayoutMeta): Promise<void> => {
          try {
            // Conditional on the revision the listing showed: a layout saved elsewhere since is
            // refused, and the list refreshes rather than deleting work nobody saw.
            const outcome = await store.remove({ id: row.id, revision: row.revision })
            if (outcome.kind === 'conflict') deps.notify('error', t()('layouts.errDelete'))
            else {
              rows = rows?.filter((r) => r.id !== row.id) ?? null
              if (saveLoad.current()?.ref.id === row.id) saveLoad.detach()
            }
          } catch {
            deps.notify('error', t()('layouts.errDelete'))
          } finally {
            confirming = null
            renderConfirm()
            render()
            sync()
          }
        }
        field.addEventListener('input', () => {
          query = field.value
          render()
        })
        box.append(dialogTitle(t()('layouts.openLayout'), t()('layouts.close'), () => dialog.close()), h('div', { class: 'qc-dialog-body' }, field, list, confirm))
        render()
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
    })
  }

  const sync = (): void => {
    nameLabel.textContent = currentName()
    nameLabel.title = t()(dirty ? 'layouts.unsavedChanges' : 'layouts.allSaved')
    nameLabel.setAttribute('aria-label', `${currentName()}: ${t()(dirty ? 'layouts.unsavedChanges' : 'layouts.allSaved')}`)
    nameLabel.dataset.qcDirty = String(dirty)
    saveLink.hidden = !(dirty && !deps.autosave.get() && !!deps.store)
    saveLink.setAttribute('aria-label', t()('layouts.saveLayout'))
    saveLink.title = t()('layouts.saveLayout')
    const text = saveLink.querySelector('.qc-button-text')
    if (text) text.textContent = t()('layouts.save')
    trigger.setAttribute('aria-label', t()('layouts.manage'))
    trigger.title = t()('layouts.manage')
    menu?.refresh()
  }

  const offStrings = deps.i18n.onChange(sync)
  sync()
  return {
    element,
    changed() {
      dirty = true
      if (deps.autosave.get() && saveLoad.current() && deps.store) void save()
      else sync()
    },
    sync,
    destroy() {
      offStrings()
      menu?.close()
      element.remove()
    },
  }
}

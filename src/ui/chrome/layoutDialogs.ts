// The saved-layout dialogs: the name every naming verb asks for, and the Layouts dialog that lists
// what the store holds. They belong to the widget's chrome rather than to a toolbar control, so a
// command reaches them whatever controls are drawn: `widget.layout.open` raises the Layouts dialog
// and a first save raises the name dialog from the saved-layouts menu, the keyboard, a host's own
// control or an operator alike.
//
// The Layouts dialog lists the chrome's layout catalog under a sortable column with the viewer's starred ones
// first, each row opening its layout, and delete behind a confirm. Every verb is a widget command,
// so a policy that forbids layout writes disables the rows here and refuses them from every door.
import { timeframeChipLabel } from '../../timeframe'
import type { ChartMessageKey, ChartTranslate } from '../../i18n'
import type { LayoutMeta } from '../../resources'
import type { ChromeContext } from './context'
import { dialogTitle, emptyState, openDialog } from './dialog'
import { button, h, reglyph, replace } from './dom'
import { FLYOUT_WIDTH } from './flyoutGeometry'
import type { LayoutCatalog } from './layoutCatalog'
import { ICONS, type Glyph } from '../controls/icons'
import { LAYOUT_SORTS, type LayoutListStore, type LayoutSort } from './preferences'
import { menuItem, openMenu, toggleMenu } from './menu'
import { openConfirmDialog, openNameDialog } from './prompt'

export interface LayoutDialogsDeps extends ChromeContext {
  /** The saved layouts as the chrome lists them, or null when the host saves none. */
  catalog: LayoutCatalog | null
  /** The layouts the viewer starred and the order the Layouts dialog lists them in. */
  listing: LayoutListStore
  notify(kind: 'info' | 'error', text: string): void
}

/** What a naming verb asks: the dialog's words, an optional starting value, and the verb to run. */
export interface NameQuestion {
  title: ChartMessageKey
  label: ChartMessageKey
  verb: ChartMessageKey
  value?: string
  placeholder?: ChartMessageKey
  /** Run the verb and say whether it was taken; a refused one leaves the dialog up. */
  commit(name: string): boolean
}

export interface LayoutDialogs {
  /** Ask a name in the dialog every naming verb shares, one at a time. */
  askName(question: NameQuestion): void
  /** Ask a never-saved layout's name: the one dialog every first save raises before it writes. */
  nameLayout(): void
  /** Raise the Layouts dialog. False when the host saves no layouts, so there is none to open. */
  openLayouts(): boolean
  /** Hear a dialog being raised, from any door, before it opens: a surface offering the same verbs
   *  gives way to it. Returns the unsubscribe. */
  onRaise(cb: () => void): () => void
  destroy(): void
}

/** Each order's name in the sort menu. */
const SORT_LABEL = {
  'name-asc': 'layouts.sortNameAsc',
  'name-desc': 'layouts.sortNameDesc',
  'modified-asc': 'layouts.sortModifiedAsc',
  'modified-desc': 'layouts.sortModifiedDesc',
} as const satisfies Record<LayoutSort, string>

/** What a saved layout shows: the market and interval its active chart showed when it was last
 *  saved, as the toolbar wrote them, or null where its store kept neither. */
export function listingFacts(t: ChartTranslate, row: LayoutMeta): string | null {
  return row.symbol ? (row.timeframe ? t('layouts.listingFacts', { symbol: row.symbol, interval: timeframeChipLabel(row.timeframe) }) : row.symbol) : null
}

export function mountLayoutDialogs(deps: LayoutDialogsDeps): LayoutDialogs {
  const t = (): ChartTranslate => deps.i18n.t
  const { commands } = deps
  const saveLoad = deps.widget.layout.saveLoad
  const can = (id: string): boolean => commands.available(id)
  /** The name dialog up at a time. */
  let asking: ReturnType<typeof openNameDialog> | null = null
  /** The Layouts dialog's own refresh and close, while it is up. */
  let browser: { close(): void } | null = null
  /** Stops the open Layouts dialog hearing the catalog. */
  let closeBrowser = (): void => undefined
  const raising = new Set<() => void>()
  const raise = (): void => {
    for (const cb of [...raising]) cb()
  }

  const askName = (question: NameQuestion): void => {
    raise()
    asking?.close()
    asking = openNameDialog({
      host: deps.overlays,
      t: t(),
      icons: deps.icons,
      title: t()(question.title),
      label: t()(question.label),
      verb: t()(question.verb),
      ...(question.value !== undefined ? { value: question.value } : {}),
      ...(question.placeholder ? { placeholder: t()(question.placeholder) } : {}),
      commit: question.commit,
    })
  }

  const nameLayout = (): void =>
    askName({ title: 'layouts.saveNewTitle', label: 'layouts.saveNewLabel', verb: 'layouts.save', commit: (name) => commands.execute('widget.layout.save', { name, asNew: true }).kind === 'ok' })

  /** A layout's line in the Layouts dialog: what it shows, then the day and minute it was last saved. */
  const dialogLine = (row: LayoutMeta): string => {
    const date = new Intl.DateTimeFormat(deps.i18n.tag(), { dateStyle: 'medium', timeStyle: 'short', hourCycle: 'h23' }).format(row.updatedAt)
    const facts = listingFacts(t(), row)
    return facts ? t()('layouts.listingDated', { facts, date }) : date
  }

  const openBrowser = (catalog: LayoutCatalog): void => {
    let query = ''
    const collator = new Intl.Collator(deps.i18n.tag(), { sensitivity: 'base', numeric: true })
    /** The rows in the viewer's order: starred first, then by name or by when each was saved. */
    const ordered = (list: readonly LayoutMeta[]): LayoutMeta[] => {
      const order = deps.listing.sort()
      const direction = order.endsWith('asc') ? 1 : -1
      return [...list].sort((a, b) => {
        const starred = Number(deps.listing.isFavorite(b.id)) - Number(deps.listing.isFavorite(a.id))
        if (starred !== 0) return starred
        return direction * (order.startsWith('name') ? collator.compare(a.name, b.name) : a.updatedAt - b.updatedAt)
      })
    }
    openDialog({
      host: deps.overlays,
      label: t()('layouts.dialogTitle'),
      className: 'qc-layouts-dialog',
      width: 480,
      build(box, handle) {
        const input = h('input', { type: 'text', class: 'qc-layouts-search-input', 'aria-label': t()('layouts.search'), placeholder: t()('layouts.search'), autocomplete: 'off', spellcheck: 'false' })
        const field = h('div', { class: 'qc-layouts-search' }, deps.icons.glyph(ICONS.search, { size: 28, className: 'qc-layouts-search-mark' }), input)
        const sortGlyph = (): Glyph => (deps.listing.sort().endsWith('asc') ? ICONS.sortUp : ICONS.sortDown)
        const sortButton = button({ label: t()('layouts.sortBy'), icon: deps.icons.glyph(sortGlyph(), { size: 18 }), className: 'qc-layouts-sort', onClick: () => toggleMenu(sortButton, openSort) })
        sortButton.setAttribute('aria-haspopup', 'menu')
        const openSort = (): void => {
          openMenu({
            host: deps.overlays,
            anchor: sortButton,
            label: t()('layouts.sortBy'),
            className: 'qc-layouts-sort-menu',
            width: FLYOUT_WIDTH.layoutsSort,
            align: 'end',
            build(body, sortMenu) {
              for (const order of LAYOUT_SORTS) {
                body.appendChild(
                  menuItem({
                    text: t()(SORT_LABEL[order]),
                    icon: deps.icons.glyph(order.endsWith('asc') ? ICONS.sortUpRow : ICONS.sortDownRow, { size: 28 }),
                    role: 'menuitemradio',
                    checked: deps.listing.sort() === order,
                    onSelect: () => {
                      deps.listing.setSort(order)
                      sortMenu.close()
                      reglyph(sortButton, deps.icons, sortGlyph(), { size: 18 })
                      render()
                    },
                  }),
                )
              }
            },
          })
        }
        const columns = h('div', { class: 'qc-layouts-columns' }, h('span', { class: 'qc-layouts-column' }, t()('layouts.columnName')), sortButton)
        const list = h('div', { class: 'qc-layouts-list', role: 'list' })
        const render = (): void => {
          // The rows the catalog holds, or an empty list once the store refused its only listing.
          const rows = catalog.rows() ?? (catalog.failed() ? [] : null)
          if (rows === null) {
            replace(list, h('div', { class: 'qc-menu-note' }, t()('layouts.loading')))
            return
          }
          // A search reads the name and what the layout shows, as its line writes them.
          const needle = query.trim().toLowerCase()
          const kept = ordered(rows.filter((r) => r.name.toLowerCase().includes(needle) || (r.symbol ?? '').toLowerCase().includes(needle)))
          if (kept.length === 0) {
            replace(list, emptyState(t()(rows.length === 0 ? 'layouts.emptyNone' : 'layouts.noMatches'), deps.icons))
            return
          }
          const current = saveLoad.current()
          replace(
            list,
            ...kept.map((row) => {
              const starred = deps.listing.isFavorite(row.id)
              const star = button({
                label: t()(starred ? 'layouts.unfavorite' : 'layouts.favorite'),
                icon: deps.icons.glyph(starred ? ICONS.starFilled : ICONS.star, { size: 18 }),
                className: 'qc-layouts-star',
                pressed: starred,
                onClick: () => {
                  deps.listing.toggleFavorite(row.id)
                  render()
                },})
              const openButton = button({
                label: row.name,
                className: 'qc-layouts-open',
                disabled: !can('widget.layout.load'),
                onClick: () => {
                  handle.close()
                  commands.execute('widget.layout.load', row.id)
                },
              })
              openButton.append(h('span', { class: 'qc-layouts-item-name' }, row.name), h('span', { class: 'qc-layouts-item-meta' }, dialogLine(row)))
              const remove = button({
                label: t()('layouts.deleteNamed', { name: row.name }),
                icon: deps.icons.glyph(ICONS.removeRow, { size: 18 }),
                className: 'qc-layouts-delete',
                disabled: !can('widget.layout.delete'),
                onClick: () => askDelete(row),})
              const item = h('div', { class: 'qc-layouts-item', role: 'listitem' }, star, openButton, remove)
              // The layout on screen stands inverted among the rest, as a chosen row does in a list.
              if (current?.ref.id === row.id) {
                item.setAttribute('aria-current', 'true')
                openButton.setAttribute('aria-current', 'true')
              }
              return item
            }),
          )
        }
        const askDelete = (row: LayoutMeta): void => {
          openConfirmDialog({
            host: deps.overlays,
            t: t(),
            icons: deps.icons,
            title: t()('layouts.deleteConfirm'),
            body: t()('layouts.deleteConfirmBody', { name: row.name }),
            verb: t()('layouts.delete'),
            destructive: true,
            enabled: can('widget.layout.delete'),
            role: 'layout-delete',
            // Conditional on the revision the listing showed; the command refuses a layout saved
            // elsewhere since, and the widget reports the refusal.
            confirm: () => commands.execute('widget.layout.delete', { id: row.id, revision: row.revision }),
          })
        }
        input.addEventListener('input', () => {
          query = input.value
          render()
        })
        box.append(dialogTitle(t()('layouts.dialogTitle'), t()('layouts.close'), () => handle.close(), deps.icons), field, columns, h('div', { class: 'qc-layouts-body' }, list))
        render()
        closeBrowser = catalog.onChange(render)
        browser = {
          close: () => handle.close(),
        }
        // The rows in hand stand while the store is asked again; its answer repaints them.
        void catalog.refresh().catch(() => {
          deps.notify('error', t()('layouts.errList'))
        })
      },
      initialFocus: (box) => box.querySelector<HTMLElement>('.qc-layouts-search-input'),
      onClose: () => {
        closeBrowser()
        browser = null
      },
    })
  }

  const offLayout = deps.widget.on('layout', (event) => {
    if (event.kind !== 'removed') return
    // A deleted layout leaves the favorites with its row.
    deps.listing.forget(event.id ?? '')
  })

  return {
    askName,
    nameLayout,
    openLayouts() {
      const catalog = deps.catalog
      if (!catalog) return false
      // One dialog at a time: asking again while it is up leaves it where it is.
      if (!browser) {
        raise()
        openBrowser(catalog)
      }
      return true
    },
    onRaise(cb) {
      raising.add(cb)
      return () => {
        raising.delete(cb)
      }
    },
    destroy() {
      raising.clear()
      offLayout()
      browser?.close()
      asking?.close()
    },
  }
}

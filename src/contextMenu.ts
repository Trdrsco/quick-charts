// The chart's right-click menu, as a MODEL: which rows a level offers, in what order, with what
// wording. The menu's shape is its own contract —
// order, verbatim labels, shortcuts, and which rows carry a checkmark rather than a changing label.
//
// The model is pure so the same rows serve every host: this library's embedders render it with
// their own chrome, and the widget renders it with its own. Nothing here knows about React, the DOM, or
// how a row is painted; a host maps `id` to its own handler and `icon` to its own glyph.
//
// A row's `id` is what a host acts on and its `label` is what a viewer reads, so the language only
// ever reaches the label: pass `t` for the widget's language, and the rows read English without it.
// The symbol and the level a row quotes are the pane's own values. A host's own rows for the level
// (an alert, for example) come from an extension, and the painter appends them below these.
import { isApplePlatform } from './platform'
import { englishChartStrings, type ChartTranslate } from './i18n'

/** Every action the menu can offer. A host handles the ids it supports and passes `has` flags for
 *  the rest — an unsupported action simply never becomes a row. */
export type ChartMenuAction =
  | 'table-add-column'
  | 'table-add-row'
  | 'table-remove-row'
  | 'table-remove-column'
  | 'reset-view'
  | 'copy-price'
  | 'paste'
  | 'remove-indicators'
  | 'remove-drawings'
  | 'settings'

/** The glyph a row wears, named rather than drawn — the host owns the artwork. */
export type ChartMenuIcon = 'reset' | 'settings' | 'check' | 'table-add-column' | 'table-add-row' | 'delete'

export type ChartMenuRow =
  | { kind: 'separator' }
  | {
      kind: 'item'
      id: ChartMenuAction
      label: string
      shortcut?: string
      icon?: ChartMenuIcon
      /** A CHECKABLE row: state is marked with a checkmark in the icon cell and never by
       *  rewording the label, so "Lock vertical cursor line by time" reads the same either way. */
      checked?: boolean
    }

export interface ChartMenuContext {
  /** The level the pointer landed on, already formatted in the pane's own precision. */
  priceText: string
  /** The pane's display symbol — a contributed row that acts on the market names it. */
  symbol: string
  /** Counts drive both the wording and whether the row appears at all. */
  indicatorCount: number
  drawingCount: number
  /** A drawing clipboard exists. Default true: Paste is offered whether or not anything
   *  is copied, and pasting nothing is a no-op — but a host with no clipboard at all omits it. */
  canPaste?: boolean
  /** A settings surface exists to open. Default true; a host without one omits the row. */
  canSettings?: boolean
  /** The level lies on a table. Its rows add a column right of the cell being typed in and a row
   *  below it, or at the table's ends where no cell is, and with a cell, remove its row and its
   *  column. Omitted where the level lies on none. */
  table?: { cell: boolean }
  /** The widget's language for the row labels. Omitted ⇒ English. */
  t?: ChartTranslate
}

/** The menu's groups, top to bottom. A painter composing contributed rows places them by slot:
 *  rows that act on the level follow `clipboard`, and switches over what the chart shows follow
 *  `remove`. A table under the level leads with its own two groups. */
export type ChartMenuSlot = 'table' | 'tableCell' | 'view' | 'clipboard' | 'remove' | 'settings'

export interface ChartMenuGroup {
  slot: ChartMenuSlot
  rows: ChartMenuRow[]
}

/** The menu a level offers as GROUPS, in one fixed order. An empty group is still named, so a
 *  painter can place rows after it, and it draws nothing. */
export function chartContextMenuGroups(c: ChartMenuContext): ChartMenuGroup[] {
  const t = c.t ?? englishChartStrings()

  // Paste rides whether or not the clipboard holds anything — pasting
  // nothing is a no-op, and a row that comes and goes with an invisible buffer reads as a glitch.
  const clipboard: ChartMenuRow[] = [{ kind: 'item', id: 'copy-price', label: t('menu.copyPrice', { price: c.priceText }) }]
  if (c.canPaste !== false) clipboard.push({ kind: 'item', id: 'paste', label: t('menu.paste'), shortcut: t('drawing.hintPaste', { modifier: t(isApplePlatform() ? 'drawing.modifierCommand' : 'drawing.modifierControl') }) })

  const remove: ChartMenuRow[] = []
  if (c.indicatorCount > 0) remove.push({ kind: 'item', id: 'remove-indicators', label: t('menu.removeIndicators', { count: c.indicatorCount }) })
  if (c.drawingCount > 0) remove.push({ kind: 'item', id: 'remove-drawings', label: t('menu.removeDrawings', { count: c.drawingCount }) })

  // A table under the level leads with its own rows: the adds, then the removes of the cell being
  // typed in.
  const table: ChartMenuRow[] = c.table
    ? [
        { kind: 'item', id: 'table-add-column', label: t('drawing.addColumnRight'), icon: 'table-add-column' },
        { kind: 'item', id: 'table-add-row', label: t('drawing.addRowBelow'), icon: 'table-add-row' },
      ]
    : []
  const tableCell: ChartMenuRow[] = c.table?.cell
    ? [
        { kind: 'item', id: 'table-remove-row', label: t('drawing.removeRow'), icon: 'delete' },
        { kind: 'item', id: 'table-remove-column', label: t('drawing.removeColumn'), icon: 'delete' },
      ]
    : []

  return [
    { slot: 'table', rows: table },
    { slot: 'tableCell', rows: tableCell },
    { slot: 'view', rows: [{ kind: 'item', id: 'reset-view', label: t('menu.resetView'), shortcut: 'Alt + R', icon: 'reset' }] },
    { slot: 'clipboard', rows: clipboard },
    { slot: 'remove', rows: remove },
    { slot: 'settings', rows: c.canSettings !== false ? [{ kind: 'item', id: 'settings', label: t('menu.settings'), icon: 'settings' }] : [] },
  ]
}

/** Groups flattened into one list: separators between GROUPS that survived, never around an
 *  empty one, so a menu missing a group has no gap where it would have been. */
export function flattenMenuGroups(groups: readonly (readonly ChartMenuRow[])[]): ChartMenuRow[] {
  const rows: ChartMenuRow[] = []
  for (const g of groups.filter((g) => g.length > 0)) {
    if (rows.length) rows.push({ kind: 'separator' })
    rows.push(...g)
  }
  return rows
}

/** The menu a level offers, in one fixed order. */
export function chartContextMenu(c: ChartMenuContext): ChartMenuRow[] {
  return flattenMenuGroups(chartContextMenuGroups(c).map((g) => g.rows))
}

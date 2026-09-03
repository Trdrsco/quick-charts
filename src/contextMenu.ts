// The chart's right-click menu, as a MODEL: which rows a level offers, in what order, with what
// wording. The menu's shape is its own contract —
// order, verbatim labels, shortcuts, and which rows carry a checkmark rather than a changing label.
//
// The model is pure so the same rows serve every host: this library's embedders render it with
// their own chrome, and the app renders it with ours. Nothing here knows about React, the DOM, or
// how a row is painted; a host maps `id` to its own handler and `icon` to its own glyph.
//
// A row's `id` is what a host acts on and its `label` is what a viewer reads, so the language only
// ever reaches the label: pass `t` for the widget's language, and the rows read English without it.
// The symbol and the level a row quotes are the pane's own values. Rows that act on an account
// (the orders a level can hold) or on an application service (an alert) are not the chart's: an
// extension contributes them for the level, and the painter appends them below these.
import { isApplePlatform } from './platform'
import { englishChartStrings, type ChartTranslate } from './i18n'

/** Every action the menu can offer. A host handles the ids it supports and passes `has` flags for
 *  the rest — an unsupported action simply never becomes a row. */
export type ChartMenuAction =
  | 'reset-view'
  | 'copy-price'
  | 'paste'
  | 'remove-indicators'
  | 'remove-drawings'
  | 'settings'

/** The glyph a row wears, named rather than drawn — the host owns the artwork. */
export type ChartMenuIcon = 'reset' | 'settings' | 'check'

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
  /** The widget's language for the row labels. Omitted ⇒ English. */
  t?: ChartTranslate
}

/** The menu a level offers, in one fixed order. Separators are emitted between GROUPS
 *  that survived, never around an empty one, so a menu missing a group has no gap where it would
 *  have been. */
export function chartContextMenu(c: ChartMenuContext): ChartMenuRow[] {
  const t = c.t ?? englishChartStrings()
  const groups: ChartMenuRow[][] = []

  groups.push([{ kind: 'item', id: 'reset-view', label: t('menu.resetView'), shortcut: 'Alt + R', icon: 'reset' }])

  // Paste rides whether or not the clipboard holds anything — pasting
  // nothing is a no-op, and a row that comes and goes with an invisible buffer reads as a glitch.
  const clip: ChartMenuRow[] = [{ kind: 'item', id: 'copy-price', label: t('menu.copyPrice', { price: c.priceText }) }]
  if (c.canPaste !== false) clip.push({ kind: 'item', id: 'paste', label: t('menu.paste'), shortcut: t('drawing.hintPaste', { modifier: t(isApplePlatform() ? 'drawing.modifierCommand' : 'drawing.modifierControl') }) })
  groups.push(clip)

  const remove: ChartMenuRow[] = []
  if (c.indicatorCount > 0) remove.push({ kind: 'item', id: 'remove-indicators', label: t('menu.removeIndicators', { count: c.indicatorCount }) })
  if (c.drawingCount > 0) remove.push({ kind: 'item', id: 'remove-drawings', label: t('menu.removeDrawings', { count: c.drawingCount }) })
  groups.push(remove)

  if (c.canSettings !== false) groups.push([{ kind: 'item', id: 'settings', label: t('menu.settings'), icon: 'settings' }])

  const rows: ChartMenuRow[] = []
  for (const g of groups.filter((g) => g.length > 0)) {
    if (rows.length) rows.push({ kind: 'separator' })
    rows.push(...g)
  }
  return rows
}

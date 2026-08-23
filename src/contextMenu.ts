// The chart's right-click menu, as a MODEL: which rows a level offers, in what order, with what
// wording. The reference's own menu is the shape (see the layouts corpus for the live capture) —
// order, verbatim labels, shortcuts, and which rows carry a checkmark rather than a changing label.
//
// The model is pure so the same rows serve every host: this library's embedders render it with
// their own chrome, and the app renders it with ours. Nothing here knows about React, the DOM, or
// how a row is painted; a host maps `id` to its own handler and `icon` to its own glyph.

/** Every action the menu can offer. A host handles the ids it supports and passes `has` flags for
 *  the rest — an unsupported action simply never becomes a row. */
export type ChartMenuAction =
  | 'reset-view'
  | 'copy-price'
  | 'paste'
  | 'add-alert'
  | 'trade-sell-limit'
  | 'trade-buy-limit'
  | 'trade-sell-stop'
  | 'trade-buy-stop'
  | 'trade-new-order'
  | 'remove-indicators'
  | 'remove-drawings'
  | 'hide-marks'
  | 'settings'

/** The glyph a row wears, named rather than drawn — the host owns the artwork. */
export type ChartMenuIcon = 'reset' | 'alert' | 'sell' | 'buy' | 'order' | 'settings' | 'check'

export type ChartMenuRow =
  | { kind: 'separator' }
  | {
      kind: 'item'
      id: ChartMenuAction
      label: string
      shortcut?: string
      icon?: ChartMenuIcon
      /** A CHECKABLE row: the reference marks state with a checkmark in the icon cell and never by
       *  rewording the label, so "Lock vertical cursor line by time" reads the same either way. */
      checked?: boolean
    }

export interface ChartMenuContext {
  /** The level the pointer landed on, already formatted in the pane's own precision. */
  priceText: string
  /** The pane's display symbol — the reference names it in every row that acts on the market. */
  symbol: string
  /** Order size the trade rows quote ("Sell 1 ESU6 @ …"). Omitted when the host cannot say what the
   *  ticket will send — a quoted "1" that the ticket then overrides would be a lie about an order. */
  qty?: number
  /** true above the pane's live mark, false below, null with no mark (both directions offered). */
  aboveMarket: boolean | null
  /** This pane charts the instrument the ticket is armed on. False elsewhere, and the trade rows
   *  vanish: a seed carries a price and no symbol, so an entry taken from another market's chart
   *  would arm the ticket at a price that is not its own. */
  tradable: boolean
  /** The host can seed an order ticket at all (an account context exists). */
  canTrade: boolean
  /** Alerts need no account, so this rides for every viewer the host allows. */
  canAlert: boolean
  /** Counts drive both the wording and whether the row appears at all. */
  indicatorCount: number
  drawingCount: number
  marksHidden: boolean
}

/** The two orders a level can HOLD, and only those: above the market that is a sell limit and a buy
 *  stop, below it a buy limit and a sell stop. Neither fills on arrival — an entry that would fill
 *  at once is a market order, not the order the trader pointed at.
 *
 *  The LIMIT row leads in both directions, which is the reference's own ordering: above the market
 *  it lists Sell then Buy, below it Buy then Sell. Measured, not assumed. */
function tradeRows(c: ChartMenuContext): ChartMenuRow[] {
  const below = c.aboveMarket === false
  const at = `${c.qty === undefined ? '' : `${c.qty} `}${c.symbol} @ ${c.priceText}`
  const sell: ChartMenuRow = {
    kind: 'item',
    id: below ? 'trade-sell-stop' : 'trade-sell-limit',
    label: `Sell ${at} ${below ? 'stop' : 'limit'}`,
    shortcut: 'Alt + Shift + S',
    icon: 'sell',
  }
  const buy: ChartMenuRow = {
    kind: 'item',
    id: below ? 'trade-buy-limit' : 'trade-buy-stop',
    label: `Buy ${at} ${below ? 'limit' : 'stop'}`,
    icon: 'buy',
  }
  return [
    ...(below ? [buy, sell] : [sell, buy]),
    { kind: 'item', id: 'trade-new-order', label: `Add order on ${c.symbol} at ${c.priceText}…`, shortcut: 'Shift + T', icon: 'order' },
  ]
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`

/** The menu a level offers, in the reference's own order. Separators are emitted between GROUPS
 *  that survived, never around an empty one, so a menu missing its trade rows has no gap where
 *  they would have been. */
export function chartContextMenu(c: ChartMenuContext): ChartMenuRow[] {
  const groups: ChartMenuRow[][] = []

  groups.push([{ kind: 'item', id: 'reset-view', label: 'Reset chart view', shortcut: 'Alt + R', icon: 'reset' }])

  // Paste rides whether or not the clipboard holds anything, as the reference's does — pasting
  // nothing is a no-op, and a row that comes and goes with an invisible buffer reads as a glitch.
  groups.push([
    { kind: 'item', id: 'copy-price', label: `Copy price ${c.priceText}` },
    { kind: 'item', id: 'paste', label: 'Paste', shortcut: 'Ctrl + V' },
  ])

  const market: ChartMenuRow[] = []
  if (c.canAlert) {
    market.push({ kind: 'item', id: 'add-alert', label: `Add alert on ${c.symbol} at ${c.priceText}…`, shortcut: 'Alt + A', icon: 'alert' })
  }
  if (c.canTrade && c.tradable) market.push(...tradeRows(c))
  groups.push(market)

  const remove: ChartMenuRow[] = []
  if (c.indicatorCount > 0) remove.push({ kind: 'item', id: 'remove-indicators', label: `Remove ${plural(c.indicatorCount, 'indicator')}` })
  if (c.drawingCount > 0) remove.push({ kind: 'item', id: 'remove-drawings', label: `Remove ${plural(c.drawingCount, 'drawing')}` })
  groups.push(remove)

  groups.push([{ kind: 'item', id: 'hide-marks', label: 'Hide marks on bars', checked: c.marksHidden }])

  groups.push([{ kind: 'item', id: 'settings', label: 'Settings…', icon: 'settings' }])

  const rows: ChartMenuRow[] = []
  for (const g of groups.filter((g) => g.length > 0)) {
    if (rows.length) rows.push({ kind: 'separator' })
    rows.push(...g)
  }
  return rows
}

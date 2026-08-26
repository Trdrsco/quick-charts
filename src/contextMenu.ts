// The chart's right-click menu, as a MODEL: which rows a level offers, in what order, with what
// wording. The reference's own menu is the shape (see the layouts corpus for the live capture) —
// order, verbatim labels, shortcuts, and which rows carry a checkmark rather than a changing label.
//
// The model is pure so the same rows serve every host: this library's embedders render it with
// their own chrome, and the app renders it with ours. Nothing here knows about React, the DOM, or
// how a row is painted; a host maps `id` to its own handler and `icon` to its own glyph.
//
// A row's `id` is what a host acts on and its `label` is what a trader reads, so the language only
// ever reaches the label: pass `t` for the widget's language, and the rows read English without it.
// The symbol, the level and the size a row quotes are the pane's own values.
import { englishChartStrings, type ChartTranslate } from './i18n'

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
  /** true above the pane's live mark, false below, null with no mark — where the directional pair
   *  is WITHHELD, because which orders a level can hold is a fact about the market. */
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
  /** Whether trade marks are hidden, or NULL where the host draws none — the row then never
   *  appears, because a switch for something that is not on the chart is noise. */
  marksHidden: boolean | null
  /** A drawing clipboard exists. Default true: the reference offers Paste whether or not anything
   *  is copied, and pasting nothing is a no-op — but a host with no clipboard at all omits it. */
  canPaste?: boolean
  /** A settings surface exists to open. Default true; a host without one omits the row. */
  canSettings?: boolean
  /** The widget's language for the row labels. Omitted ⇒ English. */
  t?: ChartTranslate
}

/** The two orders a level can HOLD, and only those: above the market that is a sell limit and a buy
 *  stop, below it a buy limit and a sell stop. Neither fills on arrival — an entry that would fill
 *  at once is a market order, not the order the trader pointed at.
 *
 *  The LIMIT row leads in both directions, which is the reference's own ordering: above the market
 *  it lists Sell then Buy, below it Buy then Sell. Measured, not assumed. */
function tradeRows(c: ChartMenuContext): ChartMenuRow[] {
  const t = c.t ?? englishChartStrings()
  const addOrder = (): ChartMenuRow => ({
    kind: 'item',
    id: 'trade-new-order',
    label: t('menu.addOrder', { symbol: c.symbol, price: c.priceText }),
    shortcut: 'Shift + T',
    icon: 'order',
  })
  // With NO market there is no answer: which orders a level can hold is a fact ABOUT the market,
  // so the pair is withheld rather than guessed. "Add order" survives — it opens the ticket, where
  // the trader names the side themselves. Guessing here once shipped a sell limit BELOW the market.
  if (c.aboveMarket === null) return [addOrder()]
  const below = c.aboveMarket === false
  const at = `${c.qty === undefined ? '' : `${c.qty} `}${c.symbol} @ ${c.priceText}`
  const sell: ChartMenuRow = {
    kind: 'item',
    id: below ? 'trade-sell-stop' : 'trade-sell-limit',
    label: t(below ? 'menu.sellStop' : 'menu.sellLimit', { at }),
    shortcut: 'Alt + Shift + S',
    icon: 'sell',
  }
  const buy: ChartMenuRow = {
    kind: 'item',
    id: below ? 'trade-buy-limit' : 'trade-buy-stop',
    label: t(below ? 'menu.buyLimit' : 'menu.buyStop', { at }),
    icon: 'buy',
  }
  return [...(below ? [buy, sell] : [sell, buy]), addOrder()]
}

/** The menu a level offers, in the reference's own order. Separators are emitted between GROUPS
 *  that survived, never around an empty one, so a menu missing its trade rows has no gap where
 *  they would have been. */
export function chartContextMenu(c: ChartMenuContext): ChartMenuRow[] {
  const t = c.t ?? englishChartStrings()
  const groups: ChartMenuRow[][] = []

  groups.push([{ kind: 'item', id: 'reset-view', label: t('menu.resetView'), shortcut: 'Alt + R', icon: 'reset' }])

  // Paste rides whether or not the clipboard holds anything, as the reference's does — pasting
  // nothing is a no-op, and a row that comes and goes with an invisible buffer reads as a glitch.
  const clip: ChartMenuRow[] = [{ kind: 'item', id: 'copy-price', label: t('menu.copyPrice', { price: c.priceText }) }]
  if (c.canPaste !== false) clip.push({ kind: 'item', id: 'paste', label: t('menu.paste'), shortcut: 'Ctrl + V' })
  groups.push(clip)

  const market: ChartMenuRow[] = []
  if (c.canAlert) {
    market.push({ kind: 'item', id: 'add-alert', label: t('menu.addAlert', { symbol: c.symbol, price: c.priceText }), shortcut: 'Alt + A', icon: 'alert' })
  }
  if (c.canTrade && c.tradable) market.push(...tradeRows(c))
  groups.push(market)

  const remove: ChartMenuRow[] = []
  if (c.indicatorCount > 0) remove.push({ kind: 'item', id: 'remove-indicators', label: t('menu.removeIndicators', { count: c.indicatorCount }) })
  if (c.drawingCount > 0) remove.push({ kind: 'item', id: 'remove-drawings', label: t('menu.removeDrawings', { count: c.drawingCount }) })
  groups.push(remove)

  if (c.marksHidden !== null) groups.push([{ kind: 'item', id: 'hide-marks', label: t('menu.hideMarks'), checked: c.marksHidden }])

  if (c.canSettings !== false) groups.push([{ kind: 'item', id: 'settings', label: t('menu.settings'), icon: 'settings' }])

  const rows: ChartMenuRow[] = []
  for (const g of groups.filter((g) => g.length > 0)) {
    if (rows.length) rows.push({ kind: 'separator' })
    rows.push(...g)
  }
  return rows
}

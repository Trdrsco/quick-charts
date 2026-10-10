// The context menu on the chart's own right-click, the price menu the price scale's plus opens, and
// the rules for raising them.
//
// The right-click menu's rows come from `chartContextMenu`, so an embedder's chart offers what a
// richer host's does minus what this chart cannot serve. Every built-in row runs through the
// command registry rather than a switch of its own, which is what makes a feature-hidden or
// access-denied verb refuse from the menu exactly as it refuses from the keyboard. Contributed rows
// carry their own action and ride below the built-ins, so a host cannot displace the chart's own
// order.
//
// The price menu holds the actions on one price and nothing else: every `level` row the extensions
// contribute for it, each extension's rows together, and then the chart's own horizontal line at it.
import type { IChartApi, ISeriesApi, SeriesType } from 'lightweight-charts'
import { mountMenu, type ContextMenuExtraRow, type PriceMenuPlacement, type PriceMenuRow } from '../contextMenuUi'
import type { ChartMenuAction } from '../contextMenu'
import type { ChartExtensionHost, ChartExtensionMenuItem } from '../extension'
import type { ChartI18n } from '../i18n'
import type { PriceFormatter } from '../priceFormatter'
import type { CommandRegistry } from './commands'
import type { IconResolver } from '../ui/icons/resolver'
import { normalizeShortcut } from './shortcuts'

/** The command each built-in menu row runs. Named here so the menu and the registry cannot drift
 *  into two vocabularies for the same verb. The settings row is the one the chart's own menu never
 *  renders (the settings dialog belongs to the selected drawing's own surfaces), so it maps to
 *  nothing and is refused as unknown rather than silently routed. */
export const MENU_COMMAND: Partial<Record<ChartMenuAction, string>> = {
  'table-add-column': 'chart.drawings.tableAddColumn',
  'table-add-row': 'chart.drawings.tableAddRow',
  'table-remove-row': 'chart.drawings.tableRemoveRow',
  'table-remove-column': 'chart.drawings.tableRemoveColumn',
  'reset-view': 'chart.view.reset',
  'copy-price': 'chart.price.copy',
  paste: 'chart.drawings.paste',
  'remove-indicators': 'chart.indicators.removeAll',
  'remove-drawings': 'chart.drawings.removeAll',
}

/** The command the price menu's horizontal line row runs, with the row's price. */
export const PLACE_HORIZONTAL_LINE = 'chart.drawings.placeHorizontalLine'

export interface MenuPlane {
  /** Raise the menu at a viewport point. False when the point holds no readable level. */
  raiseAt(clientX: number, clientY: number): boolean
  /** Raise the price menu under the scale's plus, for the price at the crosshair's height `at.y`.
   *  `keyboard` puts the focus on its first row. False when that height holds no readable level or
   *  nothing offers a row for it. */
  raisePriceMenu(at: PriceMenuPlacement & { y: number }, keyboard: boolean): boolean
  /** The rows the host contributes for the level under a viewport point, the table there named
   *  where the press landed on one: what a drawing's own menu carries for the host. Empty where the
   *  point holds no readable level or no host contributes. */
  itemsAt(clientX: number, clientY: number, table: { cell: boolean } | null): readonly ChartExtensionMenuItem[]
  /** Run the contributed row bound to a press, at the level under a viewport point, WITHOUT
   *  raising the menu. False when the point holds no readable level or no contributed row claims
   *  the press. */
  runShortcutAt(clientX: number, clientY: number, pressed: string): boolean
  close(): void
  /** Rebuild an open menu's rows, asking the access policy again. A closed menu stays closed. */
  refresh(): void
  destroy(): void
}

export interface MenuDeps {
  chart: IChartApi
  series(): ISeriesApi<SeriesType>
  /** The gesture box, and the element the menu mounts into: the widget's layer on the body. */
  gestures: HTMLElement
  /** How far the main pane stands down from the gesture box's top: 0 while it is the first pane. */
  paneTop?(): number
  host: HTMLElement
  i18n: ChartI18n
  /** Draws the menu's own glyphs: the host's drawing for each icon, or the chart's own. */
  icons: IconResolver
  commands: CommandRegistry
  formatter(): PriceFormatter
  /** The smallest move the symbol's format declares: the grid a named level is snapped to. */
  minMove(): number
  symbol(): string
  /** The symbol's display name, which the rows print. */
  symbolName(): string
  timeframe(): string
  indicatorCount(): number
  drawingCount(): number
  extensions(): ChartExtensionHost | null
  /** The level the open menu was raised at, handed to the copy-price command. */
  setLevel(price: number | null): void
  /** The table the right-click that raised the menu landed on, and whether a cell of it is marked;
   *  null where it landed on none. */
  table?(): { cell: boolean } | null
  /** Whether a built-in row's command is drawn: false for a command the policy refuses when the
   *  host hides what it refuses. Every row is drawn without it. */
  shown?(command: string): boolean
}

/** The drawing plane's side of a right-click: the menu of the drawing the press landed on, raised
 *  with the rows a host contributes for the table there, if it is one. */
export interface DrawingMenuDoor {
  openMenuAt(clientX: number, clientY: number, extras?: (table: { cell: boolean } | null) => readonly ContextMenuExtraRow[]): boolean
}

/** Raise the menu a right-click at a viewport point asks for: the drawing's own where the press
 *  landed on a drawing, carrying the rows the host contributes for the level and, on a table, for
 *  the table, and the chart's anywhere else. False where neither rose. */
export function raiseMenuAt(drawings: DrawingMenuDoor, menu: MenuPlane, clientX: number, clientY: number): boolean {
  return drawings.openMenuAt(clientX, clientY, (table) => menu.itemsAt(clientX, clientY, table)) || menu.raiseAt(clientX, clientY)
}

export function attachMenuPlane(deps: MenuDeps): MenuPlane {
  const menu = mountMenu(
    deps.host,
    (id) => {
      const command = MENU_COMMAND[id]
      if (command) deps.commands.execute(command)
    },
    deps.i18n,
    deps.icons,
    (id) => {
      const command = MENU_COMMAND[id]
      return command === undefined || (deps.shown?.(command) ?? true)
    },
  )

  /** The level under a viewport point, snapped to the symbol's own grid: the price a row names is
   *  one the market can actually hold. */
  const priceAt = (clientY: number): number | null => {
    const box = deps.gestures.getBoundingClientRect()
    const price = deps.series().coordinateToPrice(clientY - box.top - (deps.paneTop?.() ?? 0))
    if (price == null || !(price > 0)) return null
    const step = deps.minMove()
    return Math.round(price / step) * step
  }

  const raiseAt = (clientX: number, clientY: number): boolean => {
    const price = priceAt(clientY)
    if (price == null) return false
    deps.setLevel(price)
    const priceText = deps.formatter().format(price)
    const table = deps.table?.() ?? null
    // Contributed rows are asked for at the raise, so they can depend on the level pressed, and
    // they carry their own actions: the chart routes nothing on their behalf.
    const extra: readonly ChartExtensionMenuItem[] =
      deps.extensions()?.menuItems({ price, priceText, symbol: deps.symbol(), name: deps.symbolName(), timeframe: deps.timeframe(), clientX, clientY, ...(table ? { table } : {}) }) ?? []
    menu.open(
      { clientX, clientY },
      {
        priceText,
        symbol: deps.symbol(),
        // The context menu's paste row is live exactly when the paste command would run (a copied
        // drawing on the clipboard, the verb permitted). It offers no settings row: the settings
        // dialog belongs to the selected drawing's own surfaces, which the drawing plane mounts
        // and the chart.drawings.* commands drive.
        canPaste: deps.commands.available('chart.drawings.paste'),
        canSettings: false,
        indicatorCount: deps.indicatorCount(),
        drawingCount: deps.drawingCount(),
        ...(table ? { table } : {}),
      },
      extra,
    )
    return true
  }

  /** The keyboard's half of a contributed row. The rows are asked for at the pressed level exactly
   *  as the right-click asks for them, and the row's own `run` is what fires, so a shortcut and a
   *  click at one spot are one code path and can never come to disagree. A row a contribution did
   *  not offer for this level (no permission, a lock, nothing to act on) is not
   *  in the list and the press is simply not ours. */
  const runShortcutAt = (clientX: number, clientY: number, pressed: string): boolean => {
    const host = deps.extensions()
    if (!host) return false
    const price = priceAt(clientY)
    if (price == null) return false
    const priceText = deps.formatter().format(price)
    const rows = host.menuItems({ price, priceText, symbol: deps.symbol(), name: deps.symbolName(), timeframe: deps.timeframe(), clientX, clientY })
    // Later contributions win a collision, as they do in the command registry.
    let match: ChartExtensionMenuItem | null = null
    for (const row of rows) {
      if (row.shortcut && normalizeShortcut(row.shortcut) === pressed) match = row
    }
    if (!match) return false
    try {
      match.run()
    } catch {
      /* a contribution's own failure is its own; the key was still ours */
    }
    return true
  }

  /** The price menu's groups for a level: each extension's `level` rows, then the chart's own. Built
   *  at every raise and rebuild, so the rows read the level and the language of that moment. */
  const priceGroups = (price: number, clientX: number, clientY: number): PriceMenuRow[][] => {
    const priceText = deps.formatter().format(price)
    const contributed = (deps.extensions()?.menuGroups({ price, priceText, symbol: deps.symbol(), name: deps.symbolName(), timeframe: deps.timeframe(), clientX, clientY }) ?? [])
      .map((rows) => rows.filter((row) => row.group !== 'view'))
      .filter((rows) => rows.length > 0)
    const own: PriceMenuRow[] = []
    if (deps.commands.available(PLACE_HORIZONTAL_LINE, price) && (deps.shown?.(PLACE_HORIZONTAL_LINE) ?? true)) {
      own.push({
        label: deps.i18n.t('menu.drawHorizontalLine', { price: priceText }),
        glyph: deps.icons.tool('horizontal_line', 28),
        run: () => void deps.commands.execute(PLACE_HORIZONTAL_LINE, price),
      })
    }
    return own.length > 0 ? [...contributed, own] : contributed
  }

  const raisePriceMenu = (at: PriceMenuPlacement & { y: number }, keyboard: boolean): boolean => {
    const price = priceAt(at.y)
    if (price == null) return false
    const clientX = at.side === 'right' ? at.right : at.left
    let first: PriceMenuRow[][] | null = priceGroups(price, clientX, at.y)
    if (first.length === 0) return false
    deps.setLevel(price)
    menu.openPrice(
      at,
      () => {
        const groups = first ?? priceGroups(price, clientX, at.y)
        first = null
        return groups
      },
      keyboard,
    )
    return true
  }

  const itemsAt = (clientX: number, clientY: number, table: { cell: boolean } | null): readonly ChartExtensionMenuItem[] => {
    const host = deps.extensions()
    if (!host) return []
    const price = priceAt(clientY)
    if (price == null) return []
    const priceText = deps.formatter().format(price)
    return host.menuItems({ price, priceText, symbol: deps.symbol(), name: deps.symbolName(), timeframe: deps.timeframe(), clientX, clientY, ...(table ? { table } : {}) })
  }

  return {
    raiseAt,
    raisePriceMenu,
    itemsAt,
    runShortcutAt,
    close: () => menu.close(),
    refresh: () => menu.refresh(),
    destroy: () => menu.destroy(),
  }
}

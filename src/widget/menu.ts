// The level menu on the chart's own right-click, and the rules for raising it.
//
// Its rows come from `chartContextMenu`, so an embedder's chart offers what a richer host's does
// minus what this chart cannot serve. Every built-in row runs through the command registry rather
// than a switch of its own, which is what makes a feature-hidden or access-denied verb refuse from
// the menu exactly as it refuses from the keyboard. Contributed rows carry their own action and
// ride below the built-ins, so a host cannot displace the chart's own order.
import type { IChartApi, ISeriesApi, SeriesType } from 'lightweight-charts'
import { mountContextMenu, type ContextMenuHandle } from '../contextMenuUi'
import type { ChartMenuAction } from '../contextMenu'
import type { ChartExtensionHost, ChartExtensionMenuItem } from '../extension'
import type { ChartI18n } from '../i18n'
import type { PriceFormatter } from '../priceFormatter'
import type { CommandRegistry } from './commands'

/** The command each built-in menu row runs. Named here so the menu and the registry cannot drift
 *  into two vocabularies for the same verb. A row the chart's own menu never renders (paste and
 *  settings belong to a richer host's drawing chrome) maps to nothing and is refused as unknown
 *  rather than silently routed. */
export const MENU_COMMAND: Partial<Record<ChartMenuAction, string>> = {
  'reset-view': 'chart.view.reset',
  'copy-price': 'chart.price.copy',
  'remove-indicators': 'chart.indicators.removeAll',
  'remove-drawings': 'chart.drawings.removeAll',
}

export interface MenuPlane {
  /** Raise the menu at a viewport point. False when the point holds no readable level. */
  raiseAt(clientX: number, clientY: number): boolean
  close(): void
  destroy(): void
}

export interface MenuDeps {
  chart: IChartApi
  series(): ISeriesApi<SeriesType>
  /** The gesture box, and the chrome subtree the menu mounts into. */
  gestures: HTMLElement
  chrome: HTMLElement
  i18n: ChartI18n
  commands: CommandRegistry
  formatter(): PriceFormatter
  /** The smallest move the symbol's format declares: the grid a named level is snapped to. */
  minMove(): number
  symbol(): string
  timeframe(): string
  indicatorCount(): number
  drawingCount(): number
  extensions(): ChartExtensionHost | null
  /** The level the open menu was raised at, handed to the copy-price command. */
  setLevel(price: number | null): void
}

export function attachMenuPlane(deps: MenuDeps): MenuPlane {
  const menu: ContextMenuHandle = mountContextMenu(
    deps.chrome,
    (id) => {
      const command = MENU_COMMAND[id]
      if (command) deps.commands.execute(command)
    },
    deps.i18n,
  )

  /** The level under a viewport point, snapped to the symbol's own grid: the price a row names is
   *  one the market can actually hold. */
  const priceAt = (clientY: number): number | null => {
    const box = deps.gestures.getBoundingClientRect()
    const price = deps.series().coordinateToPrice(clientY - box.top)
    if (price == null || !(price > 0)) return null
    const step = deps.minMove()
    return Math.round(price / step) * step
  }

  const raiseAt = (clientX: number, clientY: number): boolean => {
    const price = priceAt(clientY)
    if (price == null) return false
    deps.setLevel(price)
    const priceText = deps.formatter().format(price)
    // Contributed rows are asked for at the raise, so they can depend on the level pressed, and
    // they carry their own actions: the chart routes nothing on their behalf.
    const extra: readonly ChartExtensionMenuItem[] =
      deps.extensions()?.menuItems({ price, priceText, symbol: deps.symbol(), timeframe: deps.timeframe(), clientX, clientY }) ?? []
    menu.open(
      { clientX, clientY },
      {
        priceText,
        symbol: deps.symbol(),
        // The level menu offers no paste and no settings row: the drawing clipboard and the
        // settings dialog belong to the selected drawing's own surfaces, which the drawing plane
        // mounts and the chart.drawings.* commands drive.
        canPaste: false,
        canSettings: false,
        indicatorCount: deps.indicatorCount(),
        drawingCount: deps.drawingCount(),
      },
      extra,
    )
    return true
  }

  return {
    raiseAt,
    close: () => menu.close(),
    destroy: () => menu.destroy(),
  }
}

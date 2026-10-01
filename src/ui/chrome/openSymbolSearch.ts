// The symbol search a page opens on its own, away from any chart: an instrument field in a
// backtester, an alert's market, a header's search. It is the same dialog the chart's symbol pill
// opens, over the same controller, grammar, recents rule and symbol names, so a market reads here
// exactly as it reads once it is on the chart. It acts on nothing: it hands the pick back and
// closes.
//
// Two frames: a dialog over the page, and a bare card inside a box the page owns, which is how a
// phone shows it. Both bring their own painted element, because neither has a widget to live in.
// The host supplies the feed, and anything else it already gives a chart: the mode, the language,
// the classes and their names, the marks, the glyphs, and where recents are kept.
import type { ChartDatafeed, SearchClassNode } from '../../datafeed'
import type { SearchDisplayOptions } from '../../widget/options'
import { createChartI18n, readingDirection, type ChartI18n } from '../../i18n'
import { createSearchSessionOwner, memoryRecents, type RecentsPort } from '../../search'
import { createThemeController, type ThemeControllerOptions } from '../../theme/controller'
import { paintThemeRoot } from '../../widget/theme'
import { buildSearchSurface, openSearchDialog } from './searchDialog'
import { resolveMarkPainters, type MarkPainterHooks } from '../../markPainters'
import type { ChartIcons } from '../icons/catalog'
import { createIconDiagnostics } from '../icons/draw'
import { createIconResolver } from '../icons/resolver'

/** A catalog kept warm between opens, from `createSymbolSearchCache`. Completed pages outlive a
 *  dialog, so the second open of a picker, and the first one on a page that warmed it, stands on
 *  what the viewer already saw instead of a loading line. Query state and in-flight work never pass
 *  from a closed picker to the next. */
export interface SymbolSearchCache {
  /** Warm the list a picker opens on, so the first open stands on it. Repeating it costs nothing. */
  prefetch(): void
  /** Drop the cache and stop anything in flight. */
  dispose(): void
}

/** The owner behind each cache handle. Private: a page holds the handle, and the pickers here find
 *  the owner for it, so no caller ever handles a session. */
const owners = new WeakMap<SymbolSearchCache, ReturnType<typeof createSearchSessionOwner>>()

/** A warm catalog for a feed, shared by every picker a page opens over it. */
export function createSymbolSearchCache(options: { datafeed: Pick<ChartDatafeed, 'search'>; pageSize?: number }): SymbolSearchCache {
  const owner = createSearchSessionOwner(options.datafeed, options.pageSize ? { pageSize: options.pageSize } : {})
  const cache: SymbolSearchCache = {
    prefetch: () => owner.prefetch(),
    dispose: () => owner.dispose(),
  }
  owners.set(cache, owner)
  return cache
}

export interface SymbolSearchOptions extends MarkPainterHooks, SearchDisplayOptions {
  /** The feed the search runs against: the one a chart takes, or anything that answers `search`. */
  datafeed: Pick<ChartDatafeed, 'search'>
  /** A catalog warmed over that same feed. Absent, this picker searches from cold and its pages go
   *  when it closes. */
  cache?: SymbolSearchCache
  /** Where the picked market goes. The dialog closes on the pick. */
  onPick(symbol: string): void
  /** The element the dialog's layer mounts in. Default: the document body, where a dialog stands
   *  over the page rather than inside whatever box opened it. */
  container?: HTMLElement
  /** Mode and palettes, as a chart takes them. Default: dark. */
  theme?: ThemeControllerOptions
  /** The language, as a chart takes it. */
  locale?: string
  /** A prepared runtime, when the page already has the chart's. It wins over `locale`. */
  i18n?: ChartI18n
  /** The host's drawings for the search's glyphs, as a chart takes them. */
  icons?: ChartIcons
  /** Where recent picks are read and written. Default: a list that lives as long as the dialog. */
  recents?: RecentsPort
  /** The asset classes the feed declares, for the filter strip, as a feed's `config()` declares
   *  them. Absent, there is no strip. */
  classes?: readonly (string | SearchClassNode)[] | null
  /** Display names for those classes. A class without one wears its token. */
  classNames?: Readonly<Record<string, string>>
  /** The query the field opens holding, selected so that typing replaces it. */
  query?: string
  /** Called once the dialog is gone, however it went. */
  onClose?(): void
}

export interface SymbolSearchHandle {
  /** Close it from the outside. Closing twice is safe, and the dialog's own close is the same door. */
  close(): void
}

/** The display options a picker was opened with, and nothing else it carries. */
const searchDisplay = (options: SearchDisplayOptions): SearchDisplayOptions => ({ spreads: options.spreads, allClasses: options.allClasses, classSelection: options.classSelection })

/** Open the symbol search over a feed, with no chart behind it. */
export function openSymbolSearch(options: SymbolSearchOptions): SymbolSearchHandle {
  const i18n = options.i18n ?? createChartI18n(options.locale)
  const theme = createThemeController(options.theme)
  const layer = document.createElement('div')
  layer.className = 'qc-layer'
  paintThemeRoot(layer, theme.mode(), theme.get())
  layer.setAttribute('dir', readingDirection(i18n))
  const overlays = document.createElement('div')
  overlays.className = 'qc-overlays'
  layer.appendChild(overlays)
  ;(options.container ?? document.body).appendChild(layer)

  const shared = options.cache ? owners.get(options.cache) : undefined
  const owner = shared ?? createSearchSessionOwner(options.datafeed)
  let gone = false
  const teardown = (): void => {
    if (gone) return
    gone = true
    if (!shared) owner.dispose()
    layer.remove()
    options.onClose?.()
  }

  const dialog = openSearchDialog({
    host: overlays,
    i18n,
    icons: createIconResolver({ icons: options.icons, document, direction: () => readingDirection(i18n), diagnostics: createIconDiagnostics() }),
    search: owner.create(),
    recents: options.recents ?? memoryRecents(),
    classes: () => options.classes ?? null,
    ...(options.classNames ? { classNames: options.classNames } : {}),
    display: searchDisplay(options),
    painters: resolveMarkPainters(options),
    request: {
      mode: 'pick',
      ...(options.query ? { changeFrom: options.query } : {}),
      onPick: (symbol) => options.onPick(symbol),
    },
    onClose: teardown,
  })

  return {
    close() {
      dialog.close()
    },
  }
}

export interface MountedSymbolSearch {
  /** The element the search was built into, for a page that measures or animates its own box. */
  element: HTMLElement
  /** Put the caret back in the field, for a page whose box has just opened. */
  focus(): void
  /** Take it down: the feed work stops, the host's marks come off, and the element goes. */
  dispose(): void
}

/** The same search with no dialog around it, built into a box the page owns and positions: a
 *  phone's top card, a panel in a page's own chrome. The page decides where it stands and when it
 *  goes; picking hands the market back exactly as the dialog does. */
export function mountSymbolSearch(options: SymbolSearchOptions & { container: HTMLElement }): MountedSymbolSearch {
  const i18n = options.i18n ?? createChartI18n(options.locale)
  const theme = createThemeController(options.theme)
  const element = document.createElement('div')
  element.className = 'qc-search-card'
  paintThemeRoot(element, theme.mode(), theme.get())
  element.setAttribute('dir', readingDirection(i18n))
  options.container.appendChild(element)

  const shared = options.cache ? owners.get(options.cache) : undefined
  const owner = shared ?? createSearchSessionOwner(options.datafeed)
  let gone = false
  const surface = buildSearchSurface(
    {
      host: element,
      i18n,
      icons: createIconResolver({ icons: options.icons, document, direction: () => readingDirection(i18n), diagnostics: createIconDiagnostics() }),
      search: owner.create(),
      recents: options.recents ?? memoryRecents(),
      classes: () => options.classes ?? null,
      ...(options.classNames ? { classNames: options.classNames } : {}),
    display: searchDisplay(options),
      painters: resolveMarkPainters(options),
      request: {
        mode: 'pick',
        ...(options.query ? { changeFrom: options.query } : {}),
        onPick: (symbol) => options.onPick(symbol),
      },
    },
    element,
    // A card wears no title row: the page's own box is the heading. Its done is the page's close.
    { title: null, done: () => options.onClose?.() },
  )

  return {
    element,
    focus() {
      element.querySelector<HTMLInputElement>('.qc-search-input')?.focus()
    },
    dispose() {
      if (gone) return
      gone = true
      surface.teardown()
      if (!shared) owner.dispose()
      element.remove()
    },
  }
}

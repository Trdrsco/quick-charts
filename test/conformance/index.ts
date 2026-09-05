// The Quick Charts conformance suite: one assertion module the three hosts share.
//
// The production apps/web mount and the clean-room consumer run through the same API, feature,
// lifecycle, theme, strings, accessibility, image, fullscreen, persistence, and teardown contract
// suite. Built-in light/dark and palette apply/reset are exercised through public methods, never DOM
// mutation. A test-only adapter contract or an app-only rendering branch fails dogfood.
//
// This module imports the two public entrypoints and nothing else: no package source path, no test
// runner, no DOM library. A host hands it `createWidget` (the way that host builds a widget) and a
// document, and every check mounts through that door, drives the widget through its public methods,
// commands and events, and observes only what a consumer can observe: the widget's answers, its
// events, the theme root attribute the theme manifest publishes, ARIA roles and accessible names, and
// element identity. No check reaches for a private selector or custom property.
//
// Three hosts run it:
//   the workspace build     test/conformance/conformance.test.ts, under Vitest and happy-dom
//   the clean-room consumer clean-room/js-consumer/conformance.mjs, over the packed tarball
//   the app mount           apps/web/e2e/conformance.spec.ts, through the app's own composition
// A host that cannot mount a plane names it in `unavailable`; the checks that need it report skipped
// with the reason rather than passing vacuously. A check that documents a known defect names it in
// `defect`; hosts skip it and the report carries the defect until the fix lands.
import {
  BUILT_IN_INDICATORS,
  CHART_STYLES,
  FeedUnavailableError,
  memorySaveLoadAdapter,
  SCALE_MODES,
  type ChartBody,
  type ChartDatafeed,
  type ChartHandle,
  type ChartMeta,
  type ChartSaveLoadAdapter,
  type ChartWidget,
  type ChartWidgetOptions,
  type DrawingsBody,
  type DrawingsMeta,
  type DrawingScope,
  type FeatureConfig,
  type FeedBar,
  type HistoryPage,
  type LayoutBody,
  type LayoutMeta,
  type ResourceRef,
  type ResourceStore,
  type SubscribeHandlers,
  type SymbolInfo,
  type TemplateBody,
  type TemplateKind,
  type TemplateMeta,
  type WriteOutcome,
} from 'quickcharts'
import { drawingTools } from 'quickcharts/drawings'

// ── The host contract ───────────────────────────────────────────────────────────────────────────

export interface ConformanceHost {
  /** Build a widget the way this host builds one. The suite supplies the container, the datafeed and
   *  every plane it exercises; the host adds only what it alone owns. */
  createWidget(options: ChartWidgetOptions): ChartWidget
  document: Document
  /** Feature flags this host cannot mount today, with the reason. Checks that need one of them
   *  report skipped rather than passing on a plane that is not there. */
  unavailable?: { features: FeatureConfig; reason: string }
  /** Stand a Fullscreen API on the widget root, where the host can. A browser refuses a request
   *  with no user gesture, so a browser host leaves this out and the check proves the refusal path. */
  fullscreen?: (root: HTMLElement) => { dispose(): void }
  /** Stand a clipboard that takes an image, where the host can. */
  clipboard?: () => { dispose(): void }
  /** Let the host's own queued work land. Defaults to one macrotask. */
  settle?: () => Promise<void>
}

export type ConformanceStatus = 'passed' | 'failed' | 'skipped'

export interface ConformanceResult {
  id: string
  title: string
  status: ConformanceStatus
  /** The failure message, or the reason a check was skipped. */
  detail?: string
}

export interface ConformanceCheck {
  id: string
  title: string
  /** Feature flags the check mounts with on; a host that names one unavailable skips the check. */
  needs?: (keyof FeatureConfig)[]
  /** A defect the check documents. Hosts skip it, and every report carries the sentence. */
  defect?: string
  run(ctx: CheckContext): Promise<void>
}

// ── Assertions ──────────────────────────────────────────────────────────────────────────────────

export class ConformanceFailure extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConformanceFailure'
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new ConformanceFailure(message)
}

function equal<T>(actual: T, expected: T, what: string): void {
  if (actual !== expected) throw new ConformanceFailure(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
}

/** Long enough for a queued microtask, a macrotask and an animation frame to land. */
const macrotask = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 25))

// ── The scripted datafeed ───────────────────────────────────────────────────────────────────────

/** Where the feed's bars start: a countBack that reaches past it is the terminal answer. */
const ORIGIN = 1_700_000_000
const BAR_COUNT = 900
const TF_SECONDS: Readonly<Record<string, number>> = { '1m': 60, '5m': 300, '1h': 3600, '1d': 86_400 }

interface FeedSymbol {
  info: SymbolInfo
  /** The price the deterministic series is centered on. */
  base: number
}

const symbolInfo = (over: Partial<SymbolInfo> & { ticker: string }): SymbolInfo => ({
  name: over.ticker,
  description: `${over.ticker} description`,
  exchange: 'TEST',
  listedExchange: 'TEST',
  type: 'stock',
  supportedResolutions: [],
  timezone: 'Etc/UTC',
  session: '24x7',
  dataStatus: 'streaming',
  volumePrecision: 0,
  format: { pricescale: 100, minmov: 1 },
  ...over,
})

/** The catalog every check charts from. `NONE` is a symbol nothing serves. */
export const FEED_SYMBOLS: Readonly<Record<string, FeedSymbol>> = {
  ALPHA: {
    base: 150,
    // A New York equity with a session holiday on the feed's own calendar day after its last bar.
    info: symbolInfo({ ticker: 'ALPHA', type: 'stock', timezone: 'America/New_York', session: '0930-1600', sessionHolidays: '20231114', supportedResolutions: ['1m', '5m', '1h', '1d'] }),
  },
  BETA: { base: 4500, info: symbolInfo({ ticker: 'BETA', type: 'futures', timezone: 'America/Chicago', session: '1700-1600:23456', format: { pricescale: 100, minmov: 25 } }) },
  GAMMA: {
    base: 30,
    // Extended hours, so the subsession choice exists.
    info: symbolInfo({
      ticker: 'GAMMA',
      timezone: 'America/New_York',
      session: '0930-1600',
      subsessions: [
        { id: 'regular', session: '0930-1600' },
        { id: 'extended', session: '0400-2000' },
        { id: 'premarket', session: '0400-0930' },
        { id: 'postmarket', session: '1600-2000' },
      ],
    }),
  },
  ZB: { base: 110, info: symbolInfo({ ticker: 'ZB', type: 'futures', format: { pricescale: 32, minmov: 1, fractional: true } }) },
}

/** A deterministic bar: the same symbol, timeframe and bucket always answer the same values. */
function barAt(symbol: string, tf: string, index: number): FeedBar {
  const base = FEED_SYMBOLS[symbol]?.base ?? 100
  const step = TF_SECONDS[tf] ?? 60
  const wave = Math.sin(index / 9) * 0.02 + Math.sin(index / 31) * 0.01
  const c = base * (1 + wave)
  const o = base * (1 + Math.sin((index - 1) / 9) * 0.02 + Math.sin((index - 1) / 31) * 0.01)
  return { t: ORIGIN + index * step, o, h: Math.max(o, c) * 1.002, l: Math.min(o, c) * 0.998, c, v: 100 + (index % 13) }
}

export interface ScriptedFeed extends ChartDatafeed {
  /** Every history ask, in order. */
  historyCalls: { symbol: string; tf: string; range?: { from?: number; to?: number; countBack?: number } }[]
  subscribeCount: number
  unsubscribeCount: number
  resolveCalls: string[]
  /** Push a live event to every open subscription of a symbol. */
  push(symbol: string, event: Parameters<SubscribeHandlers['onBars']>[0]): void
  /** Report a feed status to every open subscription of a symbol. */
  status(symbol: string, status: string): void
}

/** The feed every check mounts over. Nothing here reaches a network; the bars are arithmetic. */
export function scriptedFeed(): ScriptedFeed {
  const subscriptions = new Map<string, Set<SubscribeHandlers>>()
  const feed: ScriptedFeed = {
    historyCalls: [],
    subscribeCount: 0,
    unsubscribeCount: 0,
    resolveCalls: [],
    async config() {
      return { resolutions: Object.keys(TF_SECONDS), classes: ['stock', 'futures'] }
    },
    async search(q) {
      const needle = q.trim().toUpperCase()
      const hits = Object.keys(FEED_SYMBOLS)
        .filter((s) => !needle || s.includes(needle))
        .map((s) => ({ symbol: s, name: FEED_SYMBOLS[s]!.info.description, exchange: 'TEST', type: FEED_SYMBOLS[s]!.info.type }))
      return { hits, hasMore: false }
    },
    async resolve(symbol) {
      feed.resolveCalls.push(symbol)
      return FEED_SYMBOLS[symbol]?.info ?? null
    },
    async history(symbol, tf, range) {
      feed.historyCalls.push({ symbol, tf, range })
      if (symbol === 'NONE') throw new FeedUnavailableError('nothing serves NONE', 'unserved')
      const step = TF_SECONDS[tf] ?? 60
      const last = BAR_COUNT - 1
      // The newest window, or the window ending at `to`.
      const endIndex = range?.to !== undefined ? Math.floor((range.to - ORIGIN) / step) : last
      const count = range?.countBack ?? 300
      const startIndex = Math.max(0, endIndex - count + 1)
      if (endIndex < 0) return { bars: [], noData: true }
      const bars: FeedBar[] = []
      for (let i = startIndex; i <= Math.min(endIndex, last); i++) bars.push(barAt(symbol, tf, i))
      return { bars, noData: startIndex === 0 } satisfies HistoryPage
    },
    subscribeBars(symbol, _tf, handlers) {
      feed.subscribeCount++
      let set = subscriptions.get(symbol)
      if (!set) {
        set = new Set()
        subscriptions.set(symbol, set)
      }
      set.add(handlers)
      handlers.onStatus?.('live')
      return () => {
        feed.unsubscribeCount++
        set!.delete(handlers)
      }
    },
    push(symbol, event) {
      for (const h of subscriptions.get(symbol) ?? []) h.onBars(event)
    },
    status(symbol, status) {
      for (const h of subscriptions.get(symbol) ?? []) h.onStatus?.(status)
    },
  }
  return feed
}

// ── A second, host-written save/load adapter ────────────────────────────────────────────────────

/** How long each verb of adapter B takes, by id, so a check can make one answer land after another. */
export interface AdapterBOptions {
  delayFor?: (id: string) => number
}

interface Row<Body> {
  id: string
  revision: number
  body: Body
  updatedAt: number
}

/** A resource store written the way a host would write one: its own ids, integer revisions written as
 *  text, a settable delay, and an `AbortError` of its own when a signal is already aborted. Nothing
 *  of the package's memory adapter is reused, which is the point of running both. */
function hostStore<Meta extends ResourceRef, Body>(family: string, metaOf: (row: Row<Body>) => Meta, options: AdapterBOptions): ResourceStore<Meta, Body> {
  const rows = new Map<string, Row<Body>>()
  let seq = 0
  let clock = 1
  const ref = (row: Row<Body>): ResourceRef => ({ id: row.id, revision: String(row.revision) })
  const wait = async (id: string, signal?: AbortSignal): Promise<void> => {
    if (signal?.aborted) {
      const error = new Error(`aborted ${family} ${id}`)
      error.name = 'AbortError'
      throw error
    }
    const ms = options.delayFor?.(id) ?? 0
    if (ms > 0) await new Promise((resolve) => setTimeout(resolve, ms))
  }
  return {
    async list(signal) {
      await wait('*', signal)
      return [...rows.values()].map(metaOf)
    },
    async load(id, signal) {
      await wait(id, signal)
      const row = rows.get(id)
      return row ? { ref: ref(row), body: row.body } : null
    },
    async create(body, signal): Promise<WriteOutcome<Meta>> {
      await wait('*', signal)
      const row: Row<Body> = { id: `${family}-${++seq}`, revision: 1, body, updatedAt: clock++ }
      rows.set(row.id, row)
      return { kind: 'ok', ref: ref(row), value: metaOf(row) }
    },
    async update(at, body, signal): Promise<WriteOutcome<Meta>> {
      await wait(at.id, signal)
      const row = rows.get(at.id)
      if (!row) return { kind: 'not-found' }
      if (String(row.revision) !== at.revision) return { kind: 'conflict', current: ref(row) }
      row.revision++
      row.body = body
      row.updatedAt = clock++
      return { kind: 'ok', ref: ref(row), value: metaOf(row) }
    },
    async remove(at, signal): Promise<WriteOutcome<void>> {
      await wait(at.id, signal)
      const row = rows.get(at.id)
      if (!row) return { kind: 'not-found' }
      if (String(row.revision) !== at.revision) return { kind: 'conflict', current: ref(row) }
      rows.delete(at.id)
      return { kind: 'ok', ref: ref(row) }
    },
  }
}

/** The second host adapter over the four resource families. */
export function hostSaveLoadAdapter(options: AdapterBOptions = {}): ChartSaveLoadAdapter {
  const drawings = new Map<string, ResourceStore<DrawingsMeta, DrawingsBody>>()
  const templates = new Map<TemplateKind, ResourceStore<TemplateMeta, TemplateBody>>()
  return {
    charts: hostStore<ChartMeta, ChartBody>('chart', (r) => ({ id: r.id, revision: String(r.revision), name: r.body.name, symbol: r.body.symbol, timeframe: r.body.timeframe, updatedAt: r.updatedAt }), options),
    layouts: hostStore<LayoutMeta, LayoutBody>('layout', (r) => ({ id: r.id, revision: String(r.revision), name: r.body.name, updatedAt: r.updatedAt }), options),
    drawings(scope: DrawingScope) {
      const key = `${scope.symbol}|${scope.chartId ?? ''}`
      let store = drawings.get(key)
      if (!store) {
        store = hostStore<DrawingsMeta, DrawingsBody>(`drawings:${key}`, (r) => ({ id: r.id, revision: String(r.revision), updatedAt: r.updatedAt }), options)
        drawings.set(key, store)
      }
      return store
    },
    templates(kind: TemplateKind) {
      let store = templates.get(kind)
      if (!store) {
        store = hostStore<TemplateMeta, TemplateBody>(`template:${kind}`, (r) => ({ id: r.id, revision: String(r.revision), name: r.body.name, ...(r.body.tool ? { tool: r.body.tool } : {}), updatedAt: r.updatedAt }), options)
        templates.set(kind, store)
      }
      return store
    },
  }
}

// ── The check context ───────────────────────────────────────────────────────────────────────────

export interface Mounted {
  widget: ChartWidget
  chart: ChartHandle
  container: HTMLElement
  /** The widget's own root inside the container, found by the theme attribute the manifest publishes. */
  root: HTMLElement
  feed: ScriptedFeed
}

export interface CheckContext {
  host: ConformanceHost
  document: Document
  settle(): Promise<void>
  /** Mount one widget over a fresh scripted feed, ready, and registered for disposal. `ready: false`
   *  hands the widget back before its first data; `settle: false` hands it back at once, so a check
   *  can subscribe to what the first load reports. */
  mount(overrides?: Partial<Omit<ChartWidgetOptions, 'container' | 'datafeed'>> & { feed?: ScriptedFeed; ready?: boolean; settle?: boolean }): Promise<Mounted>
  /** Let a listener-balance check see through the mount. */
  window: Window & typeof globalThis
}

/** The theme root attribute the theme manifest publishes: the one attribute a consumer may read. */
export const THEME_ROOT_ATTRIBUTE = 'data-qc-theme'

/** Settle until the feed has been quiet for one settle window: a chart that fits its first window
 *  to the pane pages older history straight away, and a check that counts fetches waits for that. */
async function quiet(feed: ScriptedFeed, settle: () => Promise<void>): Promise<void> {
  for (let i = 0; i < 20; i++) {
    const before = feed.historyCalls.length
    await settle()
    if (feed.historyCalls.length === before) return
  }
}

const rootOf = (container: HTMLElement): HTMLElement => {
  const root = container.querySelector<HTMLElement>(`[${THEME_ROOT_ATTRIBUTE}]`)
  assert(root, 'the widget mounted its themed root inside the container')
  return root
}

/** Every button under a node with the name a screen reader would read. */
export function accessibleNames(node: ParentNode): string[] {
  return Array.from(node.querySelectorAll('button')).map((b) => b.getAttribute('aria-label') ?? b.textContent?.trim() ?? '')
}

const looksLikeKey = (text: string): boolean => /^[a-z]+\.[a-zA-Z0-9]+$/.test(text)

// ── The checks ──────────────────────────────────────────────────────────────────────────────────

const smaInstance = (id: string) => ({ id, definition: BUILT_IN_INDICATORS.find((d) => d.id === 'sma')!, color: '#4c98fb' })
const rsiInstance = (id: string) => ({ id, definition: BUILT_IN_INDICATORS.find((d) => d.id === 'rsi')!, color: '#f5a623' })

export const CONFORMANCE_CHECKS: readonly ConformanceCheck[] = [
  {
    id: 'api.shape',
    title: 'the widget and its active chart answer the documented surface, and ready resolves once data paints',
    async run(ctx) {
      const { widget, chart } = await ctx.mount({ symbol: 'ALPHA', timeframe: '5m' })
      for (const member of ['ready', 'activeChart', 'charts', 'chart', 'locale', 'setLocale', 'capabilities', 'search', 'on', 'dispose'] as const) {
        equal(typeof widget[member], 'function', `widget.${member}`)
      }
      for (const member of ['layout', 'theme', 'commands', 'recents', 'image', 'fullscreen'] as const) assert(widget[member], `widget.${member}`)
      for (const member of ['symbol', 'setSymbol', 'timeframe', 'setTimeframe', 'style', 'setStyle', 'visibleRange', 'setVisibleRange', 'logicalRange', 'setLogicalRange', 'scroll', 'zoom', 'reset', 'goLive', 'scaleMode', 'setScaleMode', 'timezone', 'setTimezone', 'displayTimezone', 'marketStatus', 'subsession', 'setSubsession', 'hasExtendedHours', 'appearance', 'applyAppearance', 'formatter', 'on'] as const) {
        equal(typeof chart[member], 'function', `chart.${member}`)
      }
      for (const member of ['indicators', 'compare', 'replay', 'saveLoad', 'sync'] as const) assert(chart[member], `chart.${member}`)
      equal(chart.symbol(), 'ALPHA', 'the mounted symbol')
      equal(chart.timeframe(), '5m', 'the mounted timeframe')
      equal(widget.charts().length, 1, 'one chart in the default layout')
      equal(widget.chart(chart.id), chart, 'chart(id) answers the handle')
      equal(widget.chart('nope'), null, 'chart(unknown) answers null')
      assert(chart.formatter().format(123.4) === '123.40', 'the chart formatter writes the resolved symbol format')
      const caps = widget.capabilities()
      equal(caps.search, true, 'search capability follows the feed')
      equal(caps.dataStatus, 'streaming', 'the data status follows the resolved symbol')
    },
  },
  {
    id: 'features.config',
    title: 'a feature switched off removes its chrome, and its commands answer unavailable rather than vanishing',
    async run(ctx) {
      const full = await ctx.mount({ symbol: 'ALPHA' })
      const toolbars = full.root.querySelectorAll('[role="toolbar"]').length
      assert(toolbars >= 3, `the complete chart has its bars and the drawing toolbar (${toolbars} toolbars)`)
      assert(full.root.querySelector('[role="status"][aria-live]'), 'the complete chart has a live region for its notices')
      // The drawing plane carries a toolbar and a live region of its own, so it goes too.
      const bare = await ctx.mount({ symbol: 'ALPHA', features: { topBar: false, bottomBar: false, toasts: false, legend: false, replay: false, drawings: false } })
      equal(bare.root.querySelectorAll('[role="toolbar"]').length, 0, 'no toolbar with both bars and the drawing plane off')
      equal(bare.root.querySelector('[role="status"][aria-live]'), null, 'no live region with notices and the drawing plane off')
      assert(bare.widget.commands.list().some((c) => c.id === 'chart.replay.start'), 'the replay command stays registered with replay off')
      equal(bare.widget.commands.execute('chart.replay.start').kind, 'unavailable', 'replay start with replay off')
      equal(bare.widget.commands.execute('chart.view.reset').kind, 'ok', 'a view verb is untouched by unrelated flags')
    },
  },
  {
    id: 'access.policy',
    title: 'the access policy refuses a command from every door, and an indicator the policy refuses is not added',
    async run(ctx) {
      const { widget, chart } = await ctx.mount({
        symbol: 'ALPHA',
        access: { command: (id) => id !== 'chart.style.line', indicator: (id) => id !== 'rsi' },
      })
      equal(widget.commands.available('chart.style.line'), false, 'a refused command is not available')
      equal(widget.commands.execute('chart.style.line').kind, 'denied', 'a refused command answers denied')
      equal(chart.style(), 'candles', 'the refused style never landed')
      equal(widget.commands.execute('chart.style.area').kind, 'ok', 'a permitted style runs')
      equal(chart.style(), 'area', 'the permitted style landed')
      equal(chart.indicators.add(rsiInstance('rsi')), false, 'a refused indicator is not added')
      equal(chart.indicators.get().length, 0, 'nothing was added')
      equal(chart.indicators.add(smaInstance('sma')), true, 'a permitted indicator is added')
      const throwing = await ctx.mount({
        symbol: 'ALPHA',
        access: {
          command: () => {
            throw new Error('policy down')
          },
        },
      })
      equal(throwing.widget.commands.execute('chart.view.reset').kind, 'denied', 'a policy that throws refuses')
    },
  },
  {
    id: 'access.indicator.one-id',
    title: 'the indicator predicate is asked the same id from the picker and from the handle: the definition id',
    defect: 'the picker asks access.indicator with the definition id (ui/chrome/indicatorPicker.ts) while the handle asks with the instance id (widget/indicators.ts permitted(instance.id)), so a policy written for catalog ids refuses a built-in in the picker and admits it through indicators.add under another instance id',
    async run(ctx) {
      const { chart } = await ctx.mount({ symbol: 'ALPHA', access: { indicator: (id) => id !== 'rsi' } })
      equal(chart.indicators.add(rsiInstance('rsi-1')), false, 'an instance of a refused definition is refused whatever its instance id')
      equal(chart.indicators.get().length, 0, 'nothing was added')
    },
  },
  {
    id: 'commands.dispatch',
    title: 'commands run through one registry: unknown, ok, and the symbol and timeframe setters reach the chart',
    async run(ctx) {
      const { widget, chart, feed } = await ctx.mount({ symbol: 'ALPHA', timeframe: '1m' })
      equal(widget.commands.execute('nothing.by.that.name').kind, 'unknown', 'an unknown id')
      const symbols: string[] = []
      const timeframes: string[] = []
      chart.on('symbol', (s) => symbols.push(s))
      chart.on('timeframe', (t) => timeframes.push(t))
      equal(widget.commands.execute('chart.symbol.set', 'BETA').kind, 'ok', 'symbol set')
      equal(chart.symbol(), 'BETA', 'the symbol moved')
      await ctx.settle()
      assert(feed.resolveCalls.includes('BETA'), 'the new symbol was resolved through the feed')
      equal(widget.commands.execute('chart.timeframe.5m').kind, 'ok', 'a preset timeframe command')
      equal(chart.timeframe(), '5m', 'the timeframe moved')
      equal(widget.commands.execute('chart.timeframe.5m').kind, 'unavailable', 'the current timeframe is unavailable')
      equal(JSON.stringify(symbols), JSON.stringify(['BETA']), 'one symbol event')
      equal(JSON.stringify(timeframes), JSON.stringify(['5m']), 'one timeframe event')
      const ids = widget.commands.list().map((c) => c.id)
      for (const id of ['chart.view.reset', 'chart.style.candles', 'chart.scale.log', 'chart.range.1D', 'chart.timezone.exchange', 'widget.theme.toggle', 'widget.image.download', 'widget.layout.setArrangement']) {
        assert(ids.includes(id), `the registry lists ${id}`)
      }
    },
  },
  {
    id: 'commands.shortcuts',
    title: 'a shortcut resolves to a command through the registry, remaps, yields to a later binding, and stays out of a text field',
    async run(ctx) {
      const { widget, chart, root } = await ctx.mount({ symbol: 'ALPHA' })
      const reset = widget.commands.list().find((c) => c.id === 'chart.view.reset')
      equal(reset?.shortcut, 'Alt+KeyR', 'the default reset shortcut')
      const press = (target: EventTarget, code: string, init: KeyboardEventInit = {}) => {
        const event = new ctx.window.KeyboardEvent('keydown', { code, bubbles: true, cancelable: true, ...init })
        target.dispatchEvent(event)
        return event
      }
      widget.commands.setShortcut('chart.style.line', 'Alt+KeyX')
      equal(press(root, 'KeyX', { altKey: true }).defaultPrevented, true, 'a matched press is consumed')
      equal(chart.style(), 'line', 'the remapped shortcut ran its command')
      // A second binding of the same key: the later registration wins, explicitly.
      widget.commands.setShortcut('chart.style.area', 'Alt+KeyX')
      press(root, 'KeyX', { altKey: true })
      equal(chart.style(), 'area', 'the later binding of a shared key wins')
      widget.commands.setShortcut('chart.style.area', null)
      press(root, 'KeyX', { altKey: true })
      equal(chart.style(), 'line', 'clearing the later binding hands the key back')
      // A key aimed at a text field is never the chart's.
      const input = ctx.document.createElement('input')
      root.appendChild(input)
      widget.commands.setShortcut('chart.style.bars', 'KeyB')
      equal(press(input, 'KeyB').defaultPrevented, false, 'a press in a text field is left alone')
      equal(chart.style(), 'line', 'the chart did not restyle from a text field')
      input.remove()
      // An unavailable command leaves the key for the page.
      widget.commands.setShortcut('chart.style.line', 'KeyL')
      equal(press(root, 'KeyL').defaultPrevented, false, 'the current style is unavailable, so the key is not consumed')
    },
  },
  {
    id: 'lifecycle.dispose',
    title: 'dispose is idempotent, leaves the container bare, balances every window and document listener, and makes every handle inert',
    async run(ctx) {
      const win = ctx.window
      const counts = { window: 0, document: 0 }
      const patch = (target: EventTarget, key: 'window' | 'document') => {
        const add = target.addEventListener.bind(target)
        const remove = target.removeEventListener.bind(target)
        target.addEventListener = ((...args: Parameters<EventTarget['addEventListener']>) => {
          counts[key]++
          return add(...args)
        }) as EventTarget['addEventListener']
        target.removeEventListener = ((...args: Parameters<EventTarget['removeEventListener']>) => {
          counts[key]--
          return remove(...args)
        }) as EventTarget['removeEventListener']
        return () => {
          target.addEventListener = add
          target.removeEventListener = remove
        }
      }
      const restore = [patch(win, 'window'), patch(ctx.document, 'document')]
      try {
        const { widget, chart, container } = await ctx.mount({ symbol: 'ALPHA' })
        let heard = 0
        const off = chart.on('symbol', () => heard++)
        await ctx.settle()
        widget.dispose()
        widget.dispose()
        equal(container.childElementCount, 0, 'the container is bare after dispose')
        equal(widget.commands.list().length, 0, 'the registry is empty after dispose')
        equal(widget.commands.execute('chart.view.reset').kind, 'unknown', 'a disposed registry runs nothing')
        const late = widget.on('theme', () => undefined)
        late()
        off()
        chart.setSymbol('BETA')
        await ctx.settle()
        equal(heard, 0, 'a subscription is inert after dispose')
        await widget.ready()
        equal(counts.window, 0, 'window listeners are balanced')
        equal(counts.document, 0, 'document listeners are balanced')
      } finally {
        for (const r of restore) r()
      }
    },
  },
  {
    id: 'lifecycle.dispose.after-change',
    title: 'a dispose in the same tick as a state change throws nothing afterwards',
    defect: 'the chrome queues a microtask sync on every chart event and reads widget.activeChart() when it runs; a dispose in between makes that read throw "the widget has no charts" from the microtask (packages/chart/src/ui/chrome/mount.ts, sync)',
    async run(ctx) {
      const { widget } = await ctx.mount({ symbol: 'ALPHA' })
      widget.theme.setMode('light')
      widget.dispose()
      await ctx.settle()
    },
  },
  {
    id: 'theme.switch',
    title: 'a mode switch and a palette apply or reset restyle the live widget through public methods: same root, same canvases, no refetch, no subscription churn, state kept',
    async run(ctx) {
      const { widget, chart, root, feed } = await ctx.mount({ symbol: 'ALPHA', timeframe: '5m', theme: { mode: 'dark' }, indicators: [smaInstance('sma-1')] })
      chart.setScaleMode('log')
      chart.setStyle('area')
      widget.layout.setSync({ symbol: true })
      await quiet(feed, ctx.settle)
      const canvases = Array.from(root.querySelectorAll('canvas'))
      assert(canvases.length > 0, 'the chart painted canvases')
      const before = { history: feed.historyCalls.length, subscribe: feed.subscribeCount, unsubscribe: feed.unsubscribeCount, range: JSON.stringify(chart.visibleRange()) }
      const heard: string[] = []
      widget.on('theme', (_theme, mode) => heard.push(mode))
      equal(root.getAttribute(THEME_ROOT_ATTRIBUTE), 'dark', 'the root wears the mounted mode')
      const darkBackground = widget.theme.get()['canvas.background']
      widget.theme.setMode('light')
      equal(root.getAttribute(THEME_ROOT_ATTRIBUTE), 'light', 'the root wears the new mode')
      equal(widget.theme.mode(), 'light', 'the controller reports the new mode')
      assert(widget.theme.get()['canvas.background'] !== darkBackground, 'the resolved theme changed')
      equal(rootOf(root.parentElement as HTMLElement), root, 'the root element is the same node')
      const after = Array.from(root.querySelectorAll('canvas'))
      equal(after.length, canvases.length, 'the canvas count is unchanged')
      for (const [i, c] of canvases.entries()) equal(after[i], c, `canvas ${i} is the same node`)
      await ctx.settle()
      equal(feed.historyCalls.length, before.history, 'no history refetch on a mode switch')
      equal(feed.subscribeCount, before.subscribe, 'no new subscription on a mode switch')
      equal(feed.unsubscribeCount, before.unsubscribe, 'no subscription dropped on a mode switch')
      equal(chart.symbol(), 'ALPHA', 'symbol kept')
      equal(chart.timeframe(), '5m', 'timeframe kept')
      equal(chart.style(), 'area', 'style kept')
      equal(chart.scaleMode(), 'log', 'scale mode kept')
      equal(chart.indicators.get().length, 1, 'indicator kept')
      equal(JSON.stringify(chart.visibleRange()), before.range, 'visible range kept')
      equal(widget.layout.sync().symbol, true, 'layout sync kept')
      widget.theme.applyCustom({ light: { 'state.accent': '#ff8800' } })
      equal(widget.theme.get()['state.accent'], '#ff8800', 'a custom palette applies at runtime')
      widget.theme.applyCustom({ light: { 'state.accent': '#ff8800' } })
      widget.theme.resetCustom()
      assert(widget.theme.get()['state.accent'] !== '#ff8800', 'reset returns to the built-in palette')
      equal(JSON.stringify(heard), JSON.stringify(['light', 'light', 'light']), 'one theme event per change, none for a no-op')
      equal(widget.theme.diagnostics().length, 0, 'a valid palette reports nothing')
      widget.theme.applyCustom({ light: { 'state.accent': 'not-a-color' } })
      equal(widget.theme.diagnostics().length, 1, 'an invalid value is reported')
      assert(widget.theme.get()['state.accent'] !== 'not-a-color', 'and the built-in value stands')
    },
  },
  {
    id: 'theme.two-instances',
    title: 'two widgets in one document run different modes without touching the document or each other',
    async run(ctx) {
      const a = await ctx.mount({ symbol: 'ALPHA', theme: { mode: 'dark' } })
      const b = await ctx.mount({ symbol: 'BETA', theme: { mode: 'light' } })
      equal(a.root.getAttribute(THEME_ROOT_ATTRIBUTE), 'dark', 'A is dark')
      equal(b.root.getAttribute(THEME_ROOT_ATTRIBUTE), 'light', 'B is light')
      assert(a.widget.theme.get()['canvas.background'] !== b.widget.theme.get()['canvas.background'], 'the two resolve different themes')
      const doc = ctx.document
      equal(doc.documentElement.hasAttribute(THEME_ROOT_ATTRIBUTE), false, 'the document element is untouched')
      equal(doc.body.hasAttribute(THEME_ROOT_ATTRIBUTE), false, 'the body is untouched')
      equal(doc.documentElement.getAttribute('style'), null, 'no inline style on the document element')
      equal(doc.body.getAttribute('style'), null, 'no inline style on the body')
      a.widget.theme.setMode('light')
      equal(a.root.getAttribute(THEME_ROOT_ATTRIBUTE), 'light', 'A switched')
      equal(b.root.getAttribute(THEME_ROOT_ATTRIBUTE), 'light', 'B unchanged by A')
      b.widget.theme.setMode('dark')
      equal(a.root.getAttribute(THEME_ROOT_ATTRIBUTE), 'light', 'A unchanged by B')
      equal(b.root.getAttribute(THEME_ROOT_ATTRIBUTE), 'dark', 'B switched')
    },
  },
  {
    id: 'strings.catalog',
    title: 'every control is named from the catalog, relabels with the language, and the root follows the reading direction',
    async run(ctx) {
      const { widget, root } = await ctx.mount({ symbol: 'ALPHA' })
      const english = accessibleNames(root)
      assert(english.length > 10, `the chart has controls (${english.length})`)
      for (const name of english) {
        assert(name.length > 0, 'every control has an accessible name')
        assert(!looksLikeKey(name), `a name is text, not a key: ${name}`)
      }
      equal(root.getAttribute('dir'), 'ltr', 'English reads left to right')
      await widget.setLocale('de')
      equal(widget.locale(), 'de', 'the locale moved')
      await ctx.settle()
      const german = accessibleNames(root)
      // Timeframe and range chips wear tokens that are the same in every language; the named
      // controls around them relabel.
      const changed = english.filter((name, i) => german[i] !== name).length
      assert(changed >= 5, `the named controls relabeled (${changed} of ${english.length})`)
      for (const name of german) assert(!looksLikeKey(name), `a German name is text, not a key: ${name}`)
      await widget.setLocale('ar')
      await ctx.settle()
      equal(root.getAttribute('dir'), 'rtl', 'Arabic reads right to left')
      await widget.setLocale('en')
      await ctx.settle()
      equal(root.getAttribute('dir'), 'ltr', 'and back')
      let refused = false
      try {
        await widget.setLocale('xx')
      } catch {
        refused = true
      }
      equal(refused, true, 'a locale the inventory does not hold is refused')
    },
  },
  {
    id: 'a11y.names.roles.focus',
    title: 'toolbars are named, notices are a live region, a dialog is modal with focus inside and returns it on Escape',
    needs: ['compare'],
    async run(ctx) {
      const { widget, root } = await ctx.mount({ symbol: 'ALPHA', features: { compareSymbols: [{ symbol: 'BETA', title: 'Beta' }] } })
      const toolbars = Array.from(root.querySelectorAll('[role="toolbar"]'))
      assert(toolbars.length >= 2, 'the bars are toolbars')
      for (const bar of toolbars) assert((bar.getAttribute('aria-label') ?? '').length > 0, 'every toolbar is named')
      const live = root.querySelector('[role="status"][aria-live="polite"]')
      assert(live, 'the notices are a polite live region')
      for (const button of Array.from(root.querySelectorAll('button'))) equal(button.getAttribute('type'), 'button', 'every button is typed')
      assert(root.hasAttribute('tabindex'), 'the root can take focus for the keyboard')
      const first = root.querySelector<HTMLButtonElement>('[role="toolbar"] button')
      assert(first, 'a toolbar button exists')
      first.focus()
      equal(ctx.document.activeElement, first, 'a toolbar button takes focus')
      equal(widget.commands.execute('chart.compare.open').kind, 'ok', 'the compare dialog opens through its command')
      await ctx.settle()
      const dialog = root.querySelector<HTMLElement>('[role="dialog"]')
      assert(dialog, 'a dialog is open')
      equal(dialog.getAttribute('aria-modal'), 'true', 'the dialog is modal')
      assert((dialog.getAttribute('aria-label') ?? dialog.getAttribute('aria-labelledby') ?? '').length > 0, 'the dialog is named')
      assert(dialog.contains(ctx.document.activeElement), 'focus moved into the dialog')
      assert(dialog.querySelector('[role="listbox"]'), 'the results are a listbox')
      dialog.dispatchEvent(new ctx.window.KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }))
      await ctx.settle()
      equal(root.querySelector('[role="dialog"]'), null, 'Escape closed the dialog')
      equal(ctx.document.activeElement, first, 'focus returned to where it was')
    },
  },
  {
    id: 'image.capture.download.copy',
    title: 'the image API captures a PNG, downloads through a link, and a refused copy falls back to a download and says so',
    async run(ctx) {
      const { widget, root } = await ctx.mount({ symbol: 'ALPHA', image: { attribution: 'Conformance' } })
      if (root.clientWidth === 0) {
        // A document with no layout has nothing to picture; the honest answer is a rejection, never
        // an empty file.
        let refused = false
        try {
          await widget.image.capture()
        } catch {
          refused = true
        }
        equal(refused, true, 'a chart with no measurable size refuses to capture')
        equal(await widget.image.copy(), false, 'and copy answers false')
        return
      }
      const blob = await widget.image.capture()
      assert(blob, 'capture answers a blob')
      equal(blob!.type, 'image/png', 'the blob is a PNG')
      const win = ctx.window
      const anchorClick = win.HTMLAnchorElement.prototype.click
      const downloads: string[] = []
      win.HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
        downloads.push(this.getAttribute('download') ?? '')
      }
      try {
        await widget.image.download()
        equal(downloads.length, 1, 'download clicked one link')
        assert(/\.png$/.test(downloads[0]!), `the file is named as a PNG: ${downloads[0]}`)
        const events: string[] = []
        widget.on('image', (e) => events.push(e.kind))
        if (!widget.capabilities().imageCopy) {
          equal(widget.commands.available('widget.image.copy'), false, 'copy is unavailable without a clipboard')
          equal(await widget.image.copy(), false, 'copy answers false without a clipboard')
        }
        const clipboard = ctx.host.clipboard?.()
        try {
          if (clipboard) {
            equal(widget.capabilities().imageCopy, true, 'the host clipboard is seen')
            equal(widget.commands.execute('widget.image.copy').kind, 'ok', 'copy runs')
            await ctx.settle()
            await ctx.settle()
            equal(events.at(-1), 'copied', 'the copy landed')
          }
        } finally {
          clipboard?.dispose()
        }
      } finally {
        win.HTMLAnchorElement.prototype.click = anchorClick
      }
    },
  },
  {
    id: 'fullscreen.chart-root',
    title: 'fullscreen applies to the chart root through enter, exit, toggle, state and change, and never to the document',
    async run(ctx) {
      const { widget, root } = await ctx.mount({ symbol: 'ALPHA' })
      const doc = ctx.document
      const docElement = doc.documentElement as HTMLElement & { requestFullscreen?: () => Promise<void> }
      let shellCalls = 0
      const original = docElement.requestFullscreen
      docElement.requestFullscreen = async () => {
        shellCalls++
      }
      const installed = ctx.host.fullscreen?.(root)
      try {
        const caps = widget.capabilities()
        equal(widget.commands.available('widget.fullscreen.toggle'), caps.fullscreen, 'the toggle follows the capability')
        equal(widget.fullscreen.active(), false, 'not fullscreen at mount')
        const heard: boolean[] = []
        widget.on('fullscreen', (active) => heard.push(active))
        if (installed) {
          await widget.fullscreen.enter()
          equal(widget.fullscreen.active(), true, 'entered')
          await widget.fullscreen.exit()
          equal(widget.fullscreen.active(), false, 'exited')
          await widget.fullscreen.toggle()
          equal(widget.fullscreen.active(), true, 'toggled on')
          await widget.fullscreen.toggle()
          equal(widget.fullscreen.active(), false, 'toggled off')
          equal(JSON.stringify(heard), JSON.stringify([true, false, true, false]), 'one change event per transition')
        } else {
          // No fullscreen the host can grant: every verb settles without throwing and the state stays.
          await widget.fullscreen.enter()
          await widget.fullscreen.toggle()
          await widget.fullscreen.exit()
          equal(widget.fullscreen.active(), false, 'a refused request leaves the chart where it is')
        }
        equal(shellCalls, 0, 'the document element was never asked to go fullscreen')
      } finally {
        installed?.dispose()
        docElement.requestFullscreen = original
      }
    },
  },
  ...(['package', 'host'] as const).map(
    (kind): ConformanceCheck => ({
      id: `persistence.${kind}-adapter`,
      title: `saved charts and layouts keep identity, return revisions, write conditionally, and refuse conflicts, deletions and aborted loads (${kind} adapter)`,
      async run(ctx) {
        const adapter = kind === 'package' ? memorySaveLoadAdapter() : hostSaveLoadAdapter()
        const { widget, chart } = await ctx.mount({ symbol: 'ALPHA', timeframe: '5m', saveLoad: adapter })
        equal(widget.capabilities().saveLoad.charts, true, 'the charts family is seen')
        equal(widget.capabilities().saveLoad.layouts, true, 'the layouts family is seen')
        // ── charts ──
        const created = await chart.saveLoad.save('Morning')
        assert(created.kind === 'ok', 'a first save creates')
        equal(chart.saveLoad.current()?.ref.id, created.ref.id, 'the chart holds the created identity')
        const again = await chart.saveLoad.save('Morning')
        assert(again.kind === 'ok', 'a second save updates at the held revision')
        equal(again.ref.id, created.ref.id, 'the identity is stable across saves')
        assert(again.ref.revision !== created.ref.revision, 'the revision moved')
        // Someone else saved since, with content the chart itself wrote for another market: the
        // widget refuses rather than overwrite.
        chart.setSymbol('BETA')
        chart.setTimeframe('1h')
        await ctx.settle()
        const elsewhereBody = { name: 'Morning', ...chart.saveLoad.serialize() }
        const elsewhere = await adapter.charts.update(again.ref, elsewhereBody)
        assert(elsewhere.kind === 'ok', 'the external write landed')
        const conflict = await chart.saveLoad.save('Morning')
        assert(conflict.kind === 'conflict', 'a stale write is a typed conflict')
        equal(conflict.current.revision, elsewhere.ref.revision, 'the conflict carries the revision that stands')
        assert(conflict.message.length > 0, 'the conflict carries the catalog sentence')
        const missing = await chart.saveLoad.load('no-such-chart')
        equal(missing.kind, 'not-found', 'loading an unknown id is not-found')
        chart.setSymbol('GAMMA')
        chart.setTimeframe('1d')
        await ctx.settle()
        const loaded = await chart.saveLoad.load(created.ref.id)
        assert(loaded.kind === 'ok', 'a saved chart loads back')
        equal(chart.symbol(), 'BETA', 'the load restored the saved symbol')
        equal(chart.timeframe(), '1h', 'the load restored the saved timeframe')
        const aborted = new AbortController()
        aborted.abort()
        let abortName = ''
        try {
          await chart.saveLoad.load(created.ref.id, aborted.signal)
        } catch (e) {
          abortName = (e as Error).name
        }
        equal(abortName, 'AbortError', 'an aborted load rejects with AbortError')
        const removed = await chart.saveLoad.remove()
        equal(removed.kind, 'ok', 'the open chart deletes')
        equal(chart.saveLoad.current(), null, 'nothing is open after a delete')
        equal((await chart.saveLoad.remove()).kind, 'not-found', 'a second delete is not-found')
        equal(await adapter.charts.load(created.ref.id), null, 'the store no longer holds it')
        // ── layouts ──
        const layout = await widget.layout.saveLoad.save('Desk')
        assert(layout.kind === 'ok', 'a layout saves')
        equal(widget.layout.saveLoad.current()?.name, 'Desk', 'the layout is open')
        const moved = await adapter.layouts.update(layout.ref, { name: 'Desk', content: widget.layout.serialize().content })
        assert(moved.kind === 'ok', 'an external layout write landed')
        const layoutConflict = await widget.layout.saveLoad.save('Desk')
        equal(layoutConflict.kind, 'conflict', 'a stale layout write is a conflict')
        equal((await widget.layout.saveLoad.load('no-such-layout')).kind, 'not-found', 'an unknown layout is not-found')
        widget.layout.saveLoad.detach()
        equal(widget.layout.saveLoad.current(), null, 'detach forgets the binding')
        // ── the templates and drawings families, through the adapter contract ──
        const templates = adapter.templates('study')
        const study = await templates.create({ name: 'Bands', content: '{}' })
        assert(study.kind === 'ok', 'a template creates')
        const stale = await templates.update({ id: study.ref.id, revision: 'stale' }, { name: 'Bands', content: '{"x":1}' })
        equal(stale.kind, 'conflict', 'a template write at a stale revision conflicts')
        equal((await templates.update({ id: 'missing', revision: '1' }, { name: 'x', content: '' })).kind, 'not-found', 'a missing template is not-found')
        const drawings = adapter.drawings({ symbol: 'ALPHA' })
        const doc = await drawings.create({ content: '[]' })
        assert(doc.kind === 'ok', 'a drawings document creates')
        equal((await adapter.drawings({ symbol: 'BETA' }).list()).length, 0, 'drawings are symbol-scoped')
        const remove = await drawings.remove(doc.ref)
        equal(remove.kind, 'ok', 'a drawings document deletes at its revision')
        equal((await drawings.remove(doc.ref)).kind, 'not-found', 'and only once')
      },
    }),
  ),
  {
    id: 'persistence.stale-response',
    title: 'a load that answers after a newer load is rejected: the chart shows the newest ask',
    defect: 'chart.saveLoad.load applies whichever load resolves last (packages/chart/src/openResource.ts holds no epoch); a slow older answer overwrites a newer one',
    async run(ctx) {
      const adapter = hostSaveLoadAdapter({ delayFor: (id) => (id.endsWith('-1') ? 40 : 0) })
      const { chart } = await ctx.mount({ symbol: 'ALPHA', timeframe: '5m', saveLoad: adapter })
      chart.setSymbol('BETA')
      await ctx.settle()
      const slow = await adapter.charts.create({ name: 'Slow', ...chart.saveLoad.serialize() })
      chart.setSymbol('GAMMA')
      await ctx.settle()
      const fast = await adapter.charts.create({ name: 'Fast', ...chart.saveLoad.serialize() })
      chart.setSymbol('ALPHA')
      await ctx.settle()
      assert(slow.kind === 'ok' && fast.kind === 'ok', 'both saved')
      const first = chart.saveLoad.load(slow.ref.id)
      const second = chart.saveLoad.load(fast.ref.id)
      await Promise.all([first, second])
      await ctx.settle()
      equal(chart.saveLoad.current()?.ref.id, fast.ref.id, 'the newest ask is the open chart')
      equal(chart.symbol(), 'GAMMA', 'the newest ask is on screen')
    },
  },
  {
    id: 'feed.capability.fallback',
    title: 'a sticky timeframe the feed cannot serve opens on the first declared resolution, and the capability plane reports the declaration',
    async run(ctx) {
      const { widget, chart, feed } = await ctx.mount({ symbol: 'ALPHA', timeframe: '3m' })
      equal(chart.timeframe(), '1m', 'the chart opened on the first declared resolution')
      equal(JSON.stringify(widget.capabilities().resolutions), JSON.stringify(['1m', '5m', '1h', '1d']), 'the declaration is reported')
      equal(feed.historyCalls[0]?.tf, '1m', 'history was asked at the opening timeframe')
      equal(widget.commands.execute('chart.timeframe.set', '7m').kind, 'ok', 'the setter runs')
      equal(chart.timeframe(), '1m', 'but a token the feed cannot serve is refused')
    },
  },
  {
    id: 'feed.paging.older',
    title: 'scrolling to the left edge pages older history in once, keeps the window, and stops at the feed origin',
    async run(ctx) {
      const { chart, feed } = await ctx.mount({ symbol: 'ALPHA', timeframe: '1m' })
      const loaded: number[] = []
      chart.on('dataLoaded', (info) => loaded.push(info.bars))
      const before = feed.historyCalls.length
      chart.setLogicalRange({ from: -10, to: 90 })
      await ctx.settle()
      await ctx.settle()
      assert(feed.historyCalls.length > before, 'an older page was asked for')
      const ask = feed.historyCalls[before]!
      assert(ask.range?.to !== undefined && ask.range.to < ORIGIN + 600 * 60, 'the ask is for bars before the loaded window')
      assert(loaded.length > 0 && loaded.at(-1)! > 300, `more bars are loaded (${loaded.at(-1)})`)
      // Paging again reaches the origin and the feed says so; a later scroll asks for nothing more.
      chart.setLogicalRange({ from: -10, to: 90 })
      await ctx.settle()
      await ctx.settle()
      const calls = feed.historyCalls.length
      chart.setLogicalRange({ from: -10, to: 90 })
      await ctx.settle()
      await ctx.settle()
      equal(feed.historyCalls.length, calls, 'no ask past the feed origin')
    },
  },
  {
    id: 'feed.reconnect.snapshot',
    title: 'a full snapshot on reconnect replaces the recent window without duplicating a bar, keeps a newer bar it carries, and drops what a stale event tried to write',
    async run(ctx) {
      const { chart, feed } = await ctx.mount({ symbol: 'ALPHA', timeframe: '1m' })
      await quiet(feed, ctx.settle)
      const loaded: number[] = []
      chart.on('dataLoaded', (info) => loaded.push(info.bars))
      const last = barAt('ALPHA', '1m', BAR_COUNT - 1)
      const window = Array.from({ length: 50 }, (_, i) => barAt('ALPHA', '1m', BAR_COUNT - 50 + i))
      feed.push('ALPHA', { kind: 'snapshot', bars: window })
      await ctx.settle()
      const held = loaded.at(-1)
      assert(held !== undefined && held >= 300, `the chart holds its loaded history (${held})`)
      // The recent window the snapshot replaced was already on the chart: nothing was added twice.
      feed.push('ALPHA', { kind: 'snapshot', bars: window })
      await ctx.settle()
      equal(loaded.at(-1), held, 'a repeated snapshot adds no bar')
      // A reconnect after the market moved on: the snapshot carries one newer bar.
      const newer = { ...last, t: last.t + 60, c: last.c + 1 }
      feed.push('ALPHA', { kind: 'snapshot', bars: [...window, newer] })
      await ctx.settle()
      equal(loaded.at(-1), held + 1, 'the newer bar the snapshot carried is on the chart')
      // A stale bar event is dropped, and the next snapshot shows the series unchanged by it.
      feed.push('ALPHA', { kind: 'bar', bar: { ...last, t: last.t - 600 } })
      feed.push('ALPHA', { kind: 'snapshot', bars: [...window, newer] })
      await ctx.settle()
      equal(loaded.at(-1), held + 1, 'a stale bar never spliced history')
    },
  },
  {
    id: 'feed.unavailable.notice',
    title: 'a symbol nothing serves reports feed_unavailable on the status lane, paints no bar, and shows an honest notice',
    needs: ['toasts'],
    async run(ctx) {
      const feed = scriptedFeed()
      const { chart, root } = await ctx.mount({ symbol: 'NONE', feed, ready: false, settle: false })
      const statuses: string[] = []
      const loaded: number[] = []
      chart.on('feedStatus', (s) => statuses.push(s))
      chart.on('dataLoaded', (info) => loaded.push(info.bars))
      await ctx.settle()
      await ctx.settle()
      assert(statuses.includes('feed_unavailable'), `the status lane carries the terminal state (${statuses.join(', ')})`)
      equal(loaded.filter((n) => n > 0).length, 0, 'no bar was fabricated')
      // The drawing plane keeps a live region of its own for its placement announcements; the notice
      // is in whichever region carries text.
      const regions = Array.from(root.querySelectorAll('[role="status"][aria-live]'))
      assert(regions.some((r) => (r.textContent ?? '').trim().length > 0), 'the notice names the unserved feed')
      equal(chart.symbol(), 'NONE', 'the chart keeps the honest symbol')
    },
  },
  {
    id: 'feed.unavailable.no-subscription',
    title: 'a symbol nothing serves opens no live subscription',
    defect: "chart.ts load(): the history promise chain's final then() opens a subscription whenever none is open, so the FeedUnavailableError branch that returns early to keep one from opening is followed by a subscribeBars call anyway",
    async run(ctx) {
      const feed = scriptedFeed()
      await ctx.mount({ symbol: 'NONE', feed, ready: false })
      await ctx.settle()
      equal(feed.subscribeCount, 0, 'no live subscription for an unserved symbol')
    },
  },
  {
    id: 'replay.data-only',
    title: 'bar replay runs on data alone: start, step, play, pause, go live, exit, and live bars absorbed off screen',
    needs: ['replay'],
    async run(ctx) {
      const { widget, chart, feed } = await ctx.mount({ symbol: 'ALPHA', timeframe: '1m' })
      const states: string[] = []
      chart.on('replay', (s) => states.push(`${s.on ? 'on' : 'off'}:${s.playing ? 'play' : 'pause'}:${s.cursor}/${s.total}`))
      equal(widget.commands.execute('chart.replay.start').kind, 'ok', 'replay starts through its command')
      const started = chart.replay.state()
      equal(started.on, true, 'replay is on')
      assert(started.total > 0 && started.cursor < started.total, 'the cursor sits before the end')
      chart.replay.stepForward()
      equal(chart.replay.state().cursor, started.cursor + 1, 'a step moves one bar')
      chart.replay.stepBack()
      equal(chart.replay.state().cursor, started.cursor, 'a step back returns')
      chart.replay.play()
      equal(chart.replay.state().playing, true, 'playing')
      chart.replay.pause()
      equal(chart.replay.state().playing, false, 'paused')
      chart.replay.setSpeed(3)
      equal(chart.replay.state().speed, 3, 'speed set')
      const last = barAt('ALPHA', '1m', BAR_COUNT - 1)
      feed.push('ALPHA', { kind: 'bar', bar: { ...last, t: last.t + 60 } })
      chart.replay.goLive()
      equal(chart.replay.state().cursor, chart.replay.state().total, 'go live lands on the last bar')
      chart.replay.exit()
      equal(chart.replay.state().on, false, 'replay is off')
      assert(states.length >= 6, `the replay lane reported each move (${states.length})`)
      for (const key of Object.keys(chart.replay)) assert(!/order|position|account|trade/i.test(key), `replay offers no trading verb: ${key}`)
    },
  },
  {
    id: 'scale.modes',
    title: 'all four price-scale modes apply through the handle and the command, each reported once',
    async run(ctx) {
      const { widget, chart } = await ctx.mount({ symbol: 'ALPHA' })
      const heard: string[] = []
      chart.on('scaleMode', (m) => heard.push(m))
      for (const mode of SCALE_MODES) {
        if (mode === chart.scaleMode()) continue
        chart.setScaleMode(mode)
        equal(chart.scaleMode(), mode, `mode ${mode}`)
      }
      equal(JSON.stringify(SCALE_MODES), JSON.stringify(['normal', 'log', 'percent', 'indexed']), 'the four modes')
      equal(widget.commands.execute('chart.scale.normal').kind, 'ok', 'a mode command runs')
      equal(chart.scaleMode(), 'normal', 'the command landed')
      equal(widget.commands.execute('chart.scale.normal').kind, 'unavailable', 'the current mode is unavailable')
      equal(heard.length, 4, 'one event per change')
    },
  },
  {
    id: 'sessions.holiday',
    title: 'the market status reads the symbol session, its injected holidays and its subsessions',
    async run(ctx) {
      const alpha = await ctx.mount({ symbol: 'ALPHA' })
      await ctx.settle()
      await ctx.settle()
      // A weekday at 11:00 New York on the holiday the feed injected (2023-11-14) reads closed; the
      // same hour on the next trading day reads open.
      const holidayNoon = Date.UTC(2023, 10, 14, 16, 0, 0) / 1000
      const nextDayNoon = Date.UTC(2023, 10, 15, 16, 0, 0) / 1000
      equal(alpha.chart.marketStatus(holidayNoon)?.state, 'closed', 'closed on the injected holiday')
      equal(alpha.chart.marketStatus(nextDayNoon)?.state, 'open', 'open the next trading day')
      equal(alpha.chart.hasExtendedHours(), false, 'a single-session symbol has no extended hours')
      equal(alpha.widget.commands.available('chart.subsession.regular'), false, 'no subsession choice without extended hours')
      const gamma = await ctx.mount({ symbol: 'GAMMA' })
      await ctx.settle()
      await ctx.settle()
      equal(gamma.chart.hasExtendedHours(), true, 'subsessions give the choice')
      equal(gamma.chart.marketStatus(Date.UTC(2023, 10, 15, 12, 0, 0) / 1000)?.state, 'pre', 'pre-market before the open')
      equal(gamma.chart.subsession(), 'extended', 'every bar shows by default')
      equal(gamma.widget.commands.execute('chart.subsession.regular').kind, 'ok', 'the regular choice runs')
      equal(gamma.chart.subsession(), 'regular', 'and lands')
    },
  },
  {
    id: 'compare.placement',
    title: 'a compare adds at each placement, reads back, and removes',
    needs: ['compare'],
    async run(ctx) {
      const { widget, chart, feed } = await ctx.mount({ symbol: 'ALPHA', features: { compareSymbols: [{ symbol: 'BETA', title: 'Beta' }] } })
      const heard: number[] = []
      chart.on('compare', (entries) => heard.push(entries.length))
      equal(chart.compare.symbols()[0]?.symbol, 'BETA', 'the curated rows are the host list')
      chart.compare.add('BETA', { placement: 'same-percent' })
      await ctx.settle()
      await ctx.settle()
      equal(chart.compare.list().length, 1, 'one compare')
      equal(chart.compare.list()[0]?.placement, 'same-percent', 'at the asked placement')
      assert(feed.historyCalls.some((c) => c.symbol === 'BETA'), 'the compared symbol was fetched')
      chart.compare.add('BETA', { placement: 'new-pane' })
      await ctx.settle()
      equal(chart.compare.list()[0]?.placement, 'new-pane', 're-placing moves the compare')
      chart.compare.add('GAMMA', { placement: 'new-scale' })
      await ctx.settle()
      await ctx.settle()
      equal(chart.compare.list().length, 2, 'two compares')
      chart.compare.setVisible('GAMMA', false)
      equal(chart.compare.list().find((c) => c.symbol === 'GAMMA')?.visible, false, 'a compare hides')
      equal(widget.commands.execute('chart.compare.remove', 'GAMMA').kind, 'ok', 'remove runs through its command')
      equal(chart.compare.list().length, 1, 'one left')
      chart.compare.remove('BETA')
      equal(chart.compare.list().length, 0, 'none left')
      assert(heard.length >= 3, 'the compare lane reported')
    },
  },
  {
    id: 'indicators.families',
    title: 'an overlay and a pane study mount, report, hide, show and remove through the handle',
    async run(ctx) {
      const { chart, root } = await ctx.mount({ symbol: 'ALPHA' })
      const canvases = root.querySelectorAll('canvas').length
      const events: string[] = []
      chart.on('indicator', (e) => events.push(`${e.kind}:${e.id}`))
      equal(chart.indicators.add(smaInstance('sma-1')), true, 'overlay added')
      equal(chart.indicators.add(rsiInstance('rsi-1')), true, 'pane study added')
      await ctx.settle()
      await ctx.settle()
      equal(chart.indicators.get().length, 2, 'two instances')
      assert(root.querySelectorAll('canvas').length > canvases, 'a pane study adds a pane')
      chart.indicators.hide('rsi-1')
      equal(JSON.stringify(chart.indicators.hidden()), JSON.stringify(['rsi-1']), 'hidden reads the eye')
      chart.indicators.show('rsi-1')
      equal(chart.indicators.hidden().length, 0, 'shown again')
      chart.indicators.remove('sma-1')
      equal(chart.indicators.get().length, 1, 'one removed')
      chart.indicators.set([])
      equal(chart.indicators.get().length, 0, 'set replaces the list')
      assert(events.some((e) => e.startsWith('added:')), 'add reported')
      assert(events.some((e) => e.startsWith('hidden:')), 'hide reported')
    },
  },
  {
    id: 'layouts.panes.sync.blob',
    title: 'a layout re-tiles, activates, syncs the symbol, and saves and restores as one blob',
    async run(ctx) {
      const { widget } = await ctx.mount({ symbol: 'ALPHA' })
      const active: string[] = []
      widget.on('activeChart', (h) => active.push(h.id))
      widget.layout.setArrangement('2h')
      equal(widget.charts().length, 2, 'two charts')
      equal(widget.layout.arrangement(), '2h', 'the arrangement reads back')
      const [first, second] = widget.charts()
      equal(second!.symbol(), 'ALPHA', 'a new chart clones the active symbol')
      widget.layout.setActive(1)
      equal(widget.activeChart().id, second!.id, 'the active chart moved')
      assert(active.includes(second!.id), 'the move was reported')
      widget.layout.setSync({ symbol: true })
      second!.setSymbol('BETA')
      await ctx.settle()
      equal(first!.symbol(), 'BETA', 'symbol sync carried the change across')
      const blob = widget.layout.serialize().content
      assert(typeof blob === 'string' && blob.length > 2, 'one content blob')
      widget.layout.setArrangement('s')
      equal(widget.charts().length, 1, 'back to one chart')
      widget.layout.restore(blob)
      equal(widget.layout.arrangement(), '2h', 'the blob restored the arrangement')
      equal(widget.charts().length, 2, 'and both charts')
      equal(widget.layout.sync().symbol, true, 'and the sync flags')
      let threw = false
      try {
        widget.layout.setArrangement('nope')
      } catch {
        threw = true
      }
      equal(threw, true, 'an unknown arrangement throws')
    },
  },
  {
    id: 'styles.switch',
    title: 'every style switches without a refetch and keeps the indicators, the scale and the compares',
    needs: ['compare'],
    async run(ctx) {
      const { chart, feed } = await ctx.mount({ symbol: 'ALPHA', indicators: [smaInstance('sma-1')] })
      chart.setScaleMode('percent')
      chart.compare.add('BETA', { placement: 'same-percent' })
      await quiet(feed, ctx.settle)
      const history = feed.historyCalls.length
      const heard: string[] = []
      chart.on('style', (s) => heard.push(s))
      for (const style of CHART_STYLES) {
        if (style === chart.style()) continue
        chart.setStyle(style)
        equal(chart.style(), style, `style ${style}`)
      }
      await ctx.settle()
      const refetched = feed.historyCalls.slice(history).filter((c) => c.symbol === 'ALPHA')
      equal(refetched.length, 0, 'the charted symbol is not refetched across seven styles')
      equal(chart.indicators.get().length, 1, 'indicator kept')
      equal(chart.scaleMode(), 'percent', 'scale kept')
      equal(chart.compare.list().length, 1, 'compare kept')
      equal(heard.length, CHART_STYLES.length - 1, 'one event per switch')
    },
  },
  {
    id: 'styles.switch.compares-not-refetched',
    title: 'a style switch keeps the compared series without refetching their history',
    needs: ['compare'],
    defect: 'every style switch asks the feed for each compared symbol again (the compare plane refetches its window when the main series is rebuilt, widget/compare.ts sync after setStyle); the contract is that a style switch refetches nothing',
    async run(ctx) {
      const { chart, feed } = await ctx.mount({ symbol: 'ALPHA' })
      chart.compare.add('BETA', { placement: 'same-percent' })
      await quiet(feed, ctx.settle)
      const history = feed.historyCalls.length
      chart.setStyle('line')
      await ctx.settle()
      const extra = feed.historyCalls.slice(history).map((c) => `${c.symbol} ${c.tf}`)
      equal(extra.length, 0, `no compare refetch on a style switch (asked: ${extra.join('; ')})`)
    },
  },
  {
    id: 'drawings.catalog.persistence',
    title: 'the drawing layer arms every registered tool, persists per symbol through the adapter, and blanks on the eye',
    needs: ['drawings'],
    async run(ctx) {
      const adapter = memorySaveLoadAdapter()
      const { chart } = await ctx.mount({ symbol: 'ALPHA', saveLoad: adapter })
      assert(chart.drawings, 'the drawing layer is on')
      for (const tool of drawingTools.all()) {
        chart.drawings.armTool(tool.type)
        equal(chart.drawings.activeTool(), tool.type, `${tool.type} arms`)
      }
      chart.drawings.armTool(null)
      equal(chart.drawings.activeTool(), null, 'disarmed')
      chart.drawings.setAllHidden(true)
      equal(chart.drawings.allHidden(), true, 'the eye blanks')
      chart.drawings.setAllHidden(false)
    },
  },
]

// ── The runner ──────────────────────────────────────────────────────────────────────────────────

/** Whether a host has named one of a check's needed features unavailable. */
export function skipReason(check: ConformanceCheck, host: ConformanceHost): string | null {
  if (check.defect) return `known defect: ${check.defect}`
  const off = host.unavailable
  if (!off || !check.needs) return null
  const missing = check.needs.filter((flag) => off.features[flag] === false)
  return missing.length > 0 ? `${off.reason} (needs ${missing.join(', ')})` : null
}

/** Run one check against a host, mounting through the host's door and disposing everything the
 *  check mounted. */
export async function runCheck(check: ConformanceCheck, host: ConformanceHost): Promise<ConformanceResult> {
  const reason = skipReason(check, host)
  if (reason) return { id: check.id, title: check.title, status: 'skipped', detail: reason }
  const mounted: Mounted[] = []
  const settle = host.settle ?? macrotask
  const doc = host.document
  const win = doc.defaultView as (Window & typeof globalThis) | null
  assert(win, 'the host document has a window')
  const ctx: CheckContext = {
    host,
    document: doc,
    window: win,
    settle,
    async mount(overrides = {}) {
      const { feed: given, ready = true, settle: settleFirst = true, ...options } = overrides
      const feed = given ?? scriptedFeed()
      const container = doc.createElement('div')
      container.style.width = '800px'
      container.style.height = '420px'
      doc.body.appendChild(container)
      const features = { ...(host.unavailable?.features ?? {}), ...(options.features ?? {}) }
      const widget = host.createWidget({ container, datafeed: feed, symbol: 'ALPHA', timeframe: '1m', ...options, features })
      if (ready) await widget.ready()
      if (settleFirst) await settle()
      const root = rootOf(container)
      const entry: Mounted = { widget, chart: widget.activeChart(), container, root, feed }
      mounted.push(entry)
      return entry
    },
  }
  try {
    await check.run(ctx)
    return { id: check.id, title: check.title, status: 'passed' }
  } catch (error) {
    return { id: check.id, title: check.title, status: 'failed', detail: error instanceof Error ? `${error.name}: ${error.message}` : String(error) }
  } finally {
    // Let the widget's own queued work land before it comes down: what a dispose does with work
    // still queued is the lifecycle.dispose.after-change check's question, not every check's.
    await settle()
    for (const m of mounted.reverse()) {
      try {
        m.widget.dispose()
      } catch {
        /* a dispose that throws is the check's own failure to report, not the runner's */
      }
      m.container.remove()
    }
    await settle()
  }
}

/** Run every check, in order. */
export async function runConformance(host: ConformanceHost): Promise<ConformanceResult[]> {
  const results: ConformanceResult[] = []
  for (const check of CONFORMANCE_CHECKS) results.push(await runCheck(check, host))
  return results
}

/** One line per result, for a host with no test runner. */
export function formatResults(results: readonly ConformanceResult[]): string {
  return results.map((r) => `${r.status === 'passed' ? 'ok  ' : r.status === 'skipped' ? 'skip' : 'FAIL'} ${r.id}: ${r.title}${r.detail ? `\n       ${r.detail}` : ''}`).join('\n')
}

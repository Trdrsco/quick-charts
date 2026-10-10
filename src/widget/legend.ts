// The legend's wiring: what it reads, what each control means, and where its intent goes.
//
// The legend itself owns no chart state. It reports an intent, this module turns that intent into a
// call on the plane that owns the state, and the resulting recompute pushes fresh rows back. The
// row list is ONE list, indicator rows followed by compare rows, so a compare row and an indicator
// row cannot end up rendered by two different passes and disagree.
//
// The READING is this module's other half. It follows the crosshair straight off the renderer, not
// off the chart's sync bus: a layout mirroring one chart's crosshair onto another mutes that bus to
// stop the two echoing, and a legend that listened there would go quiet on every mirrored pane.
// What it reads is the PAINTED model, so a replay cursor's slice and a subsession filter both hold
// and the legend can never name a bar the viewer cannot see. Prices come out of the chart's one
// symbol formatter, so a level in the legend is the level on the axis.
import type { IChartApi, MouseEventParams } from 'lightweight-charts'
import { mountChartLegend, type ChartLegend, type LegendIdentity, type LegendLook, type LegendQuote } from '../chartLegend'
import type { FeedBar } from '../datafeed'
import { volumeText } from '../internal/drawings/core/bars'
import { colorWithAlpha } from '../settings/defaults'
import type { ChartSettings } from '../settings/schema'
import type { ChartI18n } from '../i18n'
import { mountInputsEditor } from '../inputsEditor'
import { manifestInputDefaults } from '../indicatorModel'
import { COLLAPSED_H, planPaneOp } from '../panePlan'
import type { PriceFormatter } from '../priceFormatter'
import { marketStatusTitle, type MarketStatus, type SessionModel, type SessionState } from '../sessionModel'
import type { SymbolInfo } from '../symbology'
import { symbolNames } from '../symbolLabel'
import { openMarketStatus } from '../ui/chrome/marketStatus'
import type { MenuHandle } from '../ui/chrome/menu'
import type { IndicatorsPlane } from './indicators'
import type { ComparePlane } from './compare'
import type { CommandRegistry } from './commands'
import type { MarkPainters } from '../markPainters'
import type { IconResolver } from '../ui/icons/resolver'

/** The compare-row id prefix. A compare row and an indicator row share one list, so the prefix is
 *  what tells the two apart without a second lookup. */
export const COMPARE_ROW_PREFIX = 'cmp:'

/** Host-owned activity, displayed with indicators but never saved as an indicator or plotted. */
export interface ChartLegendRow {
  id: string
  title: string
  inputs?: string
  status: string
  description?: string
  settingsLabel?: string
  onSettings?: () => void
}

const HOST_ROW_PREFIX = 'host:'

export interface LegendPlane {
  /** Push the current reading: the bar being read, then the rows (indicators, then comparisons). */
  push(): void
  setHeader(symbol: string, tf: string): void
  setDot(state: SessionState | null): void
  setHostRows(rows: readonly ChartLegendRow[]): void
  destroy(): void
}

export interface LegendDeps {
  /** The chart's ONE command registry. Every control below runs through it, so the legend cannot
   *  reach a verb the access policy refuses or a feature flag has switched off. */
  commands: CommandRegistry
  chart: IChartApi
  /** The chrome subtree the legend mounts into. */
  chrome: HTMLElement
  i18n: ChartI18n
  enabled: boolean
  /** Whether the dot opens the market-status popup. */
  marketStatus: boolean
  /** Whether the chart serves symbol search. With it off the name is a plain mark: the host said
   *  this chart has no search, and a door onto nothing would be a lie. */
  symbolSearch: boolean
  /** Open the chart's own search dialog for this chart, the same door the top bar's symbol control
   *  knocks on. */
  openSearch(): void
  indicators: IndicatorsPlane
  compare: ComparePlane | null
  /** The symbol as the datafeed resolved it, or null while it is unresolved. */
  symbolInfo(): SymbolInfo | null
  /** The bars actually PAINTED, which is what the legend may name. */
  bars(): readonly FeedBar[]
  /** The chart's one symbol formatter. */
  formatter(): PriceFormatter
  /** Where replay stands, so the mark can separate ARMING from running. */
  replayPhase(): 'off' | 'arming' | 'on'
  /** The chart's style paints close-only bars, so the legend's reading has no open, high or low.
   *  Read on every push, because a style change is a repaint like any other. */
  valueShaped(): boolean
  /** The symbol's session model and status, for the popup. */
  sessionModel(): SessionModel | null
  status(nowSecs: number): MarketStatus | null
  /** The chrome's indicator settings door. False when no dialog took the request, in which case
   *  the inputs-only editor opens at the gear. */
  openIndicatorSettings(instanceId: string): boolean
  /** Whether the legend carries the VALUES row: the read bar's O H L C and its move. Off leaves the
   *  identity row standing alone, which is what a touch surface with no pointer to hover with
   *  wants. */
  legendValues: boolean
  /** The chart settings in effect: the status line's parts, its backdrop and the replay mark. */
  settings(): ChartSettings
  /** The host's mark painters. The badge wears the market's; with none lent it wears the package's
   *  own neutral monogram. */
  painters: MarkPainters
  /** Draws the legend's glyphs: the host's drawing for each icon, or the chart's own. */
  icons: IconResolver
  /** Whether a row's control for a command is drawn: false for a command the policy refuses when
   *  the host hides what it refuses. Every control is drawn without it. */
  shown?(command: string): boolean
}

/** The index of the bar a moment stands on: the last bar at or before `time`, the last bar of all
 *  when the crosshair is away, and the first bar when the moment predates the window. Exported for
 *  tests. */
export function barIndexAt(bars: readonly FeedBar[], time: number | null): number {
  if (bars.length === 0) return -1
  if (time === null) return bars.length - 1
  let lo = 0
  let hi = bars.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (bars[mid]!.t <= time) lo = mid
    else hi = mid - 1
  }
  return lo
}

/** The legend's look under the chart settings: the status line's parts, its backdrop (the chart's
 *  background at the setting's opacity), and the replay part of the watermark. Exported for tests. */
export function legendLook(settings: ChartSettings): LegendLook {
  const line = settings.statusLine
  return {
    logo: line.logo,
    title: line.title,
    chartValues: line.chartValues,
    barChange: line.barChange,
    volume: line.volume,
    indicatorTitles: line.indicatorTitles,
    indicatorInputs: line.indicatorInputs,
    indicatorValues: line.indicatorValues,
    backdrop: line.background && line.backgroundOpacity > 0 ? colorWithAlpha(settings.canvas.background, line.backgroundOpacity / 100) : null,
    replayMark: settings.canvas.watermarkReplay,
    replayMarkColor: settings.canvas.watermarkColor,
  }
}

/** How the header names the market, by the title setting: its name (the feed's description), its
 *  symbol, or the symbol with the name after it. Before the feed resolves the symbol there is
 *  nothing to name it with but the symbol itself, minus its venue prefix. Exported for tests. */
export function legendIdentity(symbol: string, info: SymbolInfo | null, timeframe: string, source: ChartSettings['statusLine']['titleSource']): LegendIdentity {
  const names = symbolNames(info ?? symbol)
  const base = { symbol, timeframe, exchange: info?.exchange ?? '' }
  if (source === 'symbol') return { ...base, name: names.mark }
  if (source === 'symbolAndName') return names.description === names.mark ? { ...base, name: names.mark } : { ...base, name: names.mark, detail: names.description }
  return { ...base, name: names.description }
}

/** Percentage writers, one per language tag. The move as a percentage of the previous close, to
 *  two decimal places and carrying its sign, in the reader's own digits and grouping. The rounding
 *  is arithmetic rather than a fraction-digit option because the package has exactly one writer
 *  that sets a decimal width from a market's facts, and it is the symbol's price formatter; this
 *  is a ratio, which has no symbology at all. */
const percentWriters = new Map<string, Intl.NumberFormat>()
function percentText(fraction: number, tag: string): string {
  let writer = percentWriters.get(tag)
  if (!writer) {
    writer = new Intl.NumberFormat(tag)
    percentWriters.set(tag, writer)
  }
  const points = Math.round(fraction * 10000) / 100
  return `${points > 0 ? '+' : ''}${writer.format(points)}`
}

export function attachLegendPlane(deps: LegendDeps): LegendPlane {
  if (!deps.enabled) {
    return {
      push: () => undefined,
      setHeader: () => undefined,
      setDot: () => undefined,
      setHostRows: () => undefined,
      destroy: () => undefined,
    }
  }

  /** Remembered pane heights for collapse, maximize and restore. */
  let destroyed = false
  const hostRows = new Map<string, ChartLegendRow>()
  const paneRemembered = new Map<string, number>()
  const paneKeys = (): Record<number, string> => {
    const keys: Record<number, string> = { 0: 'main' }
    for (const [id, pane] of Object.entries(deps.indicators.renderer.paneOf())) if (pane > 0) keys[pane] = `indicator:${id}`
    for (const entry of deps.compare?.api.list() ?? []) {
      const pane = deps.compare!.handle.paneIndexOf(entry.symbol)
      if (pane !== null && pane > 0) keys[pane] = `compare:${entry.symbol}`
    }
    return keys
  }
  let legend: ChartLegend | null = null
  /** The market-status popup while it is open, so teardown closes it. */
  let status: MenuHandle | null = null
  /** The moment the crosshair stands on, or null while it is away from the plot. */
  let hovered: number | null = null
  /** The market the header last named, so a switch drops a crosshair that belonged to the old one. */
  let named: string | null = null
  let namedTimeframe: string | null = null
  /** The identity the header was last given, so a repaint writes it only when it moved. */
  let written = ''
  /** Name the market the header is on, in the words the title setting asks for. */
  const writeIdentity = (): void => {
    if (named === null || namedTimeframe === null) return
    const identity = legendIdentity(named, deps.symbolInfo(), namedTimeframe, deps.settings().statusLine.titleSource)
    const key = JSON.stringify(identity)
    if (key === written) return
    written = key
    legend?.setIdentity(identity)
  }

  legend = mountChartLegend(deps.chrome, deps.i18n, {
    // Every row control is a COMMAND. The legend states an intent by id and the registry decides
    // whether it may run, so a verb the host forbade cannot be reached by clicking either.
    onToggleEye: (id) => {
      if (id.startsWith(COMPARE_ROW_PREFIX)) {
        const symbol = id.slice(COMPARE_ROW_PREFIX.length)
        const entry = deps.compare?.api.list().find((e) => e.symbol === symbol)
        if (entry) deps.commands.execute('chart.compare.setVisible', { symbol, visible: !entry.visible })
        return
      }
      deps.commands.execute(deps.indicators.isHidden(id) ? 'chart.indicators.show' : 'chart.indicators.hide', id)
    },
    onTitle: (id) => {
      if (id.startsWith(COMPARE_ROW_PREFIX)) deps.commands.execute('chart.compare.changeSymbol', id.slice(COMPARE_ROW_PREFIX.length))
    },
    onRemove: (id) => {
      if (id.startsWith(COMPARE_ROW_PREFIX)) deps.commands.execute('chart.compare.remove', id.slice(COMPARE_ROW_PREFIX.length))
      else deps.commands.execute('chart.indicators.remove', id)
    },
    ...(deps.symbolSearch ? { onSymbol: () => deps.openSearch() } : {}),
    painters: deps.painters,
    icons: deps.icons,
    ...(deps.marketStatus
      ? {
          onStatus: (anchor: HTMLElement) => {
            if (status) { status.close(); return }
            status = openMarketStatus(anchor, {
              host: deps.chrome,
              i18n: deps.i18n,
              model: deps.sessionModel,
              status: deps.status,
              onClose: () => {
                status = null
              },
            })
          },
        }
      : {}),
    onSettings: (id, rect) => {
      const host = hostRows.get(id)
      if (host) { host.onSettings?.(); return }
      // The settings dialog takes the gear when the chrome serves one; otherwise the inputs-only
      // editor opens at the gear, as the smallest surface that still edits the declaration.
      if (deps.openIndicatorSettings(id)) return
      const inst = deps.indicators.list().find((i) => i.id === id)
      if (!inst) return
      mountInputsEditor(
        deps.chrome,
        rect,
        inst.definition.manifest.inputs ?? {},
        { ...manifestInputDefaults(inst.definition.manifest), ...inst.inputs },
        (patch) => deps.indicators.patchInputs(id, patch),
        deps.i18n,
        deps.icons,
      )
    },
    onPaneOp: (id, op) => {
      const paneIdx = deps.indicators.renderer.paneOf()[id]
      if (paneIdx === undefined || paneIdx === 0) return
      const panes = deps.chart.panes()
      const heights: Record<number, number> = {}
      panes.forEach((p, i) => (heights[i] = p.getHeight()))
      const keys = paneKeys()
      const remembered: Record<number, number> = {}
      for (const [index, key] of Object.entries(keys)) {
        const height = paneRemembered.get(key)
        if (height !== undefined) remembered[Number(index)] = height
      }
      const plan = planPaneOp({ heights, remembered }, { kind: op, pane: paneIdx })
      paneRemembered.clear()
      for (const [index, height] of Object.entries(plan.remembered)) {
        const key = keys[Number(index)]
        if (key) paneRemembered.set(key, height)
      }
      for (const [i, h] of Object.entries(plan.apply)) {
        const index = Number(i)
        panes[index]?.setHeight(h)
        // The plan is the record of what the viewer asked for, so it is what the row reports. A
        // maximize collapses every OTHER pane, which is why this reads the whole plan rather than
        // just the pane the command named. Reading the heights back instead would be guesswork:
        // a pane is born at the floor and rebalanced later, so short and collapsed look identical
        // for the first frames of a pane's life.
        if (index > 0) deps.indicators.setPaneCollapsed(index, h <= COLLAPSED_H)
      }
      deps.indicators.recompute()
    },
  })

  /** The bar being read, written through the chart's own formatter, or null while nothing is
   *  painted. The change is against the PREVIOUS painted bar's close; the first bar of the painted
   *  window has none, and states none rather than borrowing its own open. */
  function reading(): LegendQuote | null {
    const bars = deps.bars()
    const index = barIndexAt(bars, hovered)
    const bar = index < 0 ? undefined : bars[index]
    if (!bar) return null
    const previous = index > 0 ? bars[index - 1] : undefined
    const format = deps.formatter()
    const change = previous ? bar.c - previous.c : null
    const fraction = change !== null && previous && previous.c !== 0 ? change / previous.c : null
    return {
      open: format.format(bar.o),
      high: format.format(bar.h),
      low: format.format(bar.l),
      close: format.format(bar.c),
      change: change === null ? null : `${change > 0 ? '+' : ''}${format.format(change)}`,
      percent: fraction === null ? null : percentText(fraction, deps.i18n.tag()),
      direction: change === null || change === 0 ? 'flat' : change > 0 ? 'up' : 'down',
      volume: typeof bar.v === 'number' && Number.isFinite(bar.v) ? volumeText(bar.v) : null,
    }
  }

  const paint = (): void => {
    if (destroyed) return
    const alive = new Set(Object.values(paneKeys()))
    for (const key of paneRemembered.keys()) if (!alive.has(key)) paneRemembered.delete(key)
    legend?.setLook(legendLook(deps.settings()))
    writeIdentity()
    legend?.setValueShaped(deps.valueShaped())
    legend?.setQuote(deps.legendValues ? reading() : null)
    const paneOf = deps.indicators.renderer.paneOf()
    // A row's eye and its remove are commands: a host that hides what its policy refuses leaves out
    // the ones it refuses, and the row itself stays, since it names what the chart shows.
    const shown = (command: string): boolean => deps.shown?.(command) ?? true
    legend?.setChips([
      ...deps.indicators.chipsAt(hovered).map(row => {
        const paneIndex = paneOf[row.id] ?? 0
        const remembered = paneRemembered.get(`indicator:${row.id}`)
        return {
          ...row,
          indicator: true,
          paneIndex,
          maximized: remembered !== undefined && !row.collapsed && (deps.chart.panes()[paneIndex]?.getHeight() ?? 0) > remembered,
          ...(shown(row.hidden ? 'chart.indicators.show' : 'chart.indicators.hide') ? {} : { hideable: false }),
          ...(shown('chart.indicators.remove') ? {} : { removable: false }),
        }
      }),
      ...(deps.compare?.chips(hovered) ?? []).map(row => ({
        ...row,
        paneIndex: deps.compare!.handle.paneIndexOf(row.id.slice(COMPARE_ROW_PREFIX.length)) ?? 0,
        ...(shown('chart.compare.setVisible') ? {} : { hideable: false }),
        ...(shown('chart.compare.remove') ? {} : { removable: false }),
      })),
      ...[...hostRows].map(([id, row]) => ({
        id, title: row.title, inputs: row.inputs, value: null, note: row.status,
        description: row.description, settingsLabel: row.settingsLabel,
        hidden: false, hideable: false, removable: false, hasInputs: !!row.onSettings, paneIndex: 0,
      })),
    ])
    const tops: Record<number, number> = {}
    let top = 0
    const panes = deps.chart.panes()
    const first = panes[0]?.getHTMLElement()?.getBoundingClientRect()
    for (const [index, pane] of panes.entries()) {
      const element = pane.getHTMLElement()
      const rect = element?.getBoundingClientRect()
      tops[index] = rect && first && rect.height > 0 ? rect.top - first.top : top
      top += pane.getHeight()
      if (element && !observed.has(element)) { observed.add(element); resize?.observe(element) }
    }
    const current = new Set(panes.map(pane => pane.getHTMLElement()))
    for (const element of observed) if (!current.has(element)) { resize?.unobserve(element); observed.delete(element) }
    legend?.setPaneTops(tops)
    try {
      const start = deps.chart.priceScale('left').width()
      const end = deps.chart.priceScale('right').width()
      legend?.setScaleInsets(start, end, deps.chart.timeScale().height())
      // The plot's own box, published for the chrome that belongs over the BARS rather than over
      // the axes beside them: the navigation cluster centers on it. Written here because this is
      // where the renderer's own scale widths are already read, on the same pass that follows a
      // resize, a pane change and a scale that grew a digit.
      deps.chrome.style.setProperty('--qcp-plot-start', `${start}px`)
      deps.chrome.style.setProperty('--qcp-plot-end', `${end}px`)
    } catch {
      /* chart mid-teardown */
    }
  }

  const observed = new Set<HTMLElement>()
  const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => paint())

  // The crosshair, straight off this chart's own renderer. The renderer snaps `time` to a bar, so
  // a pass along one bar is one repaint rather than one per pixel.
  const onCrosshair = (param: MouseEventParams): void => {
    // While ARMING, the guide follows the pointer in PIXELS rather than in bars: the rule marks
    // where the click would land, and snapping it to the bar the reading uses would make it lag the
    // hand by half a bar's width. Updated before the early return, because a pass along one bar is
    // one repaint of the reading but many pixels of travel for the guide.
    if (deps.replayPhase() === 'arming')
      legend?.setReplayGuide(param.point ? { x: param.point.x, y: param.point.y } : null, deps.chart.timeScale().height())
    const next = typeof param.time === 'number' && Number.isFinite(param.time) ? param.time : null
    if (next === hovered) return
    hovered = next
    paint()
  }
  deps.chart.subscribeCrosshairMove(onCrosshair)

  return {
    setHostRows(rows) {
      if (destroyed) return
      hostRows.clear()
      for (const row of rows) hostRows.set(`${HOST_ROW_PREFIX}${row.id}`, { ...row })
      paint()
    },
    push() {
      paint()
    },
    setHeader(symbol, tf) {
      if (symbol !== named || (deps.replayPhase() !== 'off')) { status?.close(); status = null }
      legend?.setReplay(deps.replayPhase())
      // A market change takes the crosshair with it: a moment hovered on the old symbol's window
      // means nothing on the new one's.
      if (symbol !== named || tf !== namedTimeframe) {
        named = symbol
        namedTimeframe = tf
        hovered = null
      }
      writeIdentity()
    },
    setDot(state) {
      const current = deps.status(Math.floor(Date.now() / 1000))
      legend?.setDot(state, current ? marketStatusTitle(deps.i18n.t, current) : deps.i18n.t('status.unknownTitle'))
      status?.refresh()
    },
    destroy() {
      destroyed = true
      hostRows.clear()
      resize?.disconnect()
      observed.clear()
      deps.chart.unsubscribeCrosshairMove(onCrosshair)
      status?.close()
      status = null
      legend?.destroy()
      legend = null
    },
  }
}

// Every built-in chart verb, registered as a command.
//
// This file is the reason the command registry can claim to be the ONE source. A verb that exists
// only as a method on the handle would be reachable from code but not from a menu, a shortcut or an
// operator; a verb that exists only as a menu row would be reachable from the glass but not from a
// host. Registering them here makes those the same list, so `features` and `access` filter every
// door at once.
//
// Availability is a live read, never a stored flag: a command asks the chart what is true now.
import type { ChartMessageKey } from '../i18n'
import { SCALE_MODES, type ScaleMode } from '../scaleMode'
import type { DrawingsHandle } from '../drawings'
import type { PriceFormatter } from '../priceFormatter'
import type { CommandRegistry, CommandSpec } from './commands'
import type { ChartHandle } from './chart'
import type { Capabilities } from './options'
import type { ResolvedFeatures } from './planes'
import { CHART_STYLES, type ChartStyleId } from './styles'
import { ZOOM_IN, ZOOM_OUT } from './ranges'
import { REPLAY_SPEEDS } from '../replay'

/** How many bars one scroll command moves. */
const SCROLL_BARS = 10

/** The catalog key each chart style's command wears. */
const STYLE_LABEL: Record<ChartStyleId, ChartMessageKey> = {
  candles: 'command.styleCandles',
  hollow: 'command.styleHollow',
  bars: 'command.styleBars',
  line: 'command.styleLine',
  area: 'command.styleArea',
  baseline: 'command.styleBaseline',
  stepline: 'command.styleStepline',
}

/** The catalog key each scale mode's command wears. */
const SCALE_LABEL: Record<ScaleMode, ChartMessageKey> = {
  normal: 'command.scaleNormal',
  log: 'command.scaleLog',
  percent: 'command.scalePercent',
  indexed: 'command.scaleIndexed',
}

export interface ChartCommandDeps {
  commands: CommandRegistry
  handle: ChartHandle
  features: ResolvedFeatures
  capabilities(): Capabilities
  /** The level the open menu was raised at, which copy-price acts on. */
  level(): number | null
  formatter(): PriceFormatter
  drawings(): DrawingsHandle | null
  compareOpen(mode: 'compare' | 'change-symbol'): void
}

/** Register every chart-scoped built-in. Returns one unregister for all of them, which the chart
 *  calls at dispose so a held registry cannot run a verb against a chart that is gone. */
export function registerChartCommands(deps: ChartCommandDeps): () => void {
  const { commands, handle, features } = deps
  const unregisters: (() => void)[] = []
  const add = (spec: CommandSpec): void => {
    unregisters.push(commands.register(spec))
  }
  const always = (): boolean => true

  // ── View and navigation ─────────────────────────────────────────────────────────────────────
  add({ id: 'chart.view.reset', scope: 'chart', label: 'command.viewReset', shortcut: 'Alt+KeyR', available: always, execute: () => handle.reset() })
  add({ id: 'chart.view.goLive', scope: 'chart', label: 'command.viewGoLive', available: always, execute: () => handle.goLive() })
  add({ id: 'chart.view.zoomIn', scope: 'chart', label: 'command.viewZoomIn', available: always, execute: () => handle.zoom(ZOOM_IN) })
  add({ id: 'chart.view.zoomOut', scope: 'chart', label: 'command.viewZoomOut', available: always, execute: () => handle.zoom(ZOOM_OUT) })
  add({ id: 'chart.view.scrollLeft', scope: 'chart', label: 'command.viewScrollLeft', available: always, execute: () => handle.scroll(-SCROLL_BARS) })
  add({ id: 'chart.view.scrollRight', scope: 'chart', label: 'command.viewScrollRight', available: always, execute: () => handle.scroll(SCROLL_BARS) })

  // ── The level menu's own verbs ──────────────────────────────────────────────────────────────
  add({
    id: 'chart.price.copy',
    scope: 'chart',
    label: 'command.priceCopy',
    available: () => deps.level() !== null,
    execute: () => {
      const level = deps.level()
      if (level == null) return
      void navigator.clipboard?.writeText(deps.formatter().format(level)).catch(() => undefined)
    },
  })

  // ── Styles: one command per style, all seven, so a picker and a shortcut share the list ──────
  for (const style of CHART_STYLES) {
    add({
      id: `chart.style.${style}`,
      scope: 'chart',
      label: STYLE_LABEL[style],
      available: () => handle.style() !== style,
      execute: () => handle.setStyle(style),
    })
  }

  // ── Scale modes ─────────────────────────────────────────────────────────────────────────────
  for (const mode of SCALE_MODES) {
    add({
      id: `chart.scale.${mode}`,
      scope: 'chart',
      label: SCALE_LABEL[mode],
      available: () => handle.scaleMode() !== mode,
      execute: () => handle.setScaleMode(mode),
    })
  }

  // ── Indicators ──────────────────────────────────────────────────────────────────────────────
  add({
    id: 'chart.indicators.removeAll',
    scope: 'chart',
    label: 'command.indicatorsRemoveAll',
    available: () => handle.indicators.get().length > 0,
    execute: () => handle.indicators.set([]),
  })
  add({
    id: 'chart.indicators.remove',
    scope: 'chart',
    label: 'command.indicatorRemove',
    available: () => handle.indicators.get().length > 0,
    execute: (arg) => {
      if (typeof arg === 'string') handle.indicators.remove(arg)
    },
  })
  add({
    id: 'chart.indicators.hide',
    scope: 'chart',
    label: 'command.indicatorHide',
    available: () => handle.indicators.get().length > 0,
    execute: (arg) => {
      if (typeof arg === 'string') handle.indicators.hide(arg)
    },
  })
  add({
    id: 'chart.indicators.show',
    scope: 'chart',
    label: 'command.indicatorShow',
    available: () => handle.indicators.hidden().length > 0,
    execute: (arg) => {
      if (typeof arg === 'string') handle.indicators.show(arg)
    },
  })

  // ── Drawings ────────────────────────────────────────────────────────────────────────────────
  add({
    id: 'chart.drawings.removeAll',
    scope: 'chart',
    label: 'command.drawingsRemoveAll',
    available: () => (handle.drawings?.count() ?? 0) > 0,
    execute: () => handle.drawings?.clearAll(),
  })
  add({
    id: 'chart.drawings.deleteSelected',
    scope: 'chart',
    label: 'command.drawingDeleteSelected',
    available: () => handle.drawings?.hasSelection() ?? false,
    execute: () => handle.drawings?.deleteSelected(),
  })
  // Arming a tool is ONE command taking the tool id: the ninety registered tools would otherwise be
  // ninety near-identical entries, and the access policy already refuses per tool inside the layer.
  add({
    id: 'chart.drawings.arm',
    scope: 'chart',
    label: 'command.drawingArm',
    available: () => features.drawings,
    execute: (arg) => {
      if (arg === null || typeof arg === 'string') handle.drawings?.armTool(arg)
    },
  })

  // ── Compare ─────────────────────────────────────────────────────────────────────────────────
  add({
    id: 'chart.compare.open',
    scope: 'chart',
    label: 'command.compareOpen',
    available: () => features.compare && deps.capabilities().search,
    execute: () => deps.compareOpen('compare'),
  })
  add({
    id: 'chart.compare.add',
    scope: 'chart',
    label: 'command.compareAdd',
    available: () => features.compare,
    execute: (arg) => {
      if (typeof arg === 'string') handle.compare.add(arg, { placement: 'same-percent' })
    },
  })
  add({
    id: 'chart.compare.remove',
    scope: 'chart',
    label: 'command.compareRemove',
    available: () => features.compare && handle.compare.list().length > 0,
    execute: (arg) => {
      if (typeof arg === 'string') handle.compare.remove(arg)
    },
  })

  // ── Replay ──────────────────────────────────────────────────────────────────────────────────
  add({ id: 'chart.replay.start', scope: 'chart', label: 'command.replayStart', available: () => features.replay && !handle.replay.state().on, execute: () => handle.replay.start() })
  add({ id: 'chart.replay.exit', scope: 'chart', label: 'command.replayExit', available: () => handle.replay.state().on, execute: () => handle.replay.exit() })
  add({ id: 'chart.replay.play', scope: 'chart', label: 'command.replayPlay', available: () => handle.replay.state().on && !handle.replay.state().playing, execute: () => handle.replay.play() })
  add({ id: 'chart.replay.pause', scope: 'chart', label: 'command.replayPause', available: () => handle.replay.state().playing, execute: () => handle.replay.pause() })
  add({ id: 'chart.replay.stepForward', scope: 'chart', label: 'command.replayStepForward', available: () => handle.replay.state().on, execute: () => handle.replay.stepForward() })
  add({ id: 'chart.replay.stepBack', scope: 'chart', label: 'command.replayStepBack', available: () => handle.replay.state().on, execute: () => handle.replay.stepBack() })
  add({ id: 'chart.replay.goLive', scope: 'chart', label: 'command.replayGoLive', available: () => handle.replay.state().on, execute: () => handle.replay.goLive() })
  add({
    id: 'chart.replay.setSpeed',
    scope: 'chart',
    label: 'command.replaySpeed',
    available: () => handle.replay.state().on,
    execute: (arg) => {
      const speed = Number(arg)
      if ((REPLAY_SPEEDS as readonly number[]).includes(speed)) handle.replay.setSpeed(speed as (typeof REPLAY_SPEEDS)[number])
    },
  })

  // ── Timeframe and range presets. The grammar and the preset registries are the chart's own
  // timeframe module, which lands beside this one; the two ids exist now so a host binding a
  // toolbar or an operator adapter binds the same names it will keep.
  add({
    id: 'chart.timeframe.set',
    scope: 'chart',
    label: 'command.timeframeSet',
    available: always,
    execute: (arg) => {
      if (typeof arg === 'string' && arg) handle.setTimeframe(arg)
    },
  })
  add({
    id: 'chart.range.set',
    scope: 'chart',
    label: 'command.rangeSet',
    available: () => handle.visibleRange() !== null,
    execute: (arg) => {
      // A preset resolves to a window; until the preset registry lands, an explicit window is what
      // this takes, and a preset token is refused rather than guessed at.
      if (arg && typeof arg === 'object' && 'from' in arg && 'to' in arg) {
        const range = arg as { from: unknown; to: unknown }
        if (typeof range.from === 'number' && typeof range.to === 'number') handle.setVisibleRange({ from: range.from, to: range.to })
      }
    },
  })
  add({
    id: 'chart.timezone.set',
    scope: 'chart',
    label: 'command.timezoneSet',
    available: always,
    execute: (arg) => {
      if (arg === null || typeof arg === 'string') handle.setTimezone(arg)
    },
  })

  return () => {
    for (const unregister of unregisters) unregister()
    unregisters.length = 0
  }
}

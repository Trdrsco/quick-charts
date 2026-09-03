// Every built-in chart verb, registered as a command.
//
// This file is the reason the command registry can claim to be the ONE source. A verb that exists
// only as a method on the handle would be reachable from code but not from a menu, a shortcut or an
// operator; a verb that exists only as a menu row would be reachable from the glass but not from a
// host. Registering them here makes those the same list, so `features` and `access` filter every
// door at once.
//
// Availability is a live read, never a stored flag: a command asks the chart what is true now.
import type { ChartMessageKey, ChartTranslate } from '../i18n'
import { SCALE_MODES, type ScaleMode } from '../scaleMode'
import type { PriceFormatter } from '../priceFormatter'
import type { CommandRegistry, CommandSpec } from './commands'
import type { ChartHandle } from './chart'
import type { DrawingVerbs } from './drawings'
import type { PlacedImage } from '../drawings'
import { CURSOR_MODES, type CursorMode, type HideState, type MagnetMode, type VisibilityPreset } from '../drawings/index'
import type { Capabilities, IndicatorInstance } from './options'
import type { ComparePlacement } from '../compare'
import type { ResolvedFeatures } from './planes'
import { CHART_STYLES, type ChartStyleId } from './styles'
import { REPLAY_SPEEDS } from '../replay'
import { allowedTimeframes, TIMEFRAME_PRESETS, timeframeLabel } from '../timeframe'
import { rangeAvailable, RANGE_PRESETS, type RangePreset } from '../ranges'
import { isTimezoneChoice, TIMEZONES, EXCHANGE_TIMEZONE } from '../timezones'

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
  /** The chart's language, for the preset labels a picker renders. */
  t(): ChartTranslate
  /** The oldest loaded bar, which decides whether a range preset has data to frame. */
  earliestBar(): number | null
  /** Frame a range preset through the chart's own rule. */
  frame(preset: RangePreset): void
  /** One zoom or scroll step, by the chart's own step rules. */
  zoom(direction: 'in' | 'out'): void
  scroll(direction: 'left' | 'right'): void
  /** The level the open menu was raised at, which copy-price acts on. */
  level(): number | null
  formatter(): PriceFormatter
  compareOpen(mode: 'compare' | 'change-symbol', changeFrom?: string): void
  /** The drawing verbs above the layer (preferences, the eye, favorites, templates, the dialogs);
   *  null with the drawings feature off. */
  drawingVerbs(): DrawingVerbs | null
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

  // ── The symbol. One setter taking the symbol, so the search dialog, a host toolbar and an
  // operator adapter all change the market through the same door.
  add({
    id: 'chart.symbol.set',
    scope: 'chart',
    label: 'command.symbolSet',
    available: always,
    execute: (arg) => {
      if (typeof arg === 'string' && arg) handle.setSymbol(arg)
    },
  })

  // ── View and navigation ─────────────────────────────────────────────────────────────────────
  add({ id: 'chart.view.reset', scope: 'chart', label: 'command.viewReset', shortcut: 'Alt+KeyR', available: always, execute: () => handle.reset() })
  add({ id: 'chart.view.goLive', scope: 'chart', label: 'command.viewGoLive', shortcut: 'Alt+KeyL', available: always, execute: () => handle.goLive() })
  // Zoom and scroll are the chart's own step rules, so a keyboard, a button and a host call all
  // move by exactly the same amount and stop at the same floor.
  add({ id: 'chart.view.zoomIn', scope: 'chart', label: 'command.viewZoomIn', shortcut: 'Equal', available: always, execute: () => deps.zoom('in') })
  add({ id: 'chart.view.zoomOut', scope: 'chart', label: 'command.viewZoomOut', shortcut: 'Minus', available: always, execute: () => deps.zoom('out') })
  add({ id: 'chart.view.scrollLeft', scope: 'chart', label: 'command.viewScrollLeft', shortcut: 'ArrowLeft', available: always, execute: () => deps.scroll('left') })
  add({ id: 'chart.view.scrollRight', scope: 'chart', label: 'command.viewScrollRight', shortcut: 'ArrowRight', available: always, execute: () => deps.scroll('right') })

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

  // ── Appearance. One command taking an appearance partial: the settings menu, a host control and
  // an operator adapter all restyle the chart through the same runtime layer.
  add({
    id: 'chart.appearance.apply',
    scope: 'chart',
    label: 'command.appearanceApply',
    available: always,
    execute: (arg) => {
      const partial = arg as { appearance?: unknown } | null
      if (partial && typeof partial === 'object' && partial.appearance && typeof partial.appearance === 'object') {
        handle.applyAppearance({ appearance: partial.appearance as Partial<ReturnType<ChartHandle['appearance']>['appearance']> })
      }
    },
  })

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
  // Adding and updating take the whole instance: the picker composes one from a definition, and
  // the settings dialog hands back the instance with its inputs and overrides changed. The access
  // policy's indicator predicate is asked inside the plane, so a refused id is refused here too.
  const isInstance = (arg: unknown): arg is IndicatorInstance =>
    !!arg && typeof arg === 'object' && typeof (arg as IndicatorInstance).id === 'string' && typeof (arg as IndicatorInstance).definition === 'object'
  add({
    id: 'chart.indicators.add',
    scope: 'chart',
    label: 'command.indicatorAdd',
    available: always,
    execute: (arg) => {
      if (isInstance(arg)) handle.indicators.add(arg)
    },
  })
  add({
    id: 'chart.indicators.update',
    scope: 'chart',
    label: 'command.indicatorUpdate',
    available: () => handle.indicators.get().length > 0,
    execute: (arg) => {
      if (!isInstance(arg)) return
      const current = handle.indicators.get()
      if (!current.some((i) => i.id === arg.id)) return
      handle.indicators.set(current.map((i) => (i.id === arg.id ? arg : i)))
    },
  })
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
  // Every verb the drawing toolbar, the settings bar and the settings dialog run. The layer's own
  // verbs act on `handle.drawings`; the verbs above the layer (preferences, the eye, favorites,
  // templates, the dialogs) act through `deps.drawingVerbs()`. Both are unavailable with the
  // drawings feature off, and a selection verb is unavailable without a selection.
  const drawings = (): ChartHandle['drawings'] => (features.drawings ? handle.drawings : null)
  const verbs = (): DrawingVerbs | null => (features.drawings ? deps.drawingVerbs() : null)
  const withSelection = (): boolean => drawings()?.hasSelection() ?? false
  const on = (): boolean => features.drawings && drawings() !== null
  const isHideState = (arg: unknown): arg is HideState =>
    !!arg && typeof arg === 'object' && typeof (arg as HideState).on === 'boolean' && ['drawings', 'indicators', 'all'].includes((arg as HideState).mode)
  /** The tool an arm argument names: the id itself, or the `tool` of a seeded placement. */
  const toolOf = (arg: unknown): string | null | undefined =>
    arg === null || typeof arg === 'string' ? arg : arg && typeof arg === 'object' && typeof (arg as { tool?: unknown }).tool === 'string' ? (arg as { tool: string }).tool : undefined
  const isPlacedImage = (arg: unknown): arg is PlacedImage =>
    !!arg && typeof arg === 'object' && typeof (arg as PlacedImage).dataUrl === 'string' && typeof (arg as PlacedImage).width === 'number' && typeof (arg as PlacedImage).height === 'number'

  add({
    id: 'chart.drawings.removeAll',
    scope: 'chart',
    label: 'command.drawingsRemoveAll',
    available: () => (drawings()?.count() ?? 0) > 0,
    // The argument is the locked-item policy: true takes locked drawings too.
    execute: (arg) => drawings()?.clearAll(arg === true),
  })
  add({
    id: 'chart.drawings.deleteSelected',
    scope: 'chart',
    label: 'command.drawingDeleteSelected',
    shortcut: 'Delete',
    available: withSelection,
    execute: () => drawings()?.deleteSelected(),
  })
  // Escape disarms the armed tool, cancels a placement, and closes an inline text edit. The drawing
  // layer owns the gesture; the registry is how a key reaches it, so a host that forbids the verb
  // disables the key with it.
  add({
    id: 'chart.drawings.cancel',
    scope: 'chart',
    label: 'command.drawingCancel',
    shortcut: 'Escape',
    available: () => on() && (drawings()!.activeTool() != null || (verbs()?.editing() ?? false)),
    execute: () => drawings()?.armTool(null),
  })
  // Arming a tool is ONE command taking the tool id (or `{ tool, props }` to seed the placement,
  // as a picked glyph does): the ninety registered tools would otherwise be ninety near-identical
  // entries, and the access policy refuses per tool through `refuses`, so a refused tool answers
  // `denied` from this door as a refused command does.
  add({
    id: 'chart.drawings.arm',
    scope: 'chart',
    label: 'command.drawingArm',
    available: on,
    refuses: (arg) => {
      const tool = toolOf(arg)
      return typeof tool === 'string' && !(verbs()?.toolPermitted(tool) ?? true)
    },
    execute: (arg) => verbs()?.arm(arg),
  })
  // An image is placed whole, from the picker or a system-clipboard paste over the chart; the
  // command exists only with an asset port to read the picture and the image tool permitted.
  add({
    id: 'chart.drawings.placeImage',
    scope: 'chart',
    label: 'command.drawingPlaceImage',
    available: () => on() && (verbs()?.canPlaceImage() ?? false),
    execute: (arg) => {
      if (isPlacedImage(arg)) verbs()?.placeImage(arg)
    },
  })
  add({
    id: 'chart.drawings.cursor',
    scope: 'chart',
    label: 'command.drawingCursor',
    available: on,
    execute: (arg) => {
      if (typeof arg === 'string' && (CURSOR_MODES as readonly string[]).includes(arg)) verbs()?.setCursor(arg as CursorMode)
    },
  })
  add({
    id: 'chart.drawings.magnet',
    scope: 'chart',
    label: 'command.drawingMagnet',
    available: on,
    execute: (arg) => {
      if (arg === 'off' || arg === 'weak' || arg === 'strong') verbs()?.setMagnet(arg as MagnetMode)
    },
  })
  add({ id: 'chart.drawings.stayInMode', scope: 'chart', label: 'command.drawingStayInMode', available: on, execute: (arg) => verbs()?.setStayInMode(arg === true) })
  add({ id: 'chart.drawings.lockAll', scope: 'chart', label: 'command.drawingLockAll', available: on, execute: (arg) => verbs()?.setLockAll(arg === true) })
  add({
    id: 'chart.drawings.hide',
    scope: 'chart',
    label: 'command.drawingHide',
    available: on,
    execute: (arg) => {
      if (isHideState(arg)) verbs()?.setHide(arg)
    },
  })
  add({ id: 'chart.drawings.sync', scope: 'chart', label: 'command.drawingSync', available: on, execute: (arg) => verbs()?.setSync(arg === true) })
  add({ id: 'chart.drawings.removeLockedPolicy', scope: 'chart', label: 'command.drawingRemoveLockedPolicy', available: on, execute: (arg) => verbs()?.setRemoveLocked(arg === true) })
  add({
    id: 'chart.drawings.favorite',
    scope: 'chart',
    label: 'command.drawingFavorite',
    available: on,
    execute: (arg) => {
      if (typeof arg === 'string') verbs()?.toggleFavorite(arg)
    },
  })
  add({ id: 'chart.drawings.favoritesBar', scope: 'chart', label: 'command.drawingFavoritesBar', available: on, execute: (arg) => verbs()?.setFavoritesBar(arg === true) })
  // The selection's own verbs.
  add({
    id: 'chart.drawings.style',
    scope: 'chart',
    label: 'command.drawingStyle',
    available: withSelection,
    execute: (arg) => {
      if (arg && typeof arg === 'object') drawings()?.updateStyle(arg as Record<string, never>)
    },
  })
  add({
    id: 'chart.drawings.props',
    scope: 'chart',
    label: 'command.drawingProps',
    available: withSelection,
    execute: (arg) => {
      if (arg && typeof arg === 'object') drawings()?.updateProps(arg as Record<string, unknown>)
    },
  })
  add({ id: 'chart.drawings.lock', scope: 'chart', label: 'command.drawingLock', available: withSelection, execute: (arg) => drawings()?.setLocked(arg === true) })
  add({ id: 'chart.drawings.clone', scope: 'chart', label: 'command.drawingClone', available: withSelection, execute: () => drawings()?.clone() })
  add({ id: 'chart.drawings.copy', scope: 'chart', label: 'command.drawingCopy', shortcut: 'Ctrl+KeyC', available: withSelection, execute: () => drawings()?.copy() })
  add({ id: 'chart.drawings.paste', scope: 'chart', label: 'command.drawingPaste', shortcut: 'Ctrl+KeyV', available: () => on() && drawings()!.canPaste(), execute: () => void drawings()?.paste() })
  add({ id: 'chart.drawings.bringToFront', scope: 'chart', label: 'command.drawingBringToFront', available: withSelection, execute: () => drawings()?.bringToFront() })
  add({ id: 'chart.drawings.sendToBack', scope: 'chart', label: 'command.drawingSendToBack', available: withSelection, execute: () => drawings()?.sendToBack() })
  add({ id: 'chart.drawings.bringForward', scope: 'chart', label: 'command.drawingBringForward', available: withSelection, execute: () => drawings()?.bringForward() })
  add({ id: 'chart.drawings.sendBackward', scope: 'chart', label: 'command.drawingSendBackward', available: withSelection, execute: () => drawings()?.sendBackward() })
  add({ id: 'chart.drawings.hideSelected', scope: 'chart', label: 'command.drawingHideSelected', available: withSelection, execute: () => drawings()?.hideSelected() })
  add({
    id: 'chart.drawings.visibility',
    scope: 'chart',
    label: 'command.drawingVisibility',
    available: withSelection,
    execute: (arg) => {
      if (arg === 'current-and-above' || arg === 'current-and-below' || arg === 'current-only' || arg === 'all') drawings()?.setVisibilityPreset(arg as VisibilityPreset)
    },
  })
  add({ id: 'chart.drawings.settings', scope: 'chart', label: 'command.drawingSettings', available: withSelection, execute: () => verbs()?.openSettings() })
  add({ id: 'chart.drawings.commitEdit', scope: 'chart', label: 'command.drawingCommitEdit', available: withSelection, execute: () => verbs()?.commitEdit() })
  add({
    id: 'chart.drawings.template.apply',
    scope: 'chart',
    label: 'command.drawingTemplateApply',
    available: withSelection,
    execute: (arg) => {
      if (arg === null || typeof arg === 'string') verbs()?.applyTemplate(arg)
    },
  })
  add({
    id: 'chart.drawings.template.save',
    scope: 'chart',
    label: 'command.drawingTemplateSave',
    available: withSelection,
    execute: (arg) => {
      if (typeof arg === 'string' && arg.trim()) verbs()?.saveTemplate(arg.trim())
    },
  })
  add({
    id: 'chart.drawings.template.remove',
    scope: 'chart',
    label: 'command.drawingTemplateRemove',
    available: withSelection,
    execute: (arg) => {
      if (typeof arg === 'string') verbs()?.removeTemplate(arg)
    },
  })
  add({ id: 'chart.drawings.tableAddRow', scope: 'chart', label: 'command.drawingTableAddRow', available: () => drawings()?.selected()?.hasCells ?? false, execute: () => verbs()?.tableAddRow() })
  add({ id: 'chart.drawings.tableAddColumn', scope: 'chart', label: 'command.drawingTableAddColumn', available: () => drawings()?.selected()?.hasCells ?? false, execute: () => verbs()?.tableAddColumn() })
  // ── Compare ─────────────────────────────────────────────────────────────────────────────────
  add({
    id: 'chart.compare.open',
    scope: 'chart',
    label: 'command.compareOpen',
    available: () => features.compare && deps.capabilities().search,
    execute: () => deps.compareOpen('compare'),
  })
  // A symbol alone adds on the shared scale; a `{ symbol, placement }` names the placement.
  const PLACEMENTS: readonly ComparePlacement[] = ['same-percent', 'new-scale', 'new-pane']
  add({
    id: 'chart.compare.add',
    scope: 'chart',
    label: 'command.compareAdd',
    available: () => features.compare,
    execute: (arg) => {
      if (typeof arg === 'string') {
        handle.compare.add(arg, { placement: 'same-percent' })
        return
      }
      const at = arg as { symbol?: unknown; placement?: unknown } | null
      if (!at || typeof at.symbol !== 'string') return
      const placement = PLACEMENTS.includes(at.placement as ComparePlacement) ? (at.placement as ComparePlacement) : 'same-percent'
      handle.compare.add(at.symbol, { placement })
    },
  })
  add({
    id: 'chart.compare.setVisible',
    scope: 'chart',
    label: 'command.compareVisible',
    available: () => features.compare && handle.compare.list().length > 0,
    execute: (arg) => {
      const at = arg as { symbol?: unknown; visible?: unknown } | null
      if (at && typeof at.symbol === 'string' && typeof at.visible === 'boolean') handle.compare.setVisible(at.symbol, at.visible)
    },
  })
  add({
    id: 'chart.compare.changeSymbol',
    scope: 'chart',
    label: 'command.compareChangeSymbol',
    available: () => features.compare && deps.capabilities().search,
    execute: (arg) => {
      if (typeof arg === 'string') deps.compareOpen('change-symbol', arg)
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
  // Start takes an optional moment (epoch seconds): the bar picked on the chart or the date picked
  // in the dialog. Without one, replay opens three quarters through the loaded window.
  add({
    id: 'chart.replay.start',
    scope: 'chart',
    label: 'command.replayStart',
    available: () => features.replay && !handle.replay.state().on,
    execute: (arg) => handle.replay.start(typeof arg === 'number' && Number.isFinite(arg) ? arg : undefined),
  })
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
  add({
    id: 'chart.replay.setInterval',
    scope: 'chart',
    label: 'command.replayInterval',
    available: () => handle.replay.state().on,
    execute: (arg) => {
      if (typeof arg === 'string' && arg) handle.replay.setInterval(arg)
    },
  })

  // ── Timeframe and range presets. The grammar and the preset registries are the chart's own
  // timeframe module, which lands beside this one; the two ids exist now so a host binding a
  // toolbar or an operator adapter binds the same names it will keep.
  // One command per preset token, plus the open-ended setter a custom interval uses. Availability
  // is the intersection the capability plane already knows: a token the feed or the symbol cannot
  // serve is refused here rather than sent and rejected.
  const servable = (token: string): boolean => {
    const caps = deps.capabilities()
    return (
      allowedTimeframes([token], {
        supportedResolutions: caps.symbolResolutions ?? [],
        resolutions: caps.resolutions ?? [],
      }).length > 0
    )
  }
  for (const group of TIMEFRAME_PRESETS) {
    for (const token of group.tokens) {
      add({
        id: `chart.timeframe.${token}`,
        scope: 'chart',
        label: 'command.timeframeSet',
        labelText: timeframeLabel(deps.t(), token),
        available: () => handle.timeframe() !== token && servable(token),
        execute: () => handle.setTimeframe(token),
      })
    }
  }
  add({
    id: 'chart.timeframe.set',
    scope: 'chart',
    label: 'command.timeframeSet',
    available: always,
    execute: (arg) => {
      if (typeof arg === 'string' && arg && servable(arg)) handle.setTimeframe(arg)
    },
  })
  // One command per range preset. A preset whose span reaches further back than the chart holds is
  // unavailable rather than framed onto data that is not there.
  const presetByKey = new Map<string, RangePreset>(RANGE_PRESETS.map((preset) => [preset.key, preset]))
  const framePreset = (preset: RangePreset): void => deps.frame(preset)
  for (const preset of RANGE_PRESETS) {
    add({
      // The preset's key IS its chip's text and stays as written in every language, so it is the
      // command id too; the tooltip's words are the catalog's.
      id: `chart.range.${preset.key}`,
      scope: 'chart',
      label: preset.label,
      labelText: preset.key,
      available: () => rangeAvailable(preset, deps.earliestBar()),
      execute: () => framePreset(preset),
    })
  }
  add({
    id: 'chart.range.set',
    scope: 'chart',
    label: 'command.rangeSet',
    available: () => handle.visibleRange() !== null,
    execute: (arg) => {
      // A preset id frames through the chart's own rule; an explicit window is set as given.
      if (typeof arg === 'string') {
        const preset = presetByKey.get(arg)
        if (preset && rangeAvailable(preset, deps.earliestBar())) framePreset(preset)
        return
      }
      if (arg && typeof arg === 'object' && 'from' in arg && 'to' in arg) {
        const range = arg as { from: unknown; to: unknown }
        if (typeof range.from === 'number' && typeof range.to === 'number') handle.setVisibleRange({ from: range.from, to: range.to })
      }
    },
  })
  for (const zone of TIMEZONES) {
    add({
      id: `chart.timezone.${zone.id}`,
      scope: 'chart',
      label: 'command.timezoneSet',
      labelText: zone.city,
      available: () => handle.timezone() !== zone.id,
      execute: () => handle.setTimezone(zone.id),
    })
  }
  add({
    id: 'chart.timezone.exchange',
    scope: 'chart',
    label: 'command.timezoneSet',
    available: () => handle.timezone() !== EXCHANGE_TIMEZONE,
    execute: () => handle.setTimezone(EXCHANGE_TIMEZONE),
  })
  add({
    id: 'chart.timezone.set',
    scope: 'chart',
    label: 'command.timezoneSet',
    available: always,
    execute: (arg) => {
      if (typeof arg === 'string' && isTimezoneChoice(arg)) handle.setTimezone(arg)
    },
  })

  // ── The subsession intraday bars are shown for. Offered only where the symbol has one to
  // choose, which is what `hasExtendedHours` answers.
  add({
    id: 'chart.subsession.regular',
    scope: 'chart',
    label: 'command.subsessionRegular',
    available: () => handle.hasExtendedHours() && handle.subsession() !== 'regular',
    execute: () => handle.setSubsession('regular'),
  })
  add({
    id: 'chart.subsession.extended',
    scope: 'chart',
    label: 'command.subsessionExtended',
    available: () => handle.hasExtendedHours() && handle.subsession() !== 'extended',
    execute: () => handle.setSubsession('extended'),
  })

  return () => {
    for (const unregister of unregisters) unregister()
    unregisters.length = 0
  }
}

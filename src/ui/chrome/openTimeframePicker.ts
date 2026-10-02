// The timeframe picker a page opens on its own, away from any chart: a backtester's timeframe
// field, an alert's timeframe. It is the same grouped list the chart's timeframe caret drops, built
// by the same code over the same presets, groups, labels and custom composer, so a timeframe reads
// here exactly as it reads once it is on a chart. It acts on nothing: it hands the pick back.
//
// Two frames: a drop-down under a control the page owns, and a bare card inside a box the page
// owns, which is how a phone shows it. Both bring their own painted element, because neither has a
// widget to live in. The host supplies the value, and anything else it already gives a chart: the
// offered timeframes, what its feed and symbol serve, the mode, the language and the glyphs.
//
// It carries no saved chips and no stars: those are the viewer's quick-select row on a chart, kept
// by the chart's storage, and a field that asks for one timeframe has no row to put them in. A
// composed custom timeframe is handed back like a row's pick and is not kept.
import { createChartI18n, readingDirection, type ChartI18n } from '../../i18n'
import { createThemeController, type ThemeControllerOptions } from '../../theme/controller'
import { parseTimeframe, TIMEFRAME_PRESET_TOKENS, timeframeAllowed, type TimeframeRestrictions, type TimeframeUnit } from '../../timeframe'
import { paintThemeRoot } from '../../widget/theme'
import { resolveOfferedTimeframes, type OfferedTimeframes } from '../../widget/timeframes'
import type { ChartIcons } from '../icons/catalog'
import { createIconDiagnostics } from '../icons/draw'
import { createIconResolver, type IconResolver } from '../icons/resolver'
import { armRoving, h, items, roveFocus } from './dom'
import { FLYOUT_WIDTH } from './flyoutGeometry'
import { openMenu } from './menu'
import { buildTimeframeComposer, buildTimeframeRows, composesTimeframes, focusCheckedTimeframe, type TimeframeListModel } from './timeframePicker'

export interface TimeframePickerOptions {
  /** Where the picked timeframe goes. The drop-down closes on the pick. */
  onPick(timeframe: string): void
  /** The timeframe the list opens on, checked: the page's current value. Absent, no row is checked.
   *  It must be one the list offers. */
  timeframe?: string
  /** The timeframes the list offers, as a chart's `timeframes` names them: any tokens the grammar
   *  reads, in any order, drawn smallest first in their units' groups, with no composer. */
  timeframes?: readonly string[]
  /** Whether the list offers composing a custom timeframe, as a chart's `customTimeframes` says.
   *  Default true; `false` offers the presets alone. */
  customTimeframes?: boolean
  /** The resolutions the feed serves, as a feed's `config()` declares them. A timeframe outside
   *  them is left out of the list, as the chart's list leaves it out, and is never composed. */
  resolutions?: readonly string[] | null
  /** The resolutions the symbol serves, as its `supportedResolutions` declares them, with the same
   *  effect. */
  supportedResolutions?: readonly string[] | null
  /** The element the drop-down's layer mounts in. Default: the document body, where the list stands
   *  over the page rather than inside whatever box opened it. */
  container?: HTMLElement
  /** Mode and palettes, as a chart takes them. Default: dark. */
  theme?: ThemeControllerOptions
  /** The language, as a chart takes it. */
  locale?: string
  /** A prepared runtime, when the page already has the chart's. It wins over `locale`. */
  i18n?: ChartI18n
  /** The host's drawings for the list's glyphs, as a chart takes them. */
  icons?: ChartIcons
  /** Called once the list is gone, however it went. */
  onClose?(): void
}

export interface TimeframePickerHandle {
  /** Close it from the outside. Closing twice is safe, and the list's own close is the same door. */
  close(): void
}

/** The options both frames check before anything mounts, read into what the shared list takes. */
interface ResolvedPicker {
  offered: OfferedTimeframes
  restrictions: TimeframeRestrictions
  timeframe: string | null
}

const restriction = (name: string, value: unknown): readonly string[] | null => {
  if (value === undefined || value === null) return null
  if (!Array.isArray(value) || value.some((token) => typeof token !== 'string')) throw new TypeError(`${name} must be a list of timeframe tokens`)
  return value as readonly string[]
}

/** Validate the options as `createChart` validates its own: an empty list, a token the grammar
 *  cannot read, a repeated token, `customTimeframes: true` beside a list, and an opening timeframe
 *  outside the offered set are setup errors, as is an opening timeframe the grammar cannot read. */
function resolvePicker(options: TimeframePickerOptions): ResolvedPicker {
  const offered = resolveOfferedTimeframes(options.timeframes, options.customTimeframes, [{ name: 'timeframe', token: options.timeframe }])
  if (options.timeframe !== undefined && (typeof options.timeframe !== 'string' || parseTimeframe(options.timeframe) === null)) {
    throw new TypeError(`timeframe ${JSON.stringify(options.timeframe)} is not a timeframe token`)
  }
  return {
    offered,
    restrictions: { resolutions: restriction('resolutions', options.resolutions), supportedResolutions: restriction('supportedResolutions', options.supportedResolutions) },
    timeframe: options.timeframe ?? null,
  }
}

/** The page's list: its value checked, every offered row it serves, a pick handed back. A custom
 *  value the presets do not carry sits in its unit's group, so the list always shows what the
 *  field holds. */
function pickerModel(resolved: ResolvedPicker, i18n: ChartI18n, icons: IconResolver, choose: (token: string) => void): TimeframeListModel {
  const { offered, restrictions, timeframe } = resolved
  const custom = timeframe !== null && offered.list === null && offered.custom && !TIMEFRAME_PRESET_TOKENS.has(timeframe) ? [timeframe] : []
  return {
    i18n,
    icons,
    offered,
    active: () => timeframe,
    custom: () => custom,
    restrictions: () => restrictions,
    available: (token) => timeframeAllowed(token, restrictions),
    listed: () => true,
    choose,
    addCustom: () => true,
    composable: (token) => timeframeAllowed(token, restrictions),
    collapsed: new Set<TimeframeUnit>(),
  }
}

const iconsFor = (options: TimeframePickerOptions, i18n: ChartI18n): IconResolver =>
  createIconResolver({ icons: options.icons, document, direction: () => readingDirection(i18n), diagnostics: createIconDiagnostics() })

/** Drop the chart's timeframe list from a control the page owns, with no chart behind it. */
export function openTimeframePicker(options: TimeframePickerOptions & { anchor: HTMLElement }): TimeframePickerHandle {
  const resolved = resolvePicker(options)
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

  let gone = false
  const teardown = (): void => {
    if (gone) return
    gone = true
    layer.remove()
    options.onClose?.()
  }

  // One model for the list's lifetime, so a group the reader collapsed stays collapsed through a
  // redraw. A pick reaches it only once the list is open.
  let close: () => void = () => undefined
  const model = pickerModel(resolved, i18n, iconsFor(options, i18n), (token) => {
    options.onPick(token)
    close()
  })
  const menu = openMenu({
    host: overlays,
    anchor: options.anchor,
    label: i18n.t('timeframe.title'),
    className: 'qc-tf-menu',
    width: FLYOUT_WIDTH.timeframe,
    build(body, handle) {
      close = () => handle.close()
      buildTimeframeRows(body, model, () => handle.refresh())
    },
    ...(composesTimeframes(resolved.offered)
      ? {
          footer(foot: HTMLElement) {
            foot.appendChild(buildTimeframeComposer(model))
          },
        }
      : {}),
    initialIndex: 0,
    onClose: teardown,
  })
  // Open on the checked row, as the chart's list does.
  focusCheckedTimeframe(menu.element)

  return {
    close() {
      menu.close()
      teardown()
    },
  }
}

export interface MountedTimeframePicker {
  /** The element the list was built into, for a page that measures or animates its own box. */
  element: HTMLElement
  /** Put focus on the checked row, or the first, for a page whose box has just opened. */
  focus(): void
  /** Take it down: the element goes. */
  dispose(): void
}

/** The same list with no drop-down around it, built into a box the page owns and positions: a
 *  phone's card, a panel in a page's own chrome. The page decides where it stands and when it goes;
 *  picking hands the timeframe back, then calls `onClose`, which is the page's cue to close its box. */
export function mountTimeframePicker(options: TimeframePickerOptions & { container: HTMLElement }): MountedTimeframePicker {
  const resolved = resolvePicker(options)
  const i18n = options.i18n ?? createChartI18n(options.locale)
  const theme = createThemeController(options.theme)
  const element = document.createElement('div')
  element.className = 'qc-tf-card'
  paintThemeRoot(element, theme.mode(), theme.get())
  element.setAttribute('dir', readingDirection(i18n))
  const panel = h('div', { class: 'qc-tf-menu', role: 'menu', 'aria-label': i18n.t('timeframe.title') })
  const body = h('div', { class: 'qc-menu-body' })
  const foot = composesTimeframes(resolved.offered) ? h('div', { class: 'qc-menu-footer' }) : null
  panel.append(body, ...(foot ? [foot] : []))
  element.appendChild(panel)
  options.container.appendChild(element)

  const icons = iconsFor(options, i18n)
  const model = pickerModel(resolved, i18n, icons, (token) => {
    options.onPick(token)
    options.onClose?.()
  })
  /** Draw the rows and the composer again, keeping focus on the row at the same index. */
  const draw = (): void => {
    const current = items(panel).indexOf(document.activeElement as HTMLElement)
    body.replaceChildren()
    buildTimeframeRows(body, model, draw)
    if (foot) foot.replaceChildren(buildTimeframeComposer(model))
    const list = items(panel)
    const checked = list.findIndex((el) => el.getAttribute('aria-checked') === 'true')
    armRoving(panel, current >= 0 ? Math.min(current, list.length - 1) : Math.max(0, checked))
    if (current >= 0) list[Math.min(current, list.length - 1)]?.focus()
  }
  // The rows rove as the drop-down's do: arrows, Home and End, with a text field keeping its own.
  panel.addEventListener('keydown', (event) => {
    const target = event.target as HTMLElement | null
    const typing = target instanceof HTMLInputElement && target.type !== 'checkbox' && target.type !== 'radio'
    if (typing && (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End')) return
    if (roveFocus(panel, event, 'both')) {
      event.preventDefault()
      event.stopPropagation()
    }
  })
  draw()

  let gone = false
  return {
    element,
    focus() {
      const list = items(panel)
      const checked = list.findIndex((el) => el.getAttribute('aria-checked') === 'true')
      list[Math.max(0, checked)]?.focus()
    },
    dispose() {
      if (gone) return
      gone = true
      element.remove()
    },
  }
}

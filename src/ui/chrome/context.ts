// What every chrome surface is handed: the language, the one command registry, the overlay host
// its menus and dialogs mount into, the widget it reads state from, and the icon resolver every
// glyph it draws goes through. A surface never receives
// a chart plane, a store or a renderer object: it reads the public handle and speaks through the
// registry, which is what makes the chrome a consumer of the widget rather than a part of it.
import type { ChartI18n, ChartMessageKey } from '../../i18n'
import type { CommandRegistry } from '../../widget/commands'
import type { ChartWidget } from '../../widget/create'
import type { ChartHandle } from '../../widget/chart'
import type { IconResolver } from '../icons/resolver'
import type { OfferedChartStyles } from '../../widget/styles'
import type { OfferedTimeframes } from '../../widget/timeframes'
import type { OfferedLayouts } from '../../widget/arrangements'
import type { OfferedIndicators } from '../../widget/offeredIndicators'
import type { OfferedRanges } from '../../widget/offeredRanges'
import type { OfferedTimezones } from '../../widget/offeredTimezones'
import type { AccessPolicy } from '../../widget/options'
import { commandShown } from '../../widget/access'

export interface ChromeContext {
  i18n: ChartI18n
  commands: CommandRegistry
  /** Where menus and dialogs mount: a widget-level layer inside the root, so the scoped
   *  stylesheet reaches them and they stack above every chart. */
  overlays: HTMLElement
  widget: ChartWidget
  /** Draws every glyph: the host's drawing for its icon, or the chart's own. */
  icons: IconResolver
  /** The main-series styles the widget offers, which are the style picker's rows. */
  styles: OfferedChartStyles
  /** The timeframes the widget offers, which bound the timeframe picker's chips and rows and the
   *  interval a range preset reads at. */
  timeframes: OfferedTimeframes
  /** The arrangements and sync switches the widget offers, which are the layout setup menu's tiles
   *  and switches. */
  layouts: OfferedLayouts
  /** The host's access policy. The registry already refuses what it refuses; the chrome reads it
   *  only to know whether a refused control is drawn disabled or left out. */
  access?: AccessPolicy
  /** The built-in indicators the widget offers, or null (or absent) for every built-in: the ones
   *  the indicator browser lists. */
  builtInIndicators?: OfferedIndicators
  /** The range presets the widget offers, in the order the bottom bar draws them, or absent for
   *  every preset. */
  ranges?: OfferedRanges
  /** The display timezones the widget offers, or null (or absent) for every choice: the timezone
   *  picker's rows. */
  timezones?: OfferedTimezones
}

/** Whether the chrome draws a control or a menu row for this command. Every one is drawn unless
 *  the policy refuses the command and the host hides what it refuses; a permitted command that
 *  cannot run now is drawn disabled, as before. */
export const shows = (ctx: ChromeContext, id: string): boolean => commandShown(ctx.access, id)

/** The chart the chrome acts on: the active one. */
export const activeChart = (ctx: ChromeContext): ChartHandle => ctx.widget.activeChart()

/** A command's name in the chart's language: its literal text when it carries one (a host
 *  contribution, a preset token), else its catalog label. Empty for an id the registry does not
 *  hold, so a control never invents a word. */
export function commandLabel(ctx: ChromeContext, id: string): string {
  const spec = ctx.commands.list().find((s) => s.id === id)
  if (!spec) return ''
  return spec.labelText ?? ctx.i18n.t(spec.label as ChartMessageKey)
}

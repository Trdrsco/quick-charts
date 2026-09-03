// What every chrome surface is handed: the language, the one command registry, the overlay host
// its menus and dialogs mount into, and the widget it reads state from. A surface never receives
// a chart plane, a store or a renderer object: it reads the public handle and speaks through the
// registry, which is what makes the chrome a consumer of the widget rather than a part of it.
import type { ChartI18n, ChartMessageKey } from '../../i18n'
import type { CommandRegistry } from '../../widget/commands'
import type { ChartWidget } from '../../widget/create'
import type { ChartHandle } from '../../widget/chart'

export interface ChromeContext {
  i18n: ChartI18n
  commands: CommandRegistry
  /** Where menus and dialogs mount: a widget-level layer inside the root, so the scoped
   *  stylesheet reaches them and they stack above every chart. */
  overlays: HTMLElement
  widget: ChartWidget
}

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

/** Run a command and answer whether it ran. A refusal of any kind is false; the control that asked
 *  reflects `available` already, so a false here is a race rather than a surprise. */
export function run(ctx: ChromeContext, id: string, arg?: unknown): boolean {
  return ctx.commands.execute(id, arg).kind === 'ok'
}

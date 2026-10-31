// The menu the corner of the price scale opens: the scale's framing, its mode, its side, what it
// labels and which lines it draws, and the door to the rest of its settings. The rows are read from
// the chart each time the menu is raised, and each runs through the command registry, so a row and
// its key refuse or act alike.
import type { ScaleMenuRow } from '../contextMenuUi'
import type { ChartTranslate } from '../i18n'
import type { ScaleMode } from '../scaleMode'
import type { ChartSettings, PartialChartSettings } from '../settings/schema'
import type { CommandRegistry } from './commands'

export interface ScaleMenuDeps {
  t: ChartTranslate
  commands: CommandRegistry
  /** The settings the chart stands on. */
  settings(): ChartSettings
  scaleMode(): ScaleMode
  /** Whether the scale frames itself. */
  autoScale(): boolean
  /** The side of the plot the scale stands on. */
  side(): 'left' | 'right'
  /** The price-to-bar ratio the chart shows, or null where it holds none. */
  ratio(): number | null
  /** Whether the symbol trades outside its regular hours. */
  extendedHours(): boolean
  /** A command's key as a row prints it, or null while it has none. */
  shortcut(command: string): string | null
}

/** The menu's groups, top to bottom. */
export function scaleMenuGroups(deps: ScaleMenuDeps): ScaleMenuRow[][] {
  const { t, commands } = deps
  const settings = deps.settings()
  const { priceScale: scale, priceLabels: labels } = settings
  const mode = deps.scaleMode()
  const side = deps.side()

  const run = (command: string, arg?: unknown) => () => void commands.execute(command, arg)
  const apply = (next: PartialChartSettings) => run('chart.settings.apply', { settings: next })
  const hint = (command: string): { shortcut?: string } => {
    const shortcut = deps.shortcut(command)
    return shortcut ? { shortcut } : {}
  }
  /** A row that turns one of the price labels' settings over. */
  const label = (text: string, on: boolean, next: (on: boolean) => ChartSettings['priceLabels'] extends infer L ? Partial<L> : never): ScaleMenuRow => ({
    label: text,
    checked: on,
    run: apply({ priceLabels: next(!on) }),
  })
  /** A row for a scale mode: pressing the mode that stands goes back to the regular scale. */
  const modeRow = (id: ScaleMode, text: string, command?: string): ScaleMenuRow => ({
    label: text,
    checked: mode === id,
    ...(command ? hint(command) : {}),
    run: run(mode === id ? 'chart.scale.normal' : `chart.scale.${id}`),
  })

  const ratio = deps.ratio()
  const extended = deps.extendedHours()

  return [
    [{ label: t('menu.resetPriceScale'), icon: 'reset', ...hint('chart.view.reset'), run: run('chart.scale.reset') }],
    [
      { label: t('menu.autoFitScale'), checked: deps.autoScale(), run: run('chart.scale.toggleAuto') },
      {
        label: t('settings.lockPriceToBarRatio'),
        checked: scale.lockPriceToBarRatio,
        // A ratio holds only on a regular scale.
        disabled: mode !== 'normal',
        ...(ratio !== null ? { shortcut: ratio.toFixed(4) } : {}),
        run: apply({ priceScale: { lockPriceToBarRatio: !scale.lockPriceToBarRatio } }),
      },
      { label: t('menu.scalePriceChartOnly'), checked: scale.scalePriceChartOnly, run: apply({ priceScale: { scalePriceChartOnly: !scale.scalePriceChartOnly } }) },
      { label: t('menu.invertScale'), checked: scale.invertScale, ...hint('chart.scale.toggleInvert'), run: run('chart.scale.toggleInvert') },
    ],
    [
      modeRow('normal', t('menu.scaleRegular')),
      modeRow('percent', t('menu.scalePercent'), 'chart.scale.togglePercent'),
      modeRow('indexed', t('menu.scaleIndexed')),
      modeRow('log', t('menu.scaleLogarithmic'), 'chart.scale.toggleLog'),
    ],
    [{ label: t(side === 'right' ? 'menu.moveScaleLeft' : 'menu.moveScaleRight'), run: apply({ priceScale: { placement: side === 'right' ? 'left' : 'right' } }) }],
    [
      {
        label: t('menu.scaleLabels'),
        rows: [
          [
            label(t('menu.labelSymbolName'), labels.symbolName, (symbolName) => ({ symbolName })),
            label(t('menu.labelSymbolValue'), labels.symbolValue, (symbolValue) => ({ symbolValue })),
            label(t('menu.labelPreviousClose'), labels.previousCloseValue, (previousCloseValue) => ({ previousCloseValue })),
            { ...label(t('menu.labelExtendedHours'), labels.extendedHoursValue, (extendedHoursValue) => ({ extendedHoursValue })), disabled: !extended },
            label(t('menu.labelHighLow'), labels.highLowValue, (highLowValue) => ({ highLowValue })),
            label(t('menu.labelBidAsk'), labels.bidAskValue, (bidAskValue) => ({ bidAskValue })),
            label(t('menu.labelIndicatorName'), labels.indicatorLabelName, (indicatorLabelName) => ({ indicatorLabelName })),
            label(t('menu.labelIndicatorValue'), labels.indicatorLabelValue, (indicatorLabelValue) => ({ indicatorLabelValue })),
            label(t('settings.countdown'), labels.countdown, (countdown) => ({ countdown })),
          ],
          [label(t('settings.noOverlappingLabels'), labels.noOverlappingLabels, (noOverlappingLabels) => ({ noOverlappingLabels }))],
        ],
      },
      {
        label: t('menu.scaleLines'),
        rows: [
          [
            label(t('menu.linePrice'), labels.symbolLine, (symbolLine) => ({ symbolLine })),
            label(t('menu.linePreviousClose'), labels.previousCloseLine, (previousCloseLine) => ({ previousCloseLine })),
            { ...label(t('menu.lineExtendedHours'), labels.extendedHoursLine, (extendedHoursLine) => ({ extendedHoursLine })), disabled: !extended },
            label(t('menu.lineHighLow'), labels.highLowLine, (highLowLine) => ({ highLowLine })),
            label(t('menu.lineBidAsk'), labels.bidAskLine, (bidAskLine) => ({ bidAskLine })),
          ],
        ],
      },
      label(t('settings.plusButton'), labels.plusButton, (plusButton) => ({ plusButton })),
    ],
    [{ label: t('menu.moreSettings'), icon: 'settings', run: run('chart.settings.open', { page: 'scales' }) }],
  ]
}

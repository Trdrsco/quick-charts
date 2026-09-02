// The built-in indicators as the chart ships them: the chart-indicators seam's registry, typed at
// this boundary against the widget's own definition contract and the chart's catalog keys. The
// seam declares its manifest grammar in its own terms, so the spread below is the compile-time
// proof that every built-in IS an IndicatorDefinition; the catalog-key narrowing is proven by the
// package test that resolves every key through the English source.
import { BUILT_IN_INDICATORS as REGISTRY, type BuiltInIndicator as SeamBuiltInIndicator, type IndicatorCategory } from '@trdrs/chart-indicators'
import type { ChartMessageKey } from './i18n'
import type { IndicatorDefinition } from './widget/options'

export type { IndicatorCategory }

/** One of the 23 built-in indicators: a plain `IndicatorDefinition` plus its catalog identity.
 *  `nameKey` and `descriptionKey` resolve through any `ChartI18n`; `tag` is the locale-neutral
 *  short mark a legend chip wears; `plotTitles` and `inputTitles` label a settings surface. */
export interface BuiltInIndicator extends IndicatorDefinition {
  readonly id: string
  readonly tag: string
  readonly category: IndicatorCategory
  readonly nameKey: ChartMessageKey
  readonly descriptionKey: ChartMessageKey
  readonly plotTitles: Readonly<Record<string, string>>
  readonly inputTitles: Readonly<Record<string, string>>
}

const typed = (d: SeamBuiltInIndicator): BuiltInIndicator => ({
  ...d,
  nameKey: d.nameKey as ChartMessageKey,
  descriptionKey: d.descriptionKey as ChartMessageKey,
})

/** The 23 built-in indicators in picker order: moving averages, bands and channels, oscillators,
 *  volume. Each mounts through `ChartWidgetOptions.indicators` like any host definition. */
export const BUILT_IN_INDICATORS: readonly BuiltInIndicator[] = REGISTRY.map(typed)

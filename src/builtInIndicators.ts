// The built-in indicators as the chart ships them: the internal indicator module's registry, typed at
// this boundary against the widget's own definition contract and the chart's catalog keys. The
// seam declares its manifest grammar in its own terms, so the spread below is the compile-time
// proof that every built-in IS an IndicatorDefinition; the catalog-key narrowing is proven by the
// package test that resolves every key through the English source.
import { BUILT_IN_INDICATORS as REGISTRY, type BuiltInIndicator as SeamBuiltInIndicator, type IndicatorCategory } from './internal/indicators/index'
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

/** The ten default study colors, dealt in order as instances are minted so two studies added one
 *  after another never paint the same hue and a viewer can tell them apart at a glance. Ten because
 *  the eleventh add wraps to the first: distinctness among what is on screen, not an endless supply.
 *  A chart's own data colors, like the compare palette beside it: a host overrides one per instance
 *  and a theme mode does not re-resolve them. */
export const INDICATOR_PALETTE = ['#2196f3', '#ff9800', '#26a69a', '#e91e63', '#9c27b0', '#00bcd4', '#8bc34a', '#ffc107', '#f44336', '#3f51b5'] as const

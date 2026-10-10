// The chart handle's settings members, as the settings dialog reads and writes them: the effective
// settings, a viewer partial applied over them, and the viewer partial dropped.
import type { ChartSettings, PartialChartSettings } from '../../settings/schema'

declare module '../../widget/chart' {
  interface ChartHandle {
    settings(): ChartSettings
    applySettings(partial: PartialChartSettings): void
    resetSettings(): void
  }
}

export {}

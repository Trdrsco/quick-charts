// The Mode-B (turnkey) consumer: a fresh project installs the chart and the engine backend tarballs
// and mounts the chart over the engine datafeed, the integration the onboarding guide teaches. Chart
// trading is a private organ and is not part of the public install.
// Compiling against the SHIPPED d.ts (skipLibCheck off) is the gate; no workspace source is
// reachable from here.
import { createChart } from 'quickcharts'
import { engineDatafeed, EngineError, engineApi } from '@trdrs/chart-engine'
import type { HistoryResponse, PositionRow } from '@trdrs/engine-wire'

// The transport rides the page's engine session cookie; a consumer configures nothing here.

export function mount(container: HTMLElement) {
  const widget = createChart({
    container,
    datafeed: engineDatafeed,
  })
  return widget
}

// The slice api and the wire types are part of the shipped surface.
export async function lastClose(): Promise<number | null> {
  try {
    const h: HistoryResponse = await engineApi.marketHistory('ES', '1d', { countBack: 1 })
    return h.bars.at(-1)?.c ?? null
  } catch (e) {
    if (e instanceof EngineError) return null
    throw e
  }
}

export type { PositionRow }

// The Mode-B (turnkey) consumer: a fresh project installs the chart + the engine backend tarballs
// and composes the full trading platform — the exact integration the onboarding guide teaches.
// Compiling against the SHIPPED d.ts (skipLibCheck off) is the gate; no workspace source is
// reachable from here.
import { createChart } from '@trdrs/chart'
import { createEngineTradingAdapter, engineDatafeed, useHandoffAuth, EngineError, engineApi } from '@trdrs/chart-engine'
import type { HistoryResponse, PositionRow } from '@trdrs/engine-wire'

// A server-to-server or embedded consumer points the transport at its engine + bearer once.
useHandoffAuth('https://engine.example.com', 'trdrs_sk_example')

export function mount(container: HTMLElement) {
  const widget = createChart({
    container,
    datafeed: engineDatafeed,
    trading: createEngineTradingAdapter({ broker: 'rithmic', account: 'ACC-1' }),
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

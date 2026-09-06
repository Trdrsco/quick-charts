// The root-only consumer: an application that never imports the REST adapter, whose bundle must
// carry none of it.
import { createChart } from 'quickcharts'

const datafeed = {
  search: async () => [],
  resolve: async () => null,
  history: async () => ({ bars: [], noData: true }),
  subscribeBars: () => () => undefined,
}

const container = document.getElementById('chart')
if (container) console.log(createChart({ container, datafeed, symbol: 'ES', timeframe: '1m' }))

// The full consumer: the root, the drawings subpath, the REST adapter and the stylesheet, used the
// way an application uses them, so the bundler keeps exactly what an application's build keeps.
import '@trdrs/quickcharts/styles.css'
import { createChart } from '@trdrs/quickcharts'
import { drawingTools } from '@trdrs/quickcharts/drawings'
import { createRestSaveLoadAdapter } from '@trdrs/quickcharts/adapters/rest'

const datafeed = {
  search: async () => [],
  resolve: async () => null,
  history: async () => ({ bars: [], noData: true }),
  subscribeBars: () => () => undefined,
}

const saves = createRestSaveLoadAdapter({ baseUrl: '/saves', request: (url, init) => fetch(url, init) })

const container = document.getElementById('chart')
if (container) {
  const widget = createChart({ container, datafeed, symbol: 'ES', timeframe: '1m' })
  console.log(widget, saves, drawingTools.all().length)
}

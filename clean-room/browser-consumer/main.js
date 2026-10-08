import '@trdrs/quickcharts/styles.css'
import { createChart } from '@trdrs/quickcharts'
import { drawingTools } from '@trdrs/quickcharts/drawings'
import { runConformance, scriptedFeed } from './conformance/index.ts'
window.runChartConformance = () => runConformance({ createWidget: options => createChart(options), document })
// The browser checks that read a painted surface mount their own chart from the installed package,
// over the conformance suite's scripted feed.
window.quickcharts = { createChart, drawingTools, scriptedFeed }
// One chart over the scripted feed at the page's top-left, for the browser suite's own gestures. The
// widget stays on the window so a spec reaches it from the page.
window.mountChart = async (options = {}) => {
  const container = document.createElement('div')
  container.style.cssText = 'position:absolute;left:0;top:0;width:900px;height:520px'
  document.body.appendChild(container)
  const widget = createChart({ container, datafeed: scriptedFeed(), symbol: 'ALPHA', timeframe: '1m', ...options })
  await widget.ready()
  window.chartWidget = widget
  return true
}

import '@trdrs/quickcharts/styles.css'
import { createChart } from '@trdrs/quickcharts'
import { drawingTools } from '@trdrs/quickcharts/drawings'
import { runConformance, scriptedFeed } from './conformance/index.ts'
window.runChartConformance = () => runConformance({ createWidget: options => createChart(options), document })
// The browser checks that read a painted surface mount their own chart from the installed package,
// over the conformance suite's scripted feed.
window.quickcharts = { createChart, drawingTools, scriptedFeed }

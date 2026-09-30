import 'quickcharts/styles.css'
import { createChart } from 'quickcharts'
import { runConformance } from './conformance/index.ts'
window.runChartConformance = () => runConformance({ createWidget: options => createChart(options), document })

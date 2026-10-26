// @vitest-environment happy-dom
// One answer, the canvas's tone, inks everything drawn over the plot. A light canvas reads as the
// light mode and a dark one as the dark mode, whichever mode is in effect. Where the two differ, the
// chart's chrome (the legend, the scale's boxes, the pane and navigation buttons, the corner mark)
// wears that mode's colors, and the factory scale text and lines, grid and watermark are that mode's,
// while a color the host or the viewer named stays theirs.
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ChartDatafeed, FeedBar } from '../../src/datafeed'
import { chartSettingsDefaults, chartSettingsDefaultsOn } from '../../src/settings/defaults'
import { canvasInk, canvasTone } from '../../src/theme/canvasInk'
import { CANVAS_INK_ATTRIBUTE, canvasInkSelector, composeStylesheet, cssVarName } from '../../src/theme/css-contract'
import { BUILT_IN_THEMES, DARK_THEME, LIGHT_THEME } from '../../src/theme/palettes'
import { THEME_MODES, THEME_ROLES } from '../../src/theme/schema'
import { createChart, type ChartWidget } from '../../src/widget/create'
import { authoredStylesheet } from '../theme/stylesheetSource'
import { fakeRenderer, lastRenderer } from './rendererFake'

vi.mock('lightweight-charts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('lightweight-charts')>()
  const { createFakeChart } = await import('./rendererFake')
  return { ...actual, createChart: createFakeChart }
})

void fakeRenderer

describe('the canvas tone', () => {
  it('reads a white or light grey canvas as light and a black or dark one as dark', () => {
    expect(canvasTone('#ffffff')).toBe('light')
    expect(canvasTone('#e0e0e0')).toBe('light')
    expect(canvasTone('#000000')).toBe('dark')
    expect(canvasTone('#1e222d')).toBe('dark')
    expect(canvasTone(LIGHT_THEME['canvas.background'])).toBe('light')
    expect(canvasTone(DARK_THEME['canvas.background'])).toBe('dark')
    expect(canvasTone('not a color')).toBeNull()
  })

  it('names the other mode only where the canvas has its lightness', () => {
    expect(canvasInk('#ffffff', 'dark')).toBe('light')
    expect(canvasInk('#333333', 'dark')).toBeNull()
    expect(canvasInk('#000000', 'light')).toBe('dark')
    expect(canvasInk('#f0f0f0', 'light')).toBeNull()
  })

  it('reads a translucent canvas over the mode\'s own canvas', () => {
    expect(canvasInk('rgba(255, 255, 255, 0.1)', 'dark')).toBeNull()
    expect(canvasInk('rgba(255, 255, 255, 0.9)', 'dark')).toBe('light')
  })
})

describe('the factory values over a canvas', () => {
  it('takes the inking mode\'s scale text and lines, grid and watermark, and keeps the canvas and every other leaf', () => {
    const base = chartSettingsDefaults(DARK_THEME)
    const over = chartSettingsDefaultsOn(DARK_THEME, 'light')
    const light = chartSettingsDefaults(LIGHT_THEME)
    expect(over.canvas.scaleTextColor).toBe(light.canvas.scaleTextColor)
    expect(over.canvas.scaleLineColor).toBe(light.canvas.scaleLineColor)
    expect(over.canvas.verticalGridColor).toBe(light.canvas.verticalGridColor)
    expect(over.canvas.horizontalGridColor).toBe(light.canvas.horizontalGridColor)
    expect(over.canvas.watermarkColor).toBe(light.canvas.watermarkColor)
    expect(over.canvas.background).toBe(base.canvas.background)
    expect(over.canvas.backgroundBottom).toBe(base.canvas.backgroundBottom)
    expect(over.candles).toEqual(base.candles)
    expect(over.priceLabels).toEqual(base.priceLabels)
    expect(chartSettingsDefaultsOn(DARK_THEME, null)).toEqual(base)
  })
})

describe('the stylesheet\'s canvas-ink blocks', () => {
  const blocks = THEME_MODES.map((mode) => ({ mode, theme: BUILT_IN_THEMES[mode] }))
  const durationRoles = THEME_ROLES.filter((role) => role.kind === 'duration').map((role) => role.id)
  const colorRoles = THEME_ROLES.filter((role) => role.kind === 'color').map((role) => role.id)
  const css = composeStylesheet({ blocks, durationRoles, colorRoles, structural: authoredStylesheet() })
  const block = (mode: 'light' | 'dark'): string => {
    const start = css.indexOf(`${canvasInkSelector(mode)} {`)
    expect(start, mode).toBeGreaterThan(-1)
    return css.slice(start, css.indexOf('}', start))
  }

  it('declares every color role of each mode under the attribute, and no other role', () => {
    for (const mode of THEME_MODES) {
      const body = block(mode)
      for (const role of colorRoles) expect(body, role).toContain(`${cssVarName(role)}: ${BUILT_IN_THEMES[mode][role]};`)
      for (const role of THEME_ROLES.filter((r) => r.kind !== 'color')) expect(body, role.id).not.toContain(`${cssVarName(role.id)}:`)
    }
  })

  it('writes the blocks in the tokens layer, after the mode blocks, scoped to the widget root', () => {
    const tokens = css.slice(css.indexOf('@layer quickcharts.tokens {'), css.indexOf('@layer quickcharts.chart {'))
    expect(tokens.indexOf(canvasInkSelector('light'))).toBeGreaterThan(tokens.indexOf('[data-qc-theme="dark"] {'))
    expect(canvasInkSelector('dark')).toBe(`[data-qc-theme] [${CANVAS_INK_ATTRIBUTE}="dark"]`)
  })

  it('writes no canvas-ink block for a composition that names no color roles', () => {
    expect(composeStylesheet({ blocks, durationRoles, structural: '' })).not.toContain(CANVAS_INK_ATTRIBUTE)
  })
})

const bar = (time: number, close = 100): FeedBar => ({ t: time, o: close, h: close + 1, l: close - 1, c: close, v: 10 })
const datafeed: ChartDatafeed = {
  search: async () => ({ hits: [], hasMore: false }),
  resolve: async () => null,
  history: async () => ({ bars: Array.from({ length: 40 }, (_, index) => bar(1_700_000_000 + index * 60, 100 + index)), noData: false }),
  subscribeBars: () => () => undefined,
}

const mounted: ChartWidget[] = []
afterEach(() => {
  for (const widget of mounted.splice(0)) widget.dispose()
  document.body.replaceChildren()
})

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

describe('a mounted chart', () => {
  it('stands its chrome on a canvas the host names from the first frame', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const widget = createChart({ container, datafeed, symbol: 'ES', timeframe: '1m', theme: { mode: 'dark' }, settings: { canvas: { background: '#ffffff' } }, features: { drawings: false, replay: false } })
    mounted.push(widget)
    const chrome = container.querySelector<HTMLElement>('.qc-chrome')!
    expect(chrome.getAttribute(CANVAS_INK_ATTRIBUTE)).toBe('light')
    expect(chrome.style.getPropertyValue('--qcd-chart-background')).toBe('#ffffff')
    expect(widget.activeChart().settings().canvas.scaleTextColor).toBe(LIGHT_THEME['scale.text'])
    await settle()
  })

  it('inks its chrome and its scales by the canvas the viewer sets, and hands them back to the mode on a matching canvas', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const widget = createChart({ container, datafeed, symbol: 'ES', timeframe: '1m', theme: { mode: 'dark' }, features: { drawings: false, replay: false } })
    mounted.push(widget)
    await settle()
    const chart = widget.activeChart()
    const chrome = container.querySelector<HTMLElement>('.qc-chrome')!
    const textColor = (): unknown => {
      const layouts = lastRenderer().chartOptions.map((o) => (o.layout as { textColor?: string } | undefined)?.textColor).filter(Boolean)
      return layouts.at(-1)
    }
    expect(chrome.hasAttribute(CANVAS_INK_ATTRIBUTE)).toBe(false)
    expect(chart.settings().canvas.scaleTextColor).toBe(DARK_THEME['scale.text'])

    chart.applySettings({ canvas: { background: '#ffffff' } })
    expect(chrome.getAttribute(CANVAS_INK_ATTRIBUTE)).toBe('light')
    for (const part of ['.qc-legend', '.qc-plot-corner']) expect(container.querySelector(part)?.closest(`[${CANVAS_INK_ATTRIBUTE}="light"]`), part).toBe(chrome)
    expect(chart.settings().canvas.scaleTextColor).toBe(LIGHT_THEME['scale.text'])
    expect(chart.settings().canvas.horizontalGridColor).toBe(LIGHT_THEME['scale.grid'])
    expect(textColor()).toBe(LIGHT_THEME['scale.text'])

    // A scale color the viewer chose stays theirs over any canvas.
    chart.applySettings({ canvas: { scaleTextColor: '#ff0000' } })
    expect(chart.settings().canvas.scaleTextColor).toBe('#ff0000')
    chart.applySettings({ canvas: { scaleTextColor: DARK_THEME['scale.text'], background: '#101010' } })
    expect(chrome.hasAttribute(CANVAS_INK_ATTRIBUTE)).toBe(false)

    // In light mode a black canvas takes the dark mode's ink and scale.
    widget.theme.setMode('light')
    chart.resetSettings()
    chart.applySettings({ canvas: { background: '#000000' } })
    expect(chrome.getAttribute(CANVAS_INK_ATTRIBUTE)).toBe('dark')
    expect(chart.settings().canvas.scaleTextColor).toBe(DARK_THEME['scale.text'])
  })
})

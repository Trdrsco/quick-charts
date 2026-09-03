// @vitest-environment happy-dom
// The level menu as the chart mounts it, over a real registry: a row is offered exactly when its
// command would run, and picking it runs that command and nothing else. The paste row is the one
// whose presence follows chart state (a copied drawing on the clipboard), so it is the row pinned.
import { afterEach, describe, expect, it } from 'vitest'
import { createChartI18n } from '../../src/i18n'
import { createPriceFormatter } from '../../src/priceFormatter'
import { createCommandRegistry } from '../../src/widget/commands'
import { attachMenuPlane, MENU_COMMAND } from '../../src/widget/menu'
import { fakeChart } from '../drawings/fakeChart'

function rig(canPaste: boolean) {
  const fake = fakeChart()
  const gestures = document.createElement('div')
  const chrome = document.createElement('div')
  document.body.append(gestures, chrome)
  const ran: string[] = []
  const registry = createCommandRegistry()
  for (const id of ['chart.view.reset', 'chart.price.copy', 'chart.drawings.paste', 'chart.indicators.removeAll', 'chart.drawings.removeAll']) {
    registry.registry.register({ id, scope: 'chart', label: 'command.drawingPaste', available: () => id !== 'chart.drawings.paste' || canPaste, execute: () => void ran.push(id) })
  }
  const plane = attachMenuPlane({
    chart: fake.chart,
    series: () => fake.series,
    gestures,
    chrome,
    i18n: createChartI18n(),
    commands: registry.registry,
    formatter: () => createPriceFormatter({ pricescale: 100, minmov: 1 }),
    minMove: () => 0.01,
    symbol: () => 'ES',
    timeframe: () => '5m',
    indicatorCount: () => 0,
    drawingCount: () => 1,
    extensions: () => null,
    setLevel: () => undefined,
  })
  const rows = () => [...chrome.querySelectorAll<HTMLButtonElement>('.qc-menu-row')]
  const row = (label: string) => rows().find((r) => r.querySelector('.qc-menu-label')?.textContent === label) ?? null
  return { plane, ran, rows, row, dispose: () => plane.destroy() }
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('the level menu over the registry', () => {
  it('names a command for every row it renders, including paste', () => {
    expect(MENU_COMMAND.paste).toBe('chart.drawings.paste')
    expect(MENU_COMMAND.settings).toBeUndefined()
  })

  it('offers Paste while the paste command would run, and picking it runs that command', () => {
    const r = rig(true)
    expect(r.plane.raiseAt(20, 50)).toBe(true)
    const paste = r.row('Paste')!
    expect(paste).toBeTruthy()
    expect(paste.querySelector('.qc-menu-hint')?.textContent).toBe('Ctrl + V')
    paste.click()
    expect(r.ran).toEqual(['chart.drawings.paste'])
    r.dispose()
  })

  it('omits Paste while the paste command would not run', () => {
    const r = rig(false)
    expect(r.plane.raiseAt(20, 50)).toBe(true)
    expect(r.row('Paste')).toBeNull()
    expect(r.row('Remove 1 drawing')).toBeTruthy()
    r.dispose()
  })
})
